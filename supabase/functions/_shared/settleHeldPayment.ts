import type Stripe from 'npm:stripe@17.4.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.100.0';
import { escapeHtml } from './escapeHtml.ts';
import { sendSupportAlert } from './supportAlert.ts';

// A checkout whose every booking is a request is finalised with the card only
// authorised (finalize_checkout_held). This settles it once the requests are
// answered: the first acceptance captures what is still standing, and if every
// request ends unaccepted the hold is released. See
// supabase/migrations/20261112100000_request_card_hold.sql.
//
// The decision is made by begin_held_settlement under a row lock and recorded
// on the checkout, so a retry repeats the same Stripe call with the same
// idempotency key instead of deciding again.

export type HeldSettlement = 'none' | 'wait' | 'captured' | 'released';

interface Decision {
  action: 'none' | 'wait' | 'capture' | 'release';
  amount_pence: number | null;
  checkout_batch_id: string | null;
}

export async function settleHeldPayment(
  admin: SupabaseClient,
  stripe: Stripe,
  paymentIntentId: string,
): Promise<HeldSettlement> {
  const { data, error } = await admin.rpc('begin_held_settlement', { p_payment_intent_id: paymentIntentId });
  if (error) throw error;
  const decision = (Array.isArray(data) ? data[0] : data) as Decision | undefined;
  if (!decision || decision.action === 'none') return 'none';
  if (decision.action === 'wait') return 'wait';

  const batchId = decision.checkout_batch_id!;
  let intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  // What Stripe actually holds, passed to complete_held_settlement. Normally
  // the decided amount, or nothing on a release. If a stale concurrent settle
  // already captured the whole checkout, it's the full amount, and the
  // database refunds every booking that shouldn't keep its share.
  let capturedPence: number | null = null;

  if (decision.action === 'capture') {
    const amount = decision.amount_pence ?? 0;
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > intent.amount) {
      throw new Error(`Held capture amount ${amount} is outside 1..${intent.amount} for ${paymentIntentId}`);
    }
    if (intent.status === 'requires_capture') {
      intent = await stripe.paymentIntents.capture(
        paymentIntentId,
        { amount_to_capture: amount },
        { idempotencyKey: `held_capture_${batchId}` },
      );
    } else if (intent.status !== 'succeeded') {
      // The hold is gone but a provider has accepted: a booking now stands
      // unpaid. Never guess — tell support and leave the checkout 'settling'.
      // (Requests are answered within 24 hours, inside a card hold's 7 days,
      // so this should not happen.)
      await sendSupportAlert({
        subject: 'A held request payment could not be taken',
        html: `<p>A provider accepted a request, but its card hold could no longer be captured.</p>` +
          `<p>Payment: ${escapeHtml(paymentIntentId)}<br>Checkout: ${escapeHtml(batchId)}<br>Stripe status: ${escapeHtml(intent.status)}</p>` +
          `<p>The booking stands unpaid. The checkout stays 'settling' until someone resolves it.</p>`,
      }, 'settle-held-payment');
      throw new Error(`Held payment ${paymentIntentId} can't be captured: ${intent.status}`);
    }
    capturedPence = intent.amount_received;
  } else {
    if (intent.status === 'requires_capture') {
      await stripe.paymentIntents.cancel(paymentIntentId, {}, { idempotencyKey: `held_release_${batchId}` });
    } else if (intent.status === 'succeeded') {
      // Captured by a stale concurrent settle even though nothing was
      // accepted: complete_held_settlement refunds every booking.
      capturedPence = intent.amount_received;
    } else if (intent.status !== 'canceled') {
      throw new Error(`Held payment ${paymentIntentId} can't be released: ${intent.status}`);
    }
  }

  const { error: doneError } = await admin.rpc('complete_held_settlement', {
    p_payment_intent_id: paymentIntentId,
    p_captured_pence: capturedPence,
  });
  if (doneError) throw doneError;
  return capturedPence ? 'captured' : 'released';
}
