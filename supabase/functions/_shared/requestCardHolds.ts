import type Stripe from 'npm:stripe@17.4.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.100.0';
import { escapeHtml } from './escapeHtml.ts';
import { sendSupportAlert } from './supportAlert.ts';

// One card hold per request in a checkout, charged only when its provider
// accepts. See supabase/migrations/20261113220000_request_card_hold.sql for
// the states and who decides what; this file only makes the Stripe calls.
//
//   placeRequestHolds  — right after a checkout is finalised, put a hold on
//                        the card the sheet used for each request not
//                        already on the sheet.
//   checkRequestHold   — read where a hold's bank check got to (the app after
//                        the client confirms, the webhook, the sweep).
//   settleRequestHold  — take or release a hold once its request is answered.
//   sweepRequestHolds  — the 5-minute safety net for all three.

/** Metadata key on a request hold's PaymentIntent. Deliberately not
 *  checkout_batch_id, which routes a payment to settleCheckout. */
export const REQUEST_HOLD_METADATA_KEY = 'request_card_hold_id';

const SWEEP_LIMIT = 100;

type PlacedOutcome = 'authorised' | 'needs_action' | 'refused' | 'lapsed' | 'failed';

interface HoldRow {
  id: string;
  booking_id: string | null;
  checkout_batch_id: string;
  user_id: string;
  amount_pence: number;
  currency: string;
  state: string;
  on_sheet: boolean;
  payment_intent_id: string | null;
  action_deadline: string | null;
  alerted_at: string | null;
}

const HOLD_COLUMNS = 'id, booking_id, checkout_batch_id, user_id, amount_pence, currency, state, on_sheet, payment_intent_id, action_deadline, alerted_at';

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

async function readHold(admin: SupabaseClient, holdId: string): Promise<HoldRow | null> {
  const { data, error } = await admin.from('request_card_holds').select(HOLD_COLUMNS).eq('id', holdId).maybeSingle();
  if (error) throw error;
  return (data as HoldRow | null) ?? null;
}

async function recordPlaced(
  admin: SupabaseClient, stripe: Stripe, holdId: string, intentId: string | null, outcome: PlacedOutcome,
): Promise<void> {
  const { data, error } = await admin.rpc('request_hold_placed', {
    p_hold_id: holdId, p_payment_intent_id: intentId, p_outcome: outcome,
  });
  if (error) throw error;
  // Approved too late for a request that can no longer be booked: give it back.
  if (data === 'release') await settleRequestHold(admin, stripe, holdId);
}

/** Cancel a hold payment that holds nothing worth keeping; never fails the caller. */
async function cancelQuietly(stripe: Stripe, intentId: string, holdId: string): Promise<void> {
  try {
    await stripe.paymentIntents.cancel(intentId, {}, { idempotencyKey: `request_hold_cancel_${holdId}` });
  } catch (err) {
    console.error(`[requestCardHolds] could not cancel ${intentId} for hold ${holdId}: ${String(err)}`);
  }
}

/** A hold payment's Stripe state, in request_hold_placed's terms. */
export function placedOutcomeOf(status: Stripe.PaymentIntent.Status): PlacedOutcome | null {
  switch (status) {
    case 'requires_capture': return 'authorised';
    case 'requires_action': return 'needs_action';
    // A failed bank check or a decline leaves the payment waiting for a new
    // card; a cancelled one holds nothing either.
    case 'requires_payment_method':
    case 'canceled': return 'refused';
    default: return null;
  }
}

async function placeOne(
  admin: SupabaseClient, stripe: Stripe, hold: HoldRow, customer: string, paymentMethod: string,
): Promise<void> {
  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.create({
      amount: hold.amount_pence,
      currency: hold.currency,
      customer,
      payment_method: paymentMethod,
      payment_method_types: ['card'],
      capture_method: 'manual',
      confirm: true,
      // The client is in the app: a bank check is shown there, by the
      // mobile SDK (request-card-hold hands it the payment).
      use_stripe_sdk: true,
      description: 'CERVICED request hold',
      metadata: { [REQUEST_HOLD_METADATA_KEY]: hold.id, user_id: hold.user_id, checkout_ref: hold.checkout_batch_id },
    }, { idempotencyKey: `request_card_hold_${hold.id}` });
  } catch (err) {
    const stripeErr = err as { type?: string; raw?: { payment_intent?: { id?: string } }; payment_intent?: { id?: string } };
    if (stripeErr.type === 'StripeCardError') {
      const intentId = stripeErr.payment_intent?.id ?? stripeErr.raw?.payment_intent?.id ?? null;
      await recordPlaced(admin, stripe, hold.id, intentId, 'refused');
      if (intentId) await cancelQuietly(stripe, intentId, hold.id);
      return;
    }
    throw err;
  }
  const outcome = placedOutcomeOf(intent.status);
  if (!outcome) throw new Error(`Request hold ${hold.id} came back ${intent.status}`);
  await recordPlaced(admin, stripe, hold.id, intent.id, outcome);
  if (outcome === 'refused' && intent.status !== 'canceled') await cancelQuietly(stripe, intent.id, hold.id);
}

/**
 * Places every request hold still planned for the checkout this sheet
 * payment belongs to. Idempotent: each hold's payment is created with its
 * own idempotency key, and request_hold_placed ignores a second answer.
 * A failure on one hold doesn't stop the others; the sweep retries.
 */
export async function placeRequestHolds(
  admin: SupabaseClient, stripe: Stripe, sheetIntent: Stripe.PaymentIntent,
): Promise<void> {
  const batchId = sheetIntent.metadata.checkout_batch_id;
  if (!batchId) return;
  const { data, error } = await admin.from('request_card_holds').select(HOLD_COLUMNS)
    .eq('checkout_batch_id', batchId).eq('state', 'planned').eq('on_sheet', false)
    .order('created_at', { ascending: true }).limit(50);
  if (error) throw error;
  const holds = (data ?? []) as HoldRow[];
  if (holds.length === 0) return;

  const customer = idOf(sheetIntent.customer as string | Stripe.Customer | null);
  const paymentMethod = idOf(sheetIntent.payment_method as string | Stripe.PaymentMethod | null);
  // Can't happen while create-payment-intent saves the card for any checkout
  // with requests; if it does, the request was never sent and the client is
  // told plainly rather than left waiting.
  if (!customer || !paymentMethod) {
    console.error(`[requestCardHolds] ${sheetIntent.id} has no saved card to hold ${holds.length} request(s) on`);
    for (const hold of holds) await recordPlaced(admin, stripe, hold.id, null, 'failed');
    return;
  }

  const failures: string[] = [];
  for (const hold of holds) {
    try {
      // Its reservation lapsed before the hold could be placed: say so,
      // rather than holding money for a request that can't be booked.
      if (!hold.booking_id) {
        await recordPlaced(admin, stripe, hold.id, null, 'failed');
        continue;
      }
      await placeOne(admin, stripe, hold, customer, paymentMethod);
    } catch (err) {
      failures.push(`${hold.id}: ${String(err)}`);
    }
  }
  if (failures.length) throw new Error(`Request holds not placed yet: ${failures.join('; ')}`);
}

/**
 * Where a placed hold's bank check got to. Returns the hold's state after
 * recording it ('authorised', 'needs_action', 'dropped', …).
 */
export async function checkRequestHold(admin: SupabaseClient, stripe: Stripe, holdId: string): Promise<string> {
  const hold = await readHold(admin, holdId);
  if (!hold) throw new Error(`Request hold ${holdId} not found`);
  if (hold.state !== 'needs_action' || !hold.payment_intent_id) return hold.state;

  const intent = await stripe.paymentIntents.retrieve(hold.payment_intent_id);
  const outcome = placedOutcomeOf(intent.status);
  const lapsed = hold.action_deadline !== null && Date.parse(hold.action_deadline) <= Date.now();
  if (outcome === 'needs_action' || outcome === null) {
    if (!lapsed) return 'needs_action';
    // Out of time: nothing may be approved on it later.
    await cancelQuietly(stripe, intent.id, hold.id);
    await recordPlaced(admin, stripe, hold.id, intent.id, 'lapsed');
  } else {
    // 'authorised' after the deadline is released by request_hold_placed.
    await recordPlaced(admin, stripe, hold.id, intent.id, outcome);
    if (outcome === 'refused' && intent.status !== 'canceled') await cancelQuietly(stripe, intent.id, hold.id);
  }
  return (await readHold(admin, holdId))?.state ?? 'dropped';
}

export type RequestHoldSettlement = 'none' | 'wait' | 'captured' | 'released';

interface Decision {
  action: 'none' | 'wait' | 'capture' | 'release';
  amount_pence: number | null;
  payment_intent_id: string | null;
}

async function alertOnce(admin: SupabaseClient, hold: HoldRow, subject: string, detail: string): Promise<void> {
  const { data, error } = await admin.from('request_card_holds')
    .update({ alerted_at: new Date().toISOString() })
    .eq('id', hold.id).is('alerted_at', null).select('id');
  if (error) throw error;
  if ((data ?? []).length === 0) return;
  await sendSupportAlert({
    subject,
    html: `<p>${escapeHtml(detail)}</p>` +
      `<p>Hold: ${escapeHtml(hold.id)}<br>Payment: ${escapeHtml(hold.payment_intent_id ?? 'none')}<br>` +
      `Checkout: ${escapeHtml(hold.checkout_batch_id)}</p>`,
  }, 'settle-held-payment');
}

/**
 * Takes a request's hold when it was accepted, or releases it when it
 * wasn't. The decision is begin_request_hold_settlement's, recorded under a
 * row lock, so a retry repeats the same Stripe call with the same key.
 */
export async function settleRequestHold(
  admin: SupabaseClient, stripe: Stripe, holdId: string,
): Promise<RequestHoldSettlement> {
  const { data, error } = await admin.rpc('begin_request_hold_settlement', { p_hold_id: holdId });
  if (error) throw error;
  const decision = (Array.isArray(data) ? data[0] : data) as Decision | undefined;
  if (!decision || decision.action === 'none') return 'none';
  if (decision.action === 'wait') return 'wait';
  const hold = await readHold(admin, holdId);
  if (!hold || !decision.payment_intent_id) throw new Error(`Request hold ${holdId} has no payment to settle`);

  let intent = await stripe.paymentIntents.retrieve(decision.payment_intent_id);
  // What Stripe actually took, passed to complete_request_hold_settlement:
  // normally the decided amount, or nothing on a release.
  let capturedPence: number | null = null;

  if (decision.action === 'capture') {
    const amount = decision.amount_pence ?? 0;
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > intent.amount) {
      throw new Error(`Hold capture amount ${amount} is outside 1..${intent.amount} for ${intent.id}`);
    }
    if (intent.status === 'requires_capture') {
      intent = await stripe.paymentIntents.capture(intent.id, { amount_to_capture: amount },
        { idempotencyKey: `request_hold_capture_${holdId}` });
    } else if (intent.status !== 'succeeded') {
      // The hold is gone but the provider accepted: the booking stands
      // unpaid. Never guess — tell support once; the hold stays 'settling'.
      // (Requests are answered within 24 hours, inside a card hold's 7 days.)
      await alertOnce(admin, hold, 'A request was accepted but its card hold could not be taken',
        `A provider accepted a request, but its card hold could no longer be captured (Stripe status ${intent.status}). The booking stands unpaid.`);
      throw new Error(`Request hold ${intent.id} can't be captured: ${intent.status}`);
    }
    capturedPence = intent.amount_received;
  } else {
    if (['requires_capture', 'requires_action', 'requires_payment_method', 'requires_confirmation'].includes(intent.status)) {
      await stripe.paymentIntents.cancel(intent.id, {}, { idempotencyKey: `request_hold_release_${holdId}` });
    } else if (intent.status === 'succeeded') {
      // Taken although it shouldn't have been: the database refunds a
      // cancelled booking, but tell support in case there's no booking left.
      capturedPence = intent.amount_received;
      await alertOnce(admin, hold, 'A request hold was taken but should have been released',
        `This hold should have been released but Stripe shows it captured (${intent.amount_received}p). Check the client was refunded.`);
    } else if (intent.status !== 'canceled') {
      throw new Error(`Request hold ${intent.id} can't be released: ${intent.status}`);
    }
  }

  const { error: doneError } = await admin.rpc('complete_request_hold_settlement', {
    p_hold_id: holdId, p_captured_pence: capturedPence,
  });
  if (doneError) throw doneError;
  return capturedPence ? 'captured' : 'released';
}

/** The 5-minute safety net (cron settle-request-card-holds). */
export async function sweepRequestHolds(admin: SupabaseClient, stripe: Stripe): Promise<Record<string, number>> {
  const tally: Record<string, number> = {};
  const count = (key: string) => { tally[key] = (tally[key] ?? 0) + 1; };

  // 1. Holds never placed for a finalised checkout (a dropped call).
  const placeBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: planned, error: plannedError } = await admin.from('request_card_holds')
    .select('checkout_batch_id, checkout_batches!inner(status, finalised_at, payment_intent_id)')
    .eq('state', 'planned').eq('on_sheet', false)
    .eq('checkout_batches.status', 'finalised')
    .lte('checkout_batches.finalised_at', placeBefore)
    .limit(SWEEP_LIMIT);
  if (plannedError) throw plannedError;
  const sheetIntents = new Set<string>();
  for (const row of (planned ?? []) as unknown as { checkout_batches: { payment_intent_id: string | null } }[]) {
    if (row.checkout_batches?.payment_intent_id) sheetIntents.add(row.checkout_batches.payment_intent_id);
  }
  for (const intentId of sheetIntents) {
    try {
      await placeRequestHolds(admin, stripe, await stripe.paymentIntents.retrieve(intentId));
      count('placed');
    } catch (err) {
      console.error(`[requestCardHolds] sweep placement for ${intentId}: ${String(err)}`);
      count('place_failed');
    }
  }

  // 2. Bank checks past their deadline.
  const { data: lapsed, error: lapsedError } = await admin.from('request_card_holds').select('id')
    .eq('state', 'needs_action').lte('action_deadline', new Date().toISOString()).limit(SWEEP_LIMIT);
  if (lapsedError) throw lapsedError;
  for (const row of lapsed ?? []) {
    try {
      count(`check_${await checkRequestHold(admin, stripe, row.id as string)}`);
    } catch (err) {
      console.error(`[requestCardHolds] sweep check for ${row.id}: ${String(err)}`);
      count('check_failed');
    }
  }

  // 3. Answered requests not yet settled. Holds still waiting on an answer
  //    come back 'wait'; at today's volume the limit covers every open one.
  const { data: open, error: openError } = await admin.from('request_card_holds').select('id, alerted_at, state')
    .in('state', ['authorised', 'settling']).order('created_at', { ascending: true }).limit(SWEEP_LIMIT);
  if (openError) throw openError;
  for (const row of open ?? []) {
    // Already escalated to support: don't retry it every five minutes.
    if (row.state === 'settling' && row.alerted_at) continue;
    try {
      count(await settleRequestHold(admin, stripe, row.id as string));
    } catch (err) {
      console.error(`[requestCardHolds] sweep settle for ${row.id}: ${String(err)}`);
      count('settle_failed');
    }
  }
  return tally;
}
