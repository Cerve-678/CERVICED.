import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.100.0';
import type Stripe from 'npm:stripe@17.4.0';
import { feePaymentRequestEmail } from './emailTemplates.ts';
import { isRetryableDecline, nextRetryAt } from './feeRetrySchedule.ts';
export { isRetryableDecline, termsAllowRetries } from './feeRetrySchedule.ts';

// Late/no-show fees the saved card couldn't pay (user decisions 2026-10-19,
// migration 20261019170000). The fee becomes a Stripe invoice on the client's
// Customer; its single PaymentIntent is what both the in-app payment sheet and
// the emailed Stripe page pay, so it can't be paid twice.

export const PAY_REQUEST_DAYS = 7;


const PAYOUT_HOLD_MS = 24 * 60 * 60 * 1000;
const FROM_EMAIL = 'CERVICED <noreply@cerviced.co>';

export interface FeeRow {
  id: string;
  booking_id: string;
  provider_id: string;
  client_user_id: string;
  kind: 'late' | 'no_show';
  amount_pence: number;
}

export const feeLabel = (kind: 'late' | 'no_show') => (kind === 'late' ? 'late arrival fee' : 'no-show fee');
const pounds = (pence: number) => `£${(pence / 100).toFixed(2)}`;

const UK_DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' });

/**
 * Ask the client to pay a fee their saved card couldn't. Raises the invoice,
 * moves the fee row to 'awaiting_client', cancels the failed off-session
 * attempt, and tells the client in the app and by email. Only the row's
 * status write is load-bearing; a failed notification or email is logged.
 */
export async function requestClientPayment(
  admin: SupabaseClient,
  stripe: Stripe,
  args: {
    fee: FeeRow;
    customerId: string;
    failedIntentId: string | null;
    failureReason: string;
    /** The saved card to retry automatically; null = no retries. */
    retryPaymentMethodId: string | null;
    providerName: string;
    serviceName: string | null;
  },
): Promise<{ payBy: string }> {
  const { fee } = args;
  const description = `${feeLabel(fee.kind)[0].toUpperCase()}${feeLabel(fee.kind).slice(1)} — ${args.providerName}`;
  const metadata = { fee_charge_id: fee.id, booking_id: fee.booking_id, kind: fee.kind, provider_id: fee.provider_id };

  const draft = await stripe.invoices.create({
    customer: args.customerId,
    collection_method: 'send_invoice',
    days_until_due: PAY_REQUEST_DAYS,
    auto_advance: false,
    pending_invoice_items_behavior: 'exclude',
    payment_settings: { payment_method_types: ['card'] },
    description,
    metadata,
  }, { idempotencyKey: `booking_fee_invoice_${fee.id}` });
  await stripe.invoiceItems.create({
    customer: args.customerId,
    invoice: draft.id,
    amount: fee.amount_pence,
    currency: 'gbp',
    description,
    metadata,
  }, { idempotencyKey: `booking_fee_invoice_item_${fee.id}` });
  const invoice = await stripe.invoices.finalizeInvoice(draft.id, { auto_advance: false });
  const intentId = typeof invoice.payment_intent === 'string' ? invoice.payment_intent : invoice.payment_intent?.id;
  if (!intentId || !invoice.hosted_invoice_url) throw new Error(`invoice ${invoice.id} has no payment page`);
  // The webhook recognises a fee payment by this metadata.
  await stripe.paymentIntents.update(intentId, { metadata });

  const requestedAt = Date.now();
  const payBy = new Date(requestedAt + PAY_REQUEST_DAYS * 86_400_000);
  const firstRetry = args.retryPaymentMethodId ? nextRetryAt(requestedAt, 0, payBy.getTime()) : null;
  const { error: updateError } = await admin.from('booking_fee_charges').update({
    status: 'awaiting_client',
    stripe_invoice_id: invoice.id,
    payment_intent_id: intentId,
    pay_by: payBy.toISOString(),
    failure_reason: args.failureReason.slice(0, 500),
    retry_payment_method_id: firstRetry ? args.retryPaymentMethodId : null,
    retry_count: 0,
    next_retry_at: firstRetry,
  }).eq('id', fee.id).eq('status', 'processing');
  if (updateError) throw updateError;

  if (args.failedIntentId && args.failedIntentId !== intentId) {
    await stripe.paymentIntents.cancel(args.failedIntentId).catch((err) => {
      console.error(`[feePayRequest] could not cancel failed intent ${args.failedIntentId}: ${String(err)}`);
    });
  }

  const amount = pounds(fee.amount_pence);
  const payByLabel = UK_DAY.format(payBy);
  const { error: notifyError } = await admin.from('notifications').insert({
    user_id: fee.client_user_id,
    type: 'fee_payment_requested',
    title: `Please pay your ${amount} ${feeLabel(fee.kind)}`,
    message: `${args.providerName} couldn't take the ${feeLabel(fee.kind)} you agreed to from your saved card. Open the booking to pay it by ${payByLabel}.${firstRetry ? ' We\'ll also try your card again.' : ''}`,
    priority: 'high',
    is_actionable: true,
    booking_id: fee.booking_id,
    provider_id: fee.provider_id,
    recipient_role: 'client',
    metadata: { fee_charge_id: fee.id, amount_pence: fee.amount_pence, kind: fee.kind },
  });
  if (notifyError) console.error(`[feePayRequest] notification failed for ${fee.id}: ${String(notifyError.message ?? notifyError)}`);

  await emailClient(admin, fee, {
    amount, providerName: args.providerName, service: args.serviceName ?? 'your appointment',
    payBy: payByLabel, payUrl: invoice.hosted_invoice_url, willRetry: !!firstRetry,
  });

  return { payBy: payBy.toISOString() };
}

async function emailClient(
  admin: SupabaseClient,
  fee: FeeRow,
  p: { amount: string; providerName: string; service: string; payBy: string; payUrl: string; willRetry: boolean },
): Promise<void> {
  try {
    const { data: user, error } = await admin.from('users')
      .select('email, name').eq('id', fee.client_user_id).maybeSingle();
    if (error) throw error;
    if (!user?.email) return;
    const { subject, html } = feePaymentRequestEmail({
      name: user.name ?? undefined, amount: p.amount, feeLabel: feeLabel(fee.kind),
      providerName: p.providerName, service: p.service, payBy: p.payBy, payUrl: p.payUrl, willRetry: p.willRetry,
    });
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: user.email, subject, html }),
    });
    if (!res.ok) console.error(`[feePayRequest] email for ${fee.id} failed: ${await res.text()}`);
  } catch (err) {
    console.error(`[feePayRequest] email for ${fee.id} failed: ${String(err)}`);
  }
}

/**
 * Record a fee as paid once its PaymentIntent has succeeded, whichever way it
 * was paid (charged off-session, paid in the app, or paid on Stripe's page).
 * Idempotent: only a row still 'processing' or 'awaiting_client' changes.
 * Returns the status the row had before, or null if nothing changed.
 */
export async function recordFeePaid(
  admin: SupabaseClient,
  stripe: Stripe,
  feeId: string,
  intentId: string,
): Promise<'processing' | 'awaiting_client' | null> {
  const { data: fee, error } = await admin.from('booking_fee_charges')
    .select('id, booking_id, provider_id, client_user_id, kind, amount_pence, status, payment_intent_id')
    .eq('id', feeId).maybeSingle();
  if (error) throw error;
  if (!fee || (fee.status !== 'processing' && fee.status !== 'awaiting_client')) return null;
  // Only the payment bound to this fee row counts — never one matched by amount.
  if (!fee.payment_intent_id || fee.payment_intent_id !== intentId) return null;

  const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ['latest_charge.balance_transaction'] });
  if (intent.status !== 'succeeded' || intent.amount_received !== fee.amount_pence ||
      intent.currency !== 'gbp' || intent.metadata?.fee_charge_id !== fee.id) {
    console.error(`[feePayRequest] intent ${intentId} doesn't match fee ${fee.id}; not recorded`);
    return null;
  }

  // CERVICED takes no cut: only Stripe's actual card fee comes off.
  const charge = intent.latest_charge as Stripe.Charge | null;
  const balance = charge?.balance_transaction as Stripe.BalanceTransaction | null;
  const stripeFee = typeof balance?.fee === 'number' ? balance.fee : null;
  const payout = stripeFee === null ? null : Math.max(0, fee.amount_pence - stripeFee);
  const { data: updated, error: updateError } = await admin.from('booking_fee_charges').update({
    status: 'succeeded', payment_intent_id: intent.id, charged_at: new Date().toISOString(),
    stripe_fee_pence: stripeFee, payout_pence: payout, pay_by: null, next_retry_at: null,
    // Without a known card fee the payout waits rather than paying a guessed amount.
    payout_status: payout === null ? 'pending' : 'held',
    release_after: new Date(Date.now() + PAYOUT_HOLD_MS).toISOString(),
  }).eq('id', fee.id).eq('status', fee.status).select('id');
  if (updateError) throw updateError;
  if (!updated?.length) return null;

  if (fee.status === 'awaiting_client') await notifyProvider(admin, fee, 'fee_paid_by_client',
    `${pounds(fee.amount_pence)} ${feeLabel(fee.kind)} paid`,
    `Your client paid the ${feeLabel(fee.kind)}. It's paid out to you 24 hours from now.`);
  return fee.status;
}

/** Lapse requests past their pay_by: void the invoice so it can't be paid,
 *  mark the fee failed, and tell the provider. Run by release-payouts. */
export async function lapseFeePayRequests(admin: SupabaseClient, stripe: Stripe, limit: number): Promise<number> {
  const { data: due, error } = await admin.from('booking_fee_charges')
    .select('id, booking_id, provider_id, client_user_id, kind, amount_pence, stripe_invoice_id, payment_intent_id')
    .eq('status', 'awaiting_client').lte('pay_by', new Date().toISOString())
    .order('pay_by', { ascending: true }).limit(limit);
  if (error) throw error;
  let lapsed = 0;
  for (const fee of due ?? []) {
    try {
      if (await closeFeeRequest(admin, stripe, fee, 'client_did_not_pay') !== 'closed') continue;
      await notifyProvider(admin, fee, 'fee_payment_lapsed',
        `${pounds(fee.amount_pence)} ${feeLabel(fee.kind)} wasn't paid`,
        `Your client didn't pay the ${feeLabel(fee.kind)} within ${PAY_REQUEST_DAYS} days, so the request has closed. Nothing was taken.`);
      lapsed++;
    } catch (err) {
      console.error(`[feePayRequest] could not lapse ${fee.id}: ${String(err)}`);
    }
  }
  return lapsed;
}

/**
 * Close an open request: void its invoice, then mark the fee failed. If the
 * client paid in the meantime, records it as paid instead and returns 'paid'.
 */
export async function closeFeeRequest(
  admin: SupabaseClient,
  stripe: Stripe,
  fee: { id: string; stripe_invoice_id: string | null; payment_intent_id: string | null },
  reason: 'client_did_not_pay' | 'request_cancelled',
): Promise<'closed' | 'paid'> {
  if (fee.stripe_invoice_id) {
    const invoice = await stripe.invoices.retrieve(fee.stripe_invoice_id);
    if (invoice.status === 'paid') {
      const recorded = fee.payment_intent_id ? await recordFeePaid(admin, stripe, fee.id, fee.payment_intent_id) : null;
      // Paid some other way (e.g. a Stripe customer credit balance): no card
      // payment to record, so it needs a person to look at it.
      if (!recorded) console.error(`[feePayRequest] invoice ${invoice.id} is paid but fee ${fee.id} couldn't be recorded — check it by hand`);
      return 'paid';
    }
    if (invoice.status === 'open') {
      try {
        await stripe.invoices.voidInvoice(invoice.id);
      } catch (err) {
        // A retry or the client may have paid it a moment ago.
        const again = await stripe.invoices.retrieve(invoice.id);
        if (again.status !== 'paid') throw err;
        if (fee.payment_intent_id) await recordFeePaid(admin, stripe, fee.id, fee.payment_intent_id);
        return 'paid';
      }
    }
  }
  const { error } = await admin.from('booking_fee_charges')
    .update({ status: 'failed', failure_reason: reason, pay_by: null, next_retry_at: null })
    .eq('id', fee.id).eq('status', 'awaiting_client');
  if (error) throw error;
  return 'closed';
}

async function notifyProvider(
  admin: SupabaseClient,
  fee: { id: string; booking_id: string; provider_id: string; amount_pence: number; kind: string },
  type: 'fee_paid_by_client' | 'fee_payment_lapsed',
  title: string,
  message: string,
): Promise<void> {
  const { data: provider, error } = await admin.from('providers').select('user_id').eq('id', fee.provider_id).maybeSingle();
  if (error || !provider?.user_id) {
    console.error(`[feePayRequest] no provider user for ${fee.provider_id}: ${String(error?.message ?? 'missing')}`);
    return;
  }
  const { error: notifyError } = await admin.from('notifications').insert({
    user_id: provider.user_id,
    type,
    title,
    message,
    priority: 'medium',
    is_actionable: false,
    booking_id: fee.booking_id,
    provider_id: fee.provider_id,
    recipient_role: 'provider',
    metadata: { fee_charge_id: fee.id, amount_pence: fee.amount_pence, kind: fee.kind },
  });
  if (notifyError) console.error(`[feePayRequest] ${type} notification failed for ${fee.id}: ${String(notifyError.message ?? notifyError)}`);
}

/**
 * Try the saved card again on requests whose next retry is due. Pays the
 * request's own invoice, so a retry and the client paying can never both
 * take the money. Run by release-payouts.
 */
export async function retryDueFees(admin: SupabaseClient, stripe: Stripe, limit: number): Promise<{ paid: number; failed: number }> {
  const now = new Date().toISOString();
  const { data: due, error } = await admin.from('booking_fee_charges')
    .select('id, booking_id, provider_id, client_user_id, kind, amount_pence, stripe_invoice_id, payment_intent_id, retry_payment_method_id, retry_count, pay_by')
    .eq('status', 'awaiting_client').lte('next_retry_at', now).gt('pay_by', now)
    .order('next_retry_at', { ascending: true }).limit(limit);
  if (error) throw error;
  let paid = 0;
  let failed = 0;
  for (const fee of due ?? []) {
    try {
      const outcome = await retryOne(admin, stripe, fee);
      if (outcome === 'paid') paid++;
      if (outcome === 'failed') failed++;
    } catch (err) {
      // One bad row must not stop the rest; it's picked up again next run.
      console.error(`[feePayRequest] retry of ${fee.id} errored: ${String(err)}`);
    }
  }
  return { paid, failed };
}

interface RetryRow extends FeeRow {
  stripe_invoice_id: string | null;
  payment_intent_id: string | null;
  retry_payment_method_id: string | null;
  retry_count: number | null;
  pay_by: string | null;
}

async function retryOne(admin: SupabaseClient, stripe: Stripe, fee: RetryRow): Promise<'paid' | 'failed' | 'skipped'> {
  const attempt = (fee.retry_count ?? 0) + 1;
  if (!fee.stripe_invoice_id || !fee.retry_payment_method_id || !fee.payment_intent_id || !fee.pay_by) {
    await admin.from('booking_fee_charges').update({ next_retry_at: null }).eq('id', fee.id).eq('status', 'awaiting_client');
    return 'skipped';
  }
  let reason: string | null = null;
  let stopRetrying = false;
  try {
    const invoice = await stripe.invoices.pay(fee.stripe_invoice_id, {
      payment_method: fee.retry_payment_method_id,
      off_session: true,
    }, { idempotencyKey: `booking_fee_retry_${fee.id}_${attempt}` });
    if (invoice.status !== 'paid') reason = `invoice ${invoice.status}`;
  } catch (err) {
    const e = err as { code?: string; decline_code?: string; type?: string };
    if (e.code === 'invoice_already_paid') {
      reason = null; // paid another way (the client, or an earlier attempt)
    } else {
      reason = [e.code ?? e.type ?? String(err), e.decline_code].filter(Boolean).join('/');
      stopRetrying = e.type !== 'StripeCardError' || !isRetryableDecline(e.code, e.decline_code);
    }
  }

  if (!reason) {
    const was = await recordFeePaid(admin, stripe, fee.id, fee.payment_intent_id);
    if (!was) return 'skipped';
    await notifyClient(admin, fee, 'fee_charged',
      `${pounds(fee.amount_pence)} ${feeLabel(fee.kind)} charged`,
      `We tried your saved card again and the ${feeLabel(fee.kind)} you agreed to has now been paid. There's nothing more to do. If you think it's wrong, you can dispute it within 7 days.`,
      { retry: attempt });
    return 'paid';
  }

  const requestedAt = Date.parse(fee.pay_by) - PAY_REQUEST_DAYS * 86_400_000;
  const next = stopRetrying ? null : nextRetryAt(requestedAt, attempt, Date.parse(fee.pay_by));
  const { data: updated, error: updateError } = await admin.from('booking_fee_charges').update({
    retry_count: attempt,
    next_retry_at: next,
    failure_reason: `retry ${attempt}: ${reason}`.slice(0, 500),
  }).eq('id', fee.id).eq('status', 'awaiting_client').eq('retry_count', fee.retry_count ?? 0).select('id');
  if (updateError) throw updateError;
  if (!updated?.length) return 'skipped';

  // The fee wording promises a notification whenever a fee is retried.
  const payByLabel = UK_DAY.format(new Date(fee.pay_by));
  await notifyClient(admin, fee, 'fee_payment_requested',
    `Your ${pounds(fee.amount_pence)} ${feeLabel(fee.kind)} is still unpaid`,
    `We tried your saved card again but it was declined. Open the booking to pay it by ${payByLabel}.${next ? " We'll try your card once more before then." : ''}`,
    { retry: attempt });
  return 'failed';
}

async function notifyClient(
  admin: SupabaseClient,
  fee: FeeRow,
  type: 'fee_charged' | 'fee_payment_requested',
  title: string,
  message: string,
  extra: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.from('notifications').insert({
    user_id: fee.client_user_id,
    type,
    title,
    message,
    priority: 'high',
    is_actionable: true,
    booking_id: fee.booking_id,
    provider_id: fee.provider_id,
    recipient_role: 'client',
    metadata: { fee_charge_id: fee.id, amount_pence: fee.amount_pence, kind: fee.kind, ...extra },
  });
  if (error) console.error(`[feePayRequest] ${type} notification failed for ${fee.id}: ${String(error.message ?? error)}`);
}
