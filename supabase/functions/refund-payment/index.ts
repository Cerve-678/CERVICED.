import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@17.4.0?target=deno';

// Step 4 of the Connect build: refunds. Provider-initiated or admin, never
// automatic (handoff decision). Refunds the client's FULL payment for a
// booking INCLUDING the platform fee — CERVICED does not keep its fee on a
// refund (user decision 2026-09-29; the earlier "keep fee on refund" option
// was dropped as likely unlawful in the UK). The client's money comes back out
// of the platform balance; if the provider was already paid, their share is
// reclaimed with a transfer reversal so the platform nets out whole.
//
// SCOPE: this function moves money and keeps the payout ledger honest. It does
// NOT cancel the booking or fire cancellation notifications — those are owned
// by the existing cancel flow and its DB triggers (touching booking.status
// here would risk double-notifying, the classic booking-domain trap). Pair a
// refund with the cancel action; this is the money half only.
//
// AUTH: the owning provider (their JWT) OR an admin (service-role bearer —
// there is no in-app 'admin' user role, so admin refunds are a server/tooling
// call with the service role key). A client can never invoke this.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia',
});

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

interface RequestBody {
  bookingId: string;
  reason?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const isServiceCaller = authHeader === `Bearer ${serviceKey}`;

    const body: RequestBody = await req.json();
    if (!body.bookingId) {
      return json({ error: 'Invalid request' }, 400);
    }

    // Load the booking with the service role (we need private payment fields).
    const { data: booking, error: bookingError } = await admin
      .from('bookings')
      .select('id, provider_id, payment_intent_id, amount_paid, payment_status')
      .eq('id', body.bookingId)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return json({ error: 'Booking not found' }, 404);

    // Authorise: service-role caller (admin) passes; otherwise the caller must
    // be the provider who owns this booking.
    if (!isServiceCaller) {
      if (!authHeader) return json({ error: 'Missing authorization' }, 401);
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) return json({ error: 'Invalid session' }, 401);

      const { data: provider, error: provErr } = await admin
        .from('providers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (provErr) throw provErr;
      if (!provider || provider.id !== booking.provider_id) {
        return json({ error: 'You can only refund your own bookings.' }, 403);
      }
    }

    // Idempotent: an already-refunded booking is a no-op success.
    if (booking.payment_status === 'refunded') {
      return json({ status: 'already_refunded' }, 200);
    }
    if (!booking.payment_intent_id || Number(booking.amount_paid) <= 0) {
      return json({ error: 'This booking has no captured payment to refund.' }, 409);
    }

    const refundPence = Math.round(Number(booking.amount_paid) * 100);
    if (!Number.isSafeInteger(refundPence) || refundPence <= 0) {
      return json({ error: 'Invalid refund amount' }, 400);
    }

    // 1) Refund the client from the platform balance. Partial refund of the
    // batch PaymentIntent (a batch can cover several bookings); this returns
    // exactly what this booking's client paid, fee included. Idempotency key
    // keyed on the booking so a retry returns the same refund.
    const refund = await stripe.refunds.create(
      {
        payment_intent: booking.payment_intent_id,
        amount: refundPence,
        metadata: { booking_id: booking.id, reason: body.reason ?? 'provider_or_admin_refund' },
      },
      { idempotencyKey: `refund_${booking.id}` },
    );

    // 2) Settle the provider's payout row so the ledger matches reality.
    const { data: payout, error: payoutErr } = await admin
      .from('provider_payouts')
      .select('id, status, stripe_transfer_id, payout_amount')
      .eq('booking_id', booking.id)
      .eq('provider_id', booking.provider_id)
      .maybeSingle();
    if (payoutErr) throw payoutErr;

    if (payout) {
      if (payout.status === 'held') {
        // Never transferred — just cancel it; nothing to claw back.
        await admin.from('provider_payouts')
          .update({ status: 'cancelled', failure_reason: 'refunded before release' })
          .eq('id', payout.id).eq('status', 'held');
      } else if (payout.status === 'transferred' && payout.stripe_transfer_id) {
        // Already paid — reclaim the provider's share into the platform
        // balance. Reversals don't need the connected account to hold funds.
        const reversal = await stripe.transfers.createReversal(
          payout.stripe_transfer_id,
          { amount: payout.payout_amount, metadata: { booking_id: booking.id } },
          { idempotencyKey: `reversal_${payout.id}` },
        );
        await admin.from('provider_payouts')
          .update({ status: 'reversed', stripe_reversal_id: reversal.id })
          .eq('id', payout.id).eq('status', 'transferred');
      }
      // 'cancelled'/'reversed'/'failed' already: nothing further to do.
    }

    // 3) Record the client-side refund on the booking (money side only —
    // booking status/notifications stay with the cancel flow).
    const { error: writeErr } = await admin
      .from('bookings')
      .update({
        payment_status: 'refunded',
        refunded_amount: booking.amount_paid,
        refunded_at: new Date().toISOString(),
        stripe_refund_id: refund.id,
      })
      .eq('id', booking.id);
    if (writeErr) {
      // The money already moved; failing to record it must be loud, not
      // silent, so it can be reconciled.
      console.error(`[refund-payment] refund ${refund.id} succeeded but booking write failed for ${booking.id}: ${String(writeErr)}`);
      throw writeErr;
    }

    return json({ status: 'refunded', refundId: refund.id, amount: refundPence }, 200);
  } catch (err) {
    console.error(`[refund-payment] fatal: ${String(err)}`);
    return json({ error: 'Could not process the refund. Please try again.' }, 500);
  }
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
