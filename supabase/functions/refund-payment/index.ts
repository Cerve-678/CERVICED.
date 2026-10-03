import { reconcileRefund } from '../_shared/reconcileRefund.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.100.0';
import Stripe from 'npm:stripe@17.4.0';

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
  httpClient: Stripe.createFetchHttpClient(),
});

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

interface RequestBody {
  bookingId: string;
  reason?: string;
}

Deno.serve(async (req: Request) => {
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
      .select('id, provider_id, payment_intent_id, amount_paid, payment_status, stripe_refund_id')
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
      // Reconcile again on retries in case reversal previously failed.
      const { data: recorded } = await admin.from('bookings').select('stripe_refund_id').eq('id', booking.id).single();
      if (recorded?.stripe_refund_id) await reconcileRefund(admin, stripe, await stripe.refunds.retrieve(recorded.stripe_refund_id));
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
    let previousRefund: Stripe.Refund | undefined;
    if (booking.stripe_refund_id) {
      previousRefund = await stripe.refunds.retrieve(booking.stripe_refund_id);
    } else {
      // Recover even after Stripe's idempotency window if the database write
      // failed after Stripe had already issued this booking's refund.
      for await (const candidate of stripe.refunds.list({ payment_intent: booking.payment_intent_id, limit: 100 })) {
        if (candidate.metadata?.booking_id === booking.id) { previousRefund = candidate; break; }
      }
    }
    const refund = previousRefund ?? await stripe.refunds.create(
      {
        payment_intent: booking.payment_intent_id,
        amount: refundPence,
        metadata: { booking_id: booking.id, reason: body.reason ?? 'provider_or_admin_refund' },
      },
      { idempotencyKey: `refund_${booking.id}` },
    );

    await reconcileRefund(admin, stripe, refund);
    if (refund.status !== 'succeeded') {
      return json({ status: refund.status, refundId: refund.id }, 202);
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

