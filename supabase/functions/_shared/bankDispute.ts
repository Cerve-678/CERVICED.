import type Stripe from 'npm:stripe@17.4.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.100.0';
import { takeBackFromProvider } from './takeBack.ts';
import { sendSupportAlert } from './supportAlert.ts';
import { bankDisputeSupportEmail } from './emailTemplates.ts';
import {
  type DisputeCandidate, type DisputePayoutVerdict, disputePayoutVerdict, planDisputeAttribution,
} from './disputePlan.ts';

// Bank disputes (chargebacks), booking by booking. One checkout is one card
// payment that can pay several providers; a dispute takes money back only
// from the provider(s) whose booking it is about (disputePlan.ts says how
// that's worked out). Migration 20261115090000_bank_dispute_per_booking.
//
// Used by stripe-webhook (open / update / close), assign-bank-dispute (an
// admin's answer when the amount matched nothing) and release-payouts (what
// to do with a disputed booking's unpaid payout).

const pence = (pounds: unknown) => Math.round(Number(pounds ?? 0) * 100);
const money = (p: number) => `£${(p / 100).toFixed(2)}`;

async function chargeAndIntent(stripe: Stripe, dispute: Stripe.Dispute): Promise<{ chargeId: string; intentId: string | null }> {
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id;
  const fromDispute = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id ?? null;
  if (fromDispute) return { chargeId, intentId: fromDispute };
  const charge = await stripe.charges.retrieve(chargeId);
  const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null;
  return { chargeId, intentId };
}

/** charge.dispute.created. Safe to run again on a redelivered event. */
export async function openBankDispute(admin: SupabaseClient, stripe: Stripe, dispute: Stripe.Dispute): Promise<void> {
  const { chargeId, intentId } = await chargeAndIntent(stripe, dispute);
  if (!intentId) return;

  // A late/no-show fee has a payment of its own, so it is only ever one
  // provider's: take back what they were paid from it, as before.
  const { data: fees, error: feeError } = await admin.from('booking_fee_charges')
    .select('id, booking_id, provider_id, stripe_transfer_id, payout_pence, deducted_pence')
    .eq('payment_intent_id', intentId).eq('payout_status', 'transferred');
  if (feeError) throw feeError;
  for (const fee of fees ?? []) {
    if (!fee.stripe_transfer_id && !(fee.deducted_pence > 0)) continue;
    await takeBackFromProvider(admin, stripe, {
      providerId: fee.provider_id, bookingId: fee.booking_id, source: 'bank_dispute',
      transferId: fee.stripe_transfer_id, key: `dispute_reversal_fee_${fee.id}`,
      // Part of this fee paid off an earlier debt instead of being sent, so
      // the whole payout comes back, not just what the transfer carried.
      wantPence: fee.deducted_pence > 0 ? fee.payout_pence : undefined,
      metadata: { dispute_id: dispute.id },
    });
    const { error } = await admin.from('booking_fee_charges')
      .update({ payout_status: 'reversed', payout_failure_reason: `bank dispute ${dispute.id}` }).eq('id', fee.id);
    if (error) throw error;
  }

  // Booking payments: work out which bookings it's about.
  const { data: bookings, error: bookingError } = await admin.from('bookings')
    .select('id, amount_paid, refunded_amount').eq('payment_intent_id', intentId).limit(50);
  if (bookingError) throw bookingError;
  if (!bookings?.length) return;

  const candidates: DisputeCandidate[] = bookings.map(b => ({
    bookingId: b.id, paidPence: pence(b.amount_paid), refundedPence: pence(b.refunded_amount),
  }));
  const plan = planDisputeAttribution(dispute.amount, candidates);
  const links = plan.kind === 'needs_admin'
    ? plan.frozen.map(id => ({ booking_id: id, role: 'frozen' }))
    : plan.disputed.map(id => ({ booking_id: id, role: 'disputed' }));

  const { data: disputeRowId, error: recordError } = await admin.rpc('record_bank_dispute', {
    p_stripe_dispute_id: dispute.id,
    p_charge_id: chargeId,
    p_payment_intent_id: intentId,
    p_amount_pence: dispute.amount,
    p_reason: dispute.reason ?? null,
    p_stripe_status: dispute.status,
    p_attribution: plan.kind,
    p_links: links,
  });
  if (recordError) throw recordError;

  // What's on file decides, not this run's plan: on a redelivery the bookings
  // may have changed since, and an admin may already have answered.
  const { data: stored, error: storedError } = await admin.from('payment_disputes')
    .select('attribution').eq('id', disputeRowId).single();
  if (storedError) throw storedError;
  const { data: disputedLinks, error: linkError } = await admin.from('payment_dispute_bookings')
    .select('booking_id').eq('dispute_id', disputeRowId).eq('role', 'disputed');
  if (linkError) throw linkError;
  await takeBackForBookings(admin, stripe, dispute.id, (disputedLinks ?? []).map(l => l.booking_id));

  if (stored.attribution === 'needs_admin' && plan.kind === 'needs_admin') {
    await sendSupportAlert(bankDisputeSupportEmail({
      title: "A bank dispute needs you to pick the booking",
      amount: money(dispute.amount),
      reason: dispute.reason ?? 'not given',
      bookings: await describeBookings(admin, plan.frozen),
      nextStep: "The amount doesn't match any booking on the payment, so nothing has been taken back yet and these providers' unpaid payouts are on hold. Open Money → Disputes in the app, pick the booking(s) the client is disputing, and answer the dispute in Stripe before its deadline.",
    }), 'bank-dispute');
  }
}

/** Takes back what each booking's provider was paid. Keyed per payout, so
 *  running it twice never takes twice. */
export async function takeBackForBookings(
  admin: SupabaseClient, stripe: Stripe, stripeDisputeId: string, bookingIds: string[],
): Promise<void> {
  if (bookingIds.length === 0) return;
  const { data: payouts, error } = await admin.from('provider_payouts')
    .select('id, booking_id, provider_id, stripe_transfer_id').in('booking_id', bookingIds).eq('status', 'transferred');
  if (error) throw error;
  for (const payout of payouts ?? []) {
    await takeBackFromProvider(admin, stripe, {
      providerId: payout.provider_id, bookingId: payout.booking_id, source: 'bank_dispute',
      transferId: payout.stripe_transfer_id, key: `dispute_reversal_payout_${payout.id}`,
      metadata: { dispute_id: stripeDisputeId },
    });
    // transfer.reversed then marks the row reversed (stripe-webhook handleTransferReversed).
  }
}

/** charge.dispute.updated: keep Stripe's status current. */
export async function updateBankDispute(admin: SupabaseClient, dispute: Stripe.Dispute): Promise<void> {
  const { error } = await admin.from('payment_disputes')
    .update({ stripe_status: dispute.status }).eq('stripe_dispute_id', dispute.id).is('closed_at', null);
  if (error) throw error;
}

/** charge.dispute.closed. Records the outcome; if CERVICED won, pays each
 *  provider back what was taken from them for it. A payout not yet sent needs
 *  nothing here: release-payouts pays it (won) or drops it (lost). */
export async function closeBankDispute(admin: SupabaseClient, stripe: Stripe, dispute: Stripe.Dispute): Promise<void> {
  if (dispute.status !== 'won' && dispute.status !== 'lost' && dispute.status !== 'warning_closed') return;
  const outcome = dispute.status === 'lost' ? 'lost' : 'won';
  const { data: row, error } = await admin.from('payment_disputes')
    .select('id, attribution, amount_pence, reason').eq('stripe_dispute_id', dispute.id).maybeSingle();
  if (error) throw error;
  if (!row) {
    // Opened before this was built, or never recorded. A person settles it.
    console.warn(`[bank-dispute] dispute ${dispute.id} closed ${outcome} with no record`);
    return;
  }
  const { error: closeError } = await admin.from('payment_disputes')
    .update({ stripe_status: dispute.status, outcome, closed_at: new Date().toISOString() })
    .eq('id', row.id).is('closed_at', null);
  if (closeError) throw closeError;

  if (row.attribution === 'needs_admin') {
    if (outcome === 'won') {
      // Nothing was taken back and nothing was lost: let every payout go.
      const { error: releaseError } = await admin.from('payment_dispute_bookings').delete().eq('dispute_id', row.id).eq('role', 'frozen');
      if (releaseError) throw releaseError;
    } else {
      const { data: frozen } = await admin.from('payment_dispute_bookings').select('booking_id').eq('dispute_id', row.id);
      await sendSupportAlert(bankDisputeSupportEmail({
        title: 'A bank dispute was lost before anyone picked the booking',
        amount: money(row.amount_pence),
        reason: row.reason ?? 'not given',
        bookings: await describeBookings(admin, (frozen ?? []).map(f => f.booking_id)),
        nextStep: "The client's bank kept the money. Open Money → Disputes in the app and pick the booking(s) it was about: that provider's money is taken back then, and the other providers' payouts carry on.",
      }), 'bank-dispute');
    }
    return;
  }
  if (outcome === 'won') await payBackAfterWin(admin, stripe, dispute.id, row.id);
}

async function payBackAfterWin(admin: SupabaseClient, stripe: Stripe, stripeDisputeId: string, disputeRowId: string): Promise<void> {
  const { data: links, error } = await admin.from('payment_dispute_bookings')
    .select('booking_id').eq('dispute_id', disputeRowId).eq('role', 'disputed').is('paid_back_transfer_id', null);
  if (error) throw error;
  const bookingIds = (links ?? []).map(l => l.booking_id);
  if (bookingIds.length === 0) return;
  const { data: payouts, error: payoutError } = await admin.from('provider_payouts')
    .select('id, booking_id, provider_id, stripe_account_id, stripe_transfer_id, currency')
    .in('booking_id', bookingIds).not('stripe_transfer_id', 'is', null);
  if (payoutError) throw payoutError;

  const stillOwed: string[] = [];
  for (const payout of payouts ?? []) {
    // What this dispute took off the transfer, from Stripe itself.
    const reversals = await stripe.transfers.listReversals(payout.stripe_transfer_id, { limit: 100 });
    const taken = reversals.data
      .filter(r => r.metadata?.dispute_id === stripeDisputeId)
      .reduce((sum, r) => sum + r.amount, 0);
    if (taken > 0) {
      const transfer = await stripe.transfers.create(
        {
          amount: taken,
          currency: payout.currency ?? 'gbp',
          destination: payout.stripe_account_id,
          // Not payout_id: that names the original payout's transfer
          // (findPayoutTransfer), and this is a separate one.
          metadata: { dispute_payback_for_payout: payout.id, booking_id: payout.booking_id, dispute_id: stripeDisputeId },
        },
        { idempotencyKey: `dispute_payback_${payout.id}` },
      );
      const { error: writeError } = await admin.from('payment_dispute_bookings')
        .update({ paid_back_pence: taken, paid_back_transfer_id: transfer.id })
        .eq('dispute_id', disputeRowId).eq('booking_id', payout.booking_id);
      if (writeError) throw writeError;
    }
    // Anything their Stripe balance couldn't cover became a debt. Debts have
    // no automatic way to be cancelled, so a person does it.
    const { data: debt, error: debtError } = await admin.from('provider_shortfalls')
      .select('amount_pence, recovered_pence').eq('source_key', `dispute_reversal_payout_${payout.id}`).maybeSingle();
    if (debtError) throw debtError;
    if (debt) stillOwed.push(`${(await describeBookings(admin, [payout.booking_id]))[0]}: ${money(Number(debt.amount_pence))} recorded as owed, ${money(Number(debt.recovered_pence))} already taken from later payouts`);
  }
  if (stillOwed.length) {
    await sendSupportAlert(bankDisputeSupportEmail({
      title: 'A bank dispute was won: a provider debt needs cancelling',
      amount: '—',
      reason: `dispute ${stripeDisputeId} won`,
      bookings: stillOwed,
      nextStep: "Whatever was reversed from the provider's Stripe balance has been paid back automatically. The part that became a debt hasn't: cancel what's left of it and pay back anything already taken from their later payouts.",
    }), 'bank-dispute');
  }
}

/** release-payouts: what to do with this booking's payout, its charge being disputed. */
export async function disputeVerdictForBooking(
  admin: SupabaseClient, chargeId: string, bookingId: string,
): Promise<DisputePayoutVerdict> {
  const { data: dispute, error } = await admin.from('payment_disputes')
    .select('id, closed_at, outcome').eq('charge_id', chargeId).order('opened_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!dispute) return disputePayoutVerdict({ dispute: null, role: null });
  const { data: link, error: linkError } = await admin.from('payment_dispute_bookings')
    .select('role').eq('dispute_id', dispute.id).eq('booking_id', bookingId).maybeSingle();
  if (linkError) throw linkError;
  return disputePayoutVerdict({
    dispute: { closed: dispute.closed_at !== null, outcome: dispute.outcome },
    role: link?.role ?? null,
  });
}

async function describeBookings(admin: SupabaseClient, bookingIds: string[]): Promise<string[]> {
  if (bookingIds.length === 0) return [];
  const { data, error } = await admin.from('bookings')
    .select('id, service_name_snapshot, provider_name_snapshot, booking_date, amount_paid')
    .in('id', bookingIds).limit(50);
  if (error || !data) return bookingIds;
  return data.map(b => `${b.service_name_snapshot ?? 'Booking'} with ${b.provider_name_snapshot ?? 'a provider'}, ${b.booking_date ?? ''}, ${money(pence(b.amount_paid))} (${b.id})`);
}
