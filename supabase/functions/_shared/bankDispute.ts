import type Stripe from 'npm:stripe@17.4.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.100.0';
import { takeBackFromProvider } from './takeBack.ts';
import { sendSupportAlert } from './supportAlert.ts';
import { bankDisputeSupportEmail } from './emailTemplates.ts';
import { findTransferTagged } from './payoutTransfer.ts';
import {
  combineDisputeVerdicts, type DisputeCandidate, type DisputePayoutVerdict, disputePayoutVerdict,
  planDisputeAttribution,
} from './disputePlan.ts';

// Bank disputes (chargebacks), booking by booking. One checkout is one card
// payment that can pay several providers; a dispute takes money back only
// from the provider(s) whose booking it is about (disputePlan.ts says how
// that's worked out). Migration 20261115090000_bank_dispute_per_booking.
//
// Used by stripe-webhook (open / update / close), assign-bank-dispute (an
// admin's answer when the amount matched nothing) and release-payouts (what
// to do with a disputed booking's unpaid payout).
//
// Ordering: who a dispute is about, and how it ended, are recorded under the
// dispute row's lock (record_bank_dispute, assign_bank_dispute,
// close_bank_dispute) before any money moves. Taking back then re-reads the
// outcome and pays straight back if it was won meanwhile; paying back is
// keyed per payout and looked up in Stripe first, so both sides can run in
// either order, or twice, and land in the same place.
//
// Stripe doesn't promise event order, so every handler reads the dispute's
// current state from Stripe rather than the event's copy, and a "closed"
// that arrives before "created" records the dispute itself.

const pence = (pounds: unknown) => Math.round(Number(pounds ?? 0) * 100);
const money = (p: number) => `£${(p / 100).toFixed(2)}`;
const CLOSED = new Set(['won', 'lost', 'warning_closed']);
/** An inquiry closed without a chargeback lost no money: treated as won. */
const outcomeOf = (status: string): 'won' | 'lost' => (status === 'lost' ? 'lost' : 'won');

interface DisputeRef {
  rowId: string;
  stripeId: string;
}

function intentOf(dispute: Stripe.Dispute): string | null {
  return typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id ?? null;
}

async function intentOfCharge(stripe: Stripe, chargeId: string): Promise<string | null> {
  const charge = await stripe.charges.retrieve(chargeId);
  return typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null;
}

/** charge.dispute.created. Safe to run again, and safe after the close. */
export async function openBankDispute(admin: SupabaseClient, stripe: Stripe, eventDispute: Stripe.Dispute): Promise<void> {
  const dispute = await stripe.disputes.retrieve(eventDispute.id);
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id;
  const intentId = intentOf(dispute) ?? await intentOfCharge(stripe, chargeId);
  if (!intentId) return;
  const alreadyClosedAndWon = CLOSED.has(dispute.status) && outcomeOf(dispute.status) === 'won';

  // A late/no-show fee has a payment of its own, so it is only ever one
  // provider's: take back what they were paid from it, as before. Not when
  // the dispute is already won: then nothing was lost.
  if (!alreadyClosedAndWon) {
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

  const { data: rowId, error: recordError } = await admin.rpc('record_bank_dispute', {
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
  const ref: DisputeRef = { rowId: String(rowId), stripeId: dispute.id };

  // What's on file decides, not this run's plan: on a redelivery the bookings
  // may have changed since, and an admin may already have answered.
  const { data: stored, error: storedError } = await admin.from('payment_disputes')
    .select('attribution, closed_at').eq('id', ref.rowId).single();
  if (storedError) throw storedError;

  if (!alreadyClosedAndWon) {
    const { data: pending, error: linkError } = await admin.from('payment_dispute_bookings')
      .select('booking_id').eq('dispute_id', ref.rowId).eq('role', 'disputed').is('taken_back_at', null);
    if (linkError) throw linkError;
    await takeBackForDispute(admin, stripe, ref, (pending ?? []).map(l => l.booking_id));
  }

  if (CLOSED.has(dispute.status)) {
    // The close may already have come and gone without finding a record.
    await applyClose(admin, stripe, dispute);
  } else if (stored.attribution === 'needs_admin' && stored.closed_at === null && plan.kind === 'needs_admin') {
    await sendSupportAlert(bankDisputeSupportEmail({
      title: 'A bank dispute needs you to pick the booking',
      amount: money(dispute.amount),
      reason: dispute.reason ?? 'not given',
      bookings: await describeBookings(admin, plan.frozen),
      nextStep: "The amount doesn't match any one booking on the payment, so nothing has been taken back yet and these providers' unpaid payouts are on hold. Open Money → Disputes in the app, pick the booking(s) the client is disputing, and answer the dispute in Stripe before its deadline.",
    }), 'bank-dispute');
  }
}

/** Takes back what each booking's provider was paid, then marks it done.
 *  Keyed per payout, so running it twice never takes twice. If the dispute
 *  was won while this ran, pays it straight back. */
export async function takeBackForDispute(
  admin: SupabaseClient, stripe: Stripe, ref: DisputeRef, bookingIds: string[],
): Promise<void> {
  if (bookingIds.length === 0) return;
  const { data: payouts, error } = await admin.from('provider_payouts')
    .select('id, booking_id, provider_id, stripe_transfer_id').in('booking_id', bookingIds).eq('status', 'transferred');
  if (error) throw error;
  for (const payout of payouts ?? []) {
    await takeBackFromProvider(admin, stripe, {
      providerId: payout.provider_id, bookingId: payout.booking_id, source: 'bank_dispute',
      transferId: payout.stripe_transfer_id, key: `dispute_reversal_payout_${payout.id}`,
      metadata: { dispute_id: ref.stripeId },
    });
    // transfer.reversed then marks the row reversed (stripe-webhook handleTransferReversed).
  }
  const { error: markError } = await admin.from('payment_dispute_bookings')
    .update({ taken_back_at: new Date().toISOString() })
    .eq('dispute_id', ref.rowId).in('booking_id', bookingIds).is('taken_back_at', null);
  if (markError) throw markError;

  const { data: now, error: nowError } = await admin.from('payment_disputes')
    .select('outcome').eq('id', ref.rowId).single();
  if (nowError) throw nowError;
  if (now.outcome === 'won') await payBackForDispute(admin, stripe, ref, bookingIds);
}

/** charge.dispute.updated: keep Stripe's status current. */
export async function updateBankDispute(admin: SupabaseClient, eventDispute: Stripe.Dispute): Promise<void> {
  const { error } = await admin.from('payment_disputes')
    .update({ stripe_status: eventDispute.status }).eq('stripe_dispute_id', eventDispute.id).is('closed_at', null);
  if (error) throw error;
}

/** charge.dispute.closed. */
export async function closeBankDispute(admin: SupabaseClient, stripe: Stripe, eventDispute: Stripe.Dispute): Promise<void> {
  const dispute = await stripe.disputes.retrieve(eventDispute.id);
  if (!CLOSED.has(dispute.status)) return;
  const { data: existing, error } = await admin.from('payment_disputes')
    .select('id').eq('stripe_dispute_id', dispute.id).maybeSingle();
  if (error) throw error;
  // Arrived before "created": record it now; that applies the close too.
  if (!existing) { await openBankDispute(admin, stripe, dispute); return; }
  await applyClose(admin, stripe, dispute);
}

/** Records the outcome under the row lock, then pays back (won) or alerts.
 *  A payout not yet sent needs nothing here: release-payouts pays it (won) or
 *  drops it (lost). */
async function applyClose(admin: SupabaseClient, stripe: Stripe, dispute: Stripe.Dispute): Promise<void> {
  const outcome = outcomeOf(dispute.status);
  const { data, error } = await admin.rpc('close_bank_dispute', {
    p_stripe_dispute_id: dispute.id, p_stripe_status: dispute.status, p_outcome: outcome,
  });
  if (error) throw error;
  const row = data as { id: string; attribution: string; outcome: 'won' | 'lost'; amount_pence: number; reason: string | null; newly_closed: boolean } | null;
  if (!row) return;
  const ref: DisputeRef = { rowId: row.id, stripeId: dispute.id };

  if (row.attribution === 'needs_admin') {
    // Won: close_bank_dispute let the frozen bookings go; nothing was taken.
    if (row.outcome === 'lost' && row.newly_closed) {
      const { data: frozen, error: frozenError } = await admin.from('payment_dispute_bookings')
        .select('booking_id').eq('dispute_id', row.id);
      if (frozenError) throw frozenError;
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
  if (row.outcome !== 'won') return;

  await payBackForDispute(admin, stripe, ref, null);

  // A late/no-show fee's own payout taken back for this dispute isn't paid
  // back automatically.
  if (row.newly_closed) {
    const intentId = intentOf(dispute);
    const { data: fees, error: feeError } = intentId
      ? await admin.from('booking_fee_charges').select('booking_id, payout_pence')
        .eq('payment_intent_id', intentId).eq('payout_status', 'reversed').eq('payout_failure_reason', `bank dispute ${dispute.id}`)
      : { data: [], error: null };
    if (feeError) throw feeError;
    if (fees?.length) {
      await sendSupportAlert(bankDisputeSupportEmail({
        title: 'A bank dispute on a late/no-show fee was won',
        amount: money(row.amount_pence),
        reason: `dispute ${dispute.id} won`,
        bookings: await describeBookings(admin, fees.map(f => f.booking_id)),
        nextStep: "The provider's share of the fee was taken back when the dispute opened. Pay it back to them by hand (engineering).",
      }), 'bank-dispute');
    }
  }
}

/** Pays each provider back what this dispute reversed from them. bookingIds
 *  null = every booking the dispute is about. Looks for an earlier payback in
 *  Stripe before sending, so a retry days later can't pay twice. */
async function payBackForDispute(
  admin: SupabaseClient, stripe: Stripe, ref: DisputeRef, bookingIds: string[] | null,
): Promise<void> {
  let linkQuery = admin.from('payment_dispute_bookings')
    .select('booking_id').eq('dispute_id', ref.rowId).eq('role', 'disputed');
  if (bookingIds) linkQuery = linkQuery.in('booking_id', bookingIds);
  const { data: links, error } = await linkQuery;
  if (error) throw error;
  const ids = (links ?? []).map(l => l.booking_id);
  if (ids.length === 0) return;
  const { data: payouts, error: payoutError } = await admin.from('provider_payouts')
    .select('id, booking_id, stripe_account_id, stripe_transfer_id, currency, created_at')
    .in('booking_id', ids).not('stripe_transfer_id', 'is', null);
  if (payoutError) throw payoutError;

  const paidBack = new Map<string, { pence: number; transferId: string }>();
  const stillOwed: string[] = [];
  for (const payout of payouts ?? []) {
    // What this dispute took off the transfer, from Stripe itself.
    const reversals = await stripe.transfers.listReversals(payout.stripe_transfer_id, { limit: 100 });
    const taken = reversals.data
      .filter(r => r.metadata?.dispute_id === ref.stripeId)
      .reduce((sum, r) => sum + r.amount, 0);
    if (taken > 0) {
      const earlier = await findTransferTagged(stripe, payout.stripe_account_id, 'dispute_payback_for_payout', payout.id, payout.created_at);
      const transfer = earlier ?? await stripe.transfers.create(
        {
          amount: taken,
          currency: payout.currency ?? 'gbp',
          destination: payout.stripe_account_id,
          // Not payout_id: that names the original payout's transfer
          // (findPayoutTransfer), and this is a separate one.
          metadata: { dispute_payback_for_payout: payout.id, booking_id: payout.booking_id, dispute_id: ref.stripeId },
        },
        { idempotencyKey: `dispute_payback_${payout.id}` },
      );
      const sum = paidBack.get(payout.booking_id);
      paidBack.set(payout.booking_id, { pence: (sum?.pence ?? 0) + taken, transferId: transfer.id });
    }
    // Anything their Stripe balance couldn't cover became a debt. Debts have
    // no automatic way to be cancelled, so a person does it.
    const { data: debt, error: debtError } = await admin.from('provider_shortfalls')
      .select('amount_pence, recovered_pence').eq('source_key', `dispute_reversal_payout_${payout.id}`).maybeSingle();
    if (debtError) throw debtError;
    if (debt) {
      const [line] = await describeBookings(admin, [payout.booking_id]);
      stillOwed.push(`${line ?? payout.booking_id}: ${money(Number(debt.amount_pence))} recorded as owed, ${money(Number(debt.recovered_pence))} already taken from later payouts`);
    }
  }
  for (const [bookingId, back] of paidBack) {
    const { error: writeError } = await admin.from('payment_dispute_bookings')
      .update({ paid_back_pence: back.pence, paid_back_transfer_id: back.transferId })
      .eq('dispute_id', ref.rowId).eq('booking_id', bookingId);
    if (writeError) throw writeError;
  }
  if (stillOwed.length) {
    await sendSupportAlert(bankDisputeSupportEmail({
      title: 'A bank dispute was won: a provider debt needs cancelling',
      amount: '—',
      reason: `dispute ${ref.stripeId} won`,
      bookings: stillOwed,
      nextStep: "Whatever was reversed from the provider's Stripe balance has been paid back automatically. The part that became a debt hasn't: cancel what's left of it and pay back anything already taken from their later payouts.",
    }), 'bank-dispute');
  }
}

/** release-payouts: what to do with this booking's payout, its charge being disputed. */
export async function disputeVerdictForBooking(
  admin: SupabaseClient, chargeId: string, bookingId: string,
): Promise<DisputePayoutVerdict> {
  const { data: disputes, error } = await admin.from('payment_disputes')
    .select('id, closed_at, outcome').eq('charge_id', chargeId).limit(10);
  if (error) throw error;
  if (!disputes?.length) return disputePayoutVerdict({ dispute: null, role: null });
  const { data: links, error: linkError } = await admin.from('payment_dispute_bookings')
    .select('dispute_id, role').eq('booking_id', bookingId).in('dispute_id', disputes.map(d => d.id));
  if (linkError) throw linkError;
  return combineDisputeVerdicts(disputes.map(d => disputePayoutVerdict({
    dispute: { closed: d.closed_at !== null, outcome: d.outcome },
    role: links?.find(l => l.dispute_id === d.id)?.role ?? null,
  })));
}

/** One line per booking for a support email. Never throws: an alert must not
 *  fail the money work that prompted it; ids stand in if the read fails. */
async function describeBookings(admin: SupabaseClient, bookingIds: string[]): Promise<string[]> {
  if (bookingIds.length === 0) return [];
  const { data, error } = await admin.from('bookings')
    .select('id, service_name_snapshot, provider_name_snapshot, booking_date, amount_paid')
    .in('id', bookingIds).limit(50);
  if (error || !data) {
    console.error(`[bank-dispute] couldn't describe bookings for an alert: ${String(error)}`);
    return bookingIds;
  }
  return data.map(b => `${b.service_name_snapshot ?? 'Booking'} with ${b.provider_name_snapshot ?? 'a provider'}, ${b.booking_date ?? ''}, ${money(pence(b.amount_paid))} (${b.id})`);
}
