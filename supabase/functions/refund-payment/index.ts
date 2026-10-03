import { reconcileRefund } from '../_shared/reconcileRefund.ts';
import { planRefund } from '../_shared/refundPlan.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.100.0';
import Stripe from 'npm:stripe@17.4.0';

// Step 4 of the Connect build: refunds. Provider-initiated or admin, never
// automatic for a client cancellation (apply-cancellation-refund owns that).
//
// FULL or PARTIAL (user decisions 2026-09-29, 2026-10-03 — maths in
// _shared/refundPlan.ts):
//   • full    → everything not yet refunded, INCLUDING the platform fee;
//               CERVICED does not keep its fee on a full refund (keeping it was
//               dropped as likely unlawful in the UK).
//   • partial → an amount out of the provider's remaining share only;
//               CERVICED keeps its fee.
// A booking can be refunded more than once (e.g. the policy kept the deposit
// and the provider later gives it back). The client's money comes out of the
// platform balance; the provider's share is taken back from their payout
// (lowered if still held, transfer-reversed if already paid) by reconcileRefund.
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
  /** Omit for a full refund. Otherwise pence out of the provider's share. */
  amountPence?: number | null;
  /** One per tap in the app, so a retry can't refund twice. */
  requestId?: string;
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
      .select('id, provider_id, payment_intent_id, amount_paid, service_charge')
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

    // What is left to refund comes from Stripe itself (every refund for this
    // booking, pending included), not from our own columns — so a refund that
    // Stripe issued but we failed to record still counts.
    if (!booking.payment_intent_id || Number(booking.amount_paid) <= 0) {
      return json({ error: 'This booking has no captured payment to refund.' }, 409);
    }
    const requestId = typeof body.requestId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(body.requestId)
      ? body.requestId
      : null;
    let alreadyRefundedPence = 0;
    let pendingRefund = false;
    for await (const r of stripe.refunds.list({ payment_intent: booking.payment_intent_id, limit: 100 })) {
      if (r.metadata?.booking_id !== booking.id) continue;
      // Same request retried (double tap, network retry): hand back the
      // refund it already made instead of making another.
      if (requestId && r.metadata?.request_id === requestId) {
        await reconcileRefund(admin, stripe, r);
        return r.status === 'succeeded'
          ? json({ status: 'refunded', refundId: r.id, amount: r.amount }, 200)
          : json({ status: r.status, refundId: r.id }, 202);
      }
      if (r.status === 'succeeded' || r.status === 'pending' || r.status === 'requires_action') {
        alreadyRefundedPence += r.amount;
        if (r.status !== 'succeeded') pendingRefund = true;
      }
    }
    // Known limit: two DIFFERENT requests landing at the same instant could
    // both pass this check. Stripe still caps the total at what was paid and
    // reconcileRefund never takes a payout below zero, so the worst case is
    // the platform covering the overlap — not the client being over-refunded.
    if (pendingRefund) {
      return json({ error: 'A refund for this booking is still processing. Try again once it has gone through.' }, 409);
    }

    // What the provider still holds: their payout row if there is one,
    // otherwise the service share (amount paid less the platform fee) not yet
    // refunded.
    const { data: payout, error: payoutErr } = await admin.from('provider_payouts')
      .select('status, payout_amount').eq('booking_id', booking.id).maybeSingle();
    if (payoutErr) throw payoutErr;
    const paidPence = Math.round(Number(booking.amount_paid) * 100);
    const feePence = Math.round(Number(booking.service_charge ?? 0) * 100);
    const providerHeldPence = payout
      ? (payout.status === 'reversed' || payout.status === 'cancelled' ? 0 : Number(payout.payout_amount))
      : Math.max(0, paidPence - feePence - alreadyRefundedPence);

    const request = body.amountPence === undefined || body.amountPence === null ? 'full' : Number(body.amountPence);
    const plan = planRefund({ amountPaidPence: paidPence, alreadyRefundedPence, providerHeldPence, request });
    if (!plan.ok) {
      if (request === 'full' && alreadyRefundedPence >= paidPence) return json({ status: 'already_refunded' }, 200);
      return json({ error: plan.error }, 409);
    }

    // Idempotency: a request id from the app ties retries of one tap to one
    // refund. Server callers (refund_booking_async on a provider cancel) send
    // none and only ever ask for 'full', so the booking id alone is the key —
    // the same key this function always used for its one full refund.
    const idempotencyKey = requestId ? `refund_${booking.id}_${requestId}` : `refund_${booking.id}`;
    const refund = await stripe.refunds.create(
      {
        payment_intent: booking.payment_intent_id,
        amount: plan.refundPence,
        metadata: {
          booking_id: booking.id,
          reason: (typeof body.reason === 'string' && body.reason ? body.reason : 'provider_or_admin_refund').slice(0, 450),
          kind: isServiceCaller ? 'admin' : 'provider',
          payout_adjust_pence: String(plan.payoutAdjustPence),
          ...(requestId ? { request_id: requestId } : {}),
        },
      },
      { idempotencyKey },
    );

    await reconcileRefund(admin, stripe, refund);
    if (refund.status !== 'succeeded') {
      return json({ status: refund.status, refundId: refund.id }, 202);
    }

    return json({ status: 'refunded', refundId: refund.id, amount: refund.amount }, 200);
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

