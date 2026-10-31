import { createClient } from 'npm:@supabase/supabase-js@2.100.0';
import Stripe from 'npm:stripe@17.4.0';
import { isServiceRoleRequest } from '../_shared/serviceAuth.ts';
import { lapseFeePayRequests, retryDueFees } from '../_shared/feePayRequest.ts';
import {
  classifyTransferFailure, describeTransferFailure, nextPayoutRetryAt, PAYOUT_MAX_ATTEMPTS,
} from '../_shared/payoutRetry.ts';
import { sendSupportAlert } from '../_shared/supportAlert.ts';
import { payoutFailedSupportEmail } from '../_shared/emailTemplates.ts';

// Step 3 of the Connect build (handoff: stripe-connect-payouts-build-handoff):
// the release job. It finds 'held' payout rows whose hold has elapsed
// (release_after <= now) and pays each provider their split out of the
// platform balance with a Stripe Transfer to their connected account.
//
// Invoked by pg_cron via the process_due_payouts() DB function (same
// vault-secret + net.http_post pattern the booking-confirmation retry uses),
// never by an end user. It authenticates the caller by requiring the service
// role key as the bearer token — only the server/cron holds it.
//
// MONEY SAFETY — the two things that must not go wrong:
//   1. Never pay twice. Every transfer uses the payout row's id as the Stripe
//      idempotency key, so if the status write fails after a successful
//      transfer and the row is picked up again, Stripe returns the SAME
//      transfer instead of creating a second one. The job is self-healing on
//      a partial failure rather than double-paying.
//   2. Never pay for a booking that isn't owed. A booking can be cancelled or
//      declined between finalise and release; before transferring we re-check
//      the live booking status and cancel the payout (no transfer) unless the
//      booking is genuinely confirmed/completed.

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// How many due rows to process per invocation. The cron runs frequently, so a
// modest cap keeps any single run bounded; a backlog drains over subsequent
// runs.
const BATCH_LIMIT = 50;

// Booking states in which the provider is genuinely owed their payout. Anything
// else (cancelled, declined, rejected, still-pending-and-stale, on_hold) means
// no money should move.
const PAYABLE_BOOKING_STATUSES = ['confirmed', 'completed'];

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Only the server/cron may run this. The service role key is the shared
  // secret; a normal user session must never reach the transfer path.
  if (!(await isServiceRoleRequest(req.headers.get('Authorization')))) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { data: due, error: dueError } = await admin
      .from('provider_payouts')
      .select('id, booking_id, provider_id, stripe_account_id, payout_amount, currency, attempt_count')
      .eq('status', 'held')
      .lte('release_after', new Date().toISOString())
      .order('release_after', { ascending: true })
      .limit(BATCH_LIMIT);
    if (dueError) throw dueError;

    let transferred = 0;
    let cancelled = 0;
    let failed = 0;
    let skipped = 0;

    // A booking with a refund request still open (with the provider, or under
    // review by Cerviced) keeps its payout held until the request is closed,
    // so a refund can come out of money Cerviced still has. One query for the
    // whole batch; the row is simply picked up again on a later run.
    const dueBookingIds = (due ?? []).map(row => row.booking_id);
    const { data: openRequests, error: requestError } = dueBookingIds.length
      ? await admin.from('refund_requests').select('booking_id')
        .in('booking_id', dueBookingIds).in('status', ['with_provider', 'under_review'])
      : { data: [], error: null };
    if (requestError) throw requestError;
    const awaitingRefundDecision = new Set((openRequests ?? []).map(r => r.booking_id));

    for (const row of due ?? []) {
      if (awaitingRefundDecision.has(row.booking_id)) { skipped++; continue; }

      // Re-check the booking is still genuinely owed before moving money.
      const { data: booking, error: bookingError } = await admin
        .from('bookings')
        .select('status, payment_intent_id, payment_status, stripe_refund_id')
        .eq('id', row.booking_id)
        .maybeSingle();
      if (bookingError) {
        console.error(`[release-payouts] could not read booking ${row.booking_id}: ${String(bookingError)}`);
        skipped++;
        continue;
      }
      if (!booking || !PAYABLE_BOOKING_STATUSES.includes(booking.status)) {
        // The booking was cancelled/declined (or never confirmed) — cancel the
        // held payout, nothing was ever transferred so there's nothing to claw
        // back. (Refunds of the client's money are the refund function's job.)
        const { error: cancelErr } = await admin
          .from('provider_payouts')
          .update({ status: 'cancelled', failure_reason: `booking status ${booking?.status ?? 'missing'} at release` })
          .eq('id', row.id)
          .eq('status', 'held');
        if (cancelErr) console.error(`[release-payouts] cancel write failed for ${row.id}: ${String(cancelErr)}`);
        else cancelled++;
        continue;
      }

      // Never fund a transfer from an unverified or fully refunded booking. A
      // PARTIALLY refunded one (policy kept a deposit, or a provider's partial
      // refund) is still owed what's left — reconcileRefund already lowered
      // payout_amount — so it passes here and is checked against the ledger below.
      if (!booking.payment_intent_id || booking.payment_status === 'refunded'
          || (booking.stripe_refund_id && booking.payment_status !== 'partially_refunded')) {
        skipped++;
        continue;
      }
      const payment = await stripe.paymentIntents.retrieve(booking.payment_intent_id);
      if (payment.status !== 'succeeded' || !payment.latest_charge) {
        skipped++;
        continue;
      }
      const chargeId = typeof payment.latest_charge === 'string' ? payment.latest_charge : payment.latest_charge.id;
      const charge = await stripe.charges.retrieve(chargeId);
      if (charge.disputed) { skipped++; continue; }
      // A refund on the charge is fine only if every penny of it is one the
      // booking_refunds ledger recorded AND already took off its payout. (A
      // batch charge covers several bookings, so sum across all of them.)
      // Anything unexplained — a dashboard refund, an adjustment still in
      // flight — holds the payout as before.
      if (charge.amount_refunded > 0) {
        const { data: siblings, error: sibErr } = await admin.from('bookings')
          .select('id').eq('payment_intent_id', booking.payment_intent_id).limit(50);
        const ids = (siblings ?? []).map(b => b.id);
        const { data: ledger, error: ledErr } = ids.length
          ? await admin.from('booking_refunds').select('amount_pence, payout_applied').in('booking_id', ids)
          : { data: [], error: null };
        if (sibErr || ledErr) { skipped++; continue; }
        const recorded = (ledger ?? []).reduce((sum, r) => sum + Number(r.amount_pence), 0);
        const allApplied = (ledger ?? []).every(r => r.payout_applied);
        if (recorded !== charge.amount_refunded || !allApplied) { skipped++; continue; }
      }

      // Re-read the amount right before paying: a partial refund since this
      // run started lowers payout_amount, and the old figure must not go out.
      const { data: fresh, error: freshErr } = await admin.from('provider_payouts')
        .select('status, payout_amount').eq('id', row.id).maybeSingle();
      if (freshErr || !fresh || fresh.status !== 'held') { skipped++; continue; }
      row.payout_amount = Number(fresh.payout_amount);

      if (row.payout_amount <= 0) {
        // Zero-value payout (shouldn't happen given the split, but never call
        // Stripe with it). Close it out.
        await admin.from('provider_payouts').update({ status: 'cancelled', failure_reason: 'zero payout amount' })
          .eq('id', row.id).eq('status', 'held');
        cancelled++;
        continue;
      }

      let madeTransfer = false;
      try {
        // Stripe may prune idempotency keys after 24 hours. The transfer group
        // makes recovery durable when a successful transfer's DB write failed:
        // that transfer is recorded as it is, with no new deduction.
        const previous = (await stripe.transfers.list({ transfer_group: `payout_${row.id}`, limit: 1 })).data[0];
        let transferPence = 0;
        if (!previous) {
          // Take anything the provider still owes from an earlier refund or
          // dispute (a reversal their Stripe balance couldn't cover) out of
          // this payout first. Returns what is left to send, read under the
          // payout's row lock.
          const { data: net, error: shortfallErr } = await admin.rpc('apply_provider_shortfalls', { p_payout_id: row.id });
          if (shortfallErr) throw shortfallErr;
          transferPence = Number(net ?? 0);
          if (transferPence <= 0) {
            // All of it settled what the provider owed; nothing to send.
            const { error: settleErr } = await admin.from('provider_payouts')
              .update({ status: 'transferred', failure_reason: 'settled an earlier shortfall in full' })
              .eq('id', row.id).eq('status', 'held');
            if (settleErr) throw settleErr;
            transferred++;
            continue;
          }
        }
        const transfer = previous ?? await stripe.transfers.create(
          {
            amount: transferPence,
            currency: row.currency ?? 'gbp',
            destination: row.stripe_account_id,
            source_transaction: chargeId,
            transfer_group: `payout_${row.id}`,
            // Ties the transfer back to what it paid, for reconciliation and
            // for the webhook to match it.
            metadata: { payout_id: row.id, booking_id: row.booking_id, provider_id: row.provider_id },
          },
          // The money-safety guarantee: same key -> same transfer, never a
          // second one, if this row is ever retried.
          { idempotencyKey: `payout_${row.id}` },
        );
        madeTransfer = true;

        const { error: writeErr } = await admin
          .from('provider_payouts')
          .update({ status: 'transferred', stripe_transfer_id: transfer.id, failure_reason: null })
          .eq('id', row.id)
          .eq('status', 'held');
        if (writeErr) {
          // Transfer went through but we couldn't record it. Leave the row as
          // 'held' so a later run retries the write; the idempotency key means
          // that retry re-fetches this exact transfer rather than making a new
          // one. Log loudly.
          console.error(`[release-payouts] transfer ${transfer.id} succeeded but status write failed for payout ${row.id}: ${String(writeErr)}`);
        }
        transferred++;
      } catch (err) {
        // A real transfer failure (e.g. insufficient platform balance, account
        // restricted). If no transfer was made, whatever was deducted for
        // shortfalls goes back on the provider's balance owed, so it isn't
        // forgiven by a payout that never went out. A timeout can hide a
        // transfer Stripe did make, so look before giving back.
        if (!madeTransfer) {
          const late = await stripe.transfers.list({ transfer_group: `payout_${row.id}`, limit: 1 }).catch(() => null);
          madeTransfer = !!late?.data[0] || late === null;
        }
        if (!madeTransfer) {
          const { error: releaseErr } = await admin.rpc('release_provider_shortfalls', { p_payout_id: row.id });
          if (releaseErr) console.error(`[release-payouts] could not give back shortfall deductions on ${row.id}: ${String(releaseErr)}`);
        }
        // Try again later, up to PAYOUT_MAX_ATTEMPTS tries, by leaving the row
        // 'held' with a later release_after. Only when we know no transfer
        // went out: if we couldn't tell (madeTransfer), a person checks Stripe.
        const attempts = Number(row.attempt_count ?? 0) + 1;
        const retryAt = madeTransfer ? null : nextPayoutRetryAt(attempts, new Date());
        const { error: failWriteErr } = await admin
          .from('provider_payouts')
          .update({
            ...(retryAt ? { release_after: retryAt.toISOString() } : { status: 'failed' }),
            failure_reason: String(err).slice(0, 500),
            failure_cause: classifyTransferFailure(err),
            attempt_count: attempts,
            last_failed_at: new Date().toISOString(),
          })
          .eq('id', row.id)
          .eq('status', 'held');
        if (failWriteErr) console.error(`[release-payouts] fail-status write errored for ${row.id}: ${String(failWriteErr)}`);
        console.error(`[release-payouts] transfer failed for payout ${row.id} (try ${attempts}): ${String(err)}`);
        await reportPayoutFailure(row, err, attempts, retryAt, madeTransfer);
        failed++;
      }
    }

    const fees = await releaseFeePayouts();
    const tips = await releaseTipPayouts();
    // Declined fees whose next automatic retry on the saved card is due.
    const feeRetries = await retryDueFees(admin, stripe, BATCH_LIMIT)
      .catch((err) => { console.error(`[release-payouts] fee retries failed: ${String(err)}`); return null; });
    // Requests to pay a fee the saved card couldn't, past their 7 days.
    const lapsedFeeRequests = await lapseFeePayRequests(admin, stripe, BATCH_LIMIT)
      .catch((err) => { console.error(`[release-payouts] fee request lapse failed: ${String(err)}`); return -1; });

    console.log(`[release-payouts] done: transferred=${transferred} cancelled=${cancelled} failed=${failed} skipped=${skipped} considered=${(due ?? []).length} fees=${JSON.stringify(fees)} tips=${JSON.stringify(tips)} lapsedFeeRequests=${lapsedFeeRequests} feeRetries=${JSON.stringify(feeRetries)}`);
    return new Response(
      JSON.stringify({ transferred, cancelled, failed, skipped, considered: (due ?? []).length, fees, tips, lapsedFeeRequests, feeRetries }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error(`[release-payouts] fatal: ${String(err)}`);
    return new Response(JSON.stringify({ error: 'Release run failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});

// Tells support about a failed provider payout straight away, and tells the
// provider the first time it fails for a reason only they can fix. Never
// throws: the payout row is already written by the time this runs.
async function reportPayoutFailure(
  row: { id: string; booking_id: string; provider_id: string; payout_amount: number },
  err: unknown,
  attempts: number,
  retryAt: Date | null,
  uncertain: boolean,
) {
  try {
    const cause = classifyTransferFailure(err);
    const [{ data: provider }, { data: booking }] = await Promise.all([
      admin.from('providers').select('user_id, display_name').eq('id', row.provider_id).maybeSingle(),
      admin.from('bookings').select('service_name_snapshot, booking_date').eq('id', row.booking_id).maybeSingle(),
    ]);
    const amount = `£${(Number(row.payout_amount) / 100).toFixed(2)}`;
    const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
    const nextStep = uncertain
      ? "We couldn't tell whether Stripe sent it, so it won't be tried again by itself. Check the provider's transfers in Stripe before retrying it from the admin screen."
      : retryAt
        ? `It will be tried again by itself on ${day(retryAt)}.${cause === 'provider_account' ? ' The provider has been asked to fix their Stripe account.' : ''} You don't need to do anything yet.`
        : 'That was the last automatic try. Retry it from the admin screen once the cause is fixed.';
    await sendSupportAlert(payoutFailedSupportEmail({
      kind: 'transfer',
      provider: provider?.display_name || 'Unknown provider',
      amount,
      booking: booking ? `${booking.service_name_snapshot ?? 'Booking'} · ${booking.booking_date}` : null,
      why: describeTransferFailure(cause),
      tries: `${attempts} of ${PAYOUT_MAX_ATTEMPTS}`,
      nextStep,
    }), 'release-payouts');

    if (cause === 'provider_account' && attempts === 1 && provider?.user_id) {
      const { error } = await admin.from('notifications').insert({
        user_id: provider.user_id,
        type: 'payout_failed',
        title: `We couldn't send your ${amount}`,
        message: "Your Stripe account can't receive payments yet. Open Payments to finish setting it up, and we'll send it again by itself.",
        priority: 'high',
        is_actionable: true,
        booking_id: row.booking_id,
        provider_id: row.provider_id,
        recipient_role: 'provider',
        metadata: { payout_id: row.id },
      });
      if (error) console.error(`[release-payouts] provider not told about failed payout ${row.id}: ${String(error)}`);
    }
  } catch (e) {
    console.error(`[release-payouts] could not report failed payout ${row.id}: ${String(e)}`);
  }
}

// Late/no-show fee payouts (booking_fee_charges, not provider_payouts — see the
// fees migration for why). Same money-safety rules as above: re-check the fee
// is still owed, never fund one from a refunded or bank-disputed charge, one
// transfer per fee via its idempotency key + transfer group. A fee with an open
// in-app dispute waits until the provider answers it.
async function releaseFeePayouts() {
  const counts = { transferred: 0, cancelled: 0, failed: 0, skipped: 0, considered: 0 };
  const { data: due, error } = await admin.from('booking_fee_charges')
    .select('id, booking_id, provider_id, stripe_account_id, payout_pence, currency, status, payment_intent_id, disputed_at, dispute_resolved_at')
    .eq('payout_status', 'held')
    .lte('release_after', new Date().toISOString())
    .order('release_after', { ascending: true })
    .limit(BATCH_LIMIT);
  if (error) throw error;
  counts.considered = due?.length ?? 0;

  for (const fee of due ?? []) {
    if (fee.status !== 'succeeded' || !fee.payment_intent_id || !fee.stripe_account_id) {
      const { error: cancelErr } = await admin.from('booking_fee_charges')
        .update({ payout_status: 'cancelled', payout_failure_reason: `fee status ${fee.status} at release` })
        .eq('id', fee.id).eq('payout_status', 'held');
      if (cancelErr) console.error(`[release-payouts] fee cancel write failed for ${fee.id}: ${String(cancelErr)}`);
      else counts.cancelled++;
      continue;
    }
    if (fee.disputed_at && !fee.dispute_resolved_at) { counts.skipped++; continue; }
    if (!fee.payout_pence || fee.payout_pence <= 0) {
      await admin.from('booking_fee_charges').update({ payout_status: 'cancelled', payout_failure_reason: 'zero payout amount' })
        .eq('id', fee.id).eq('payout_status', 'held');
      counts.cancelled++;
      continue;
    }

    let madeTransfer = false;
    try {
      const intent = await stripe.paymentIntents.retrieve(fee.payment_intent_id);
      const chargeId = typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge?.id;
      if (intent.status !== 'succeeded' || !chargeId) { counts.skipped++; continue; }
      const charge = await stripe.charges.retrieve(chargeId);
      if (charge.disputed || charge.amount_refunded > 0) { counts.skipped++; continue; }

      const previous = (await stripe.transfers.list({ transfer_group: `fee_payout_${fee.id}`, limit: 1 })).data[0];
      let transferPence = 0;
      if (!previous) {
        // Anything the provider still owes comes out of the fee first, the
        // same as a booking payout (user decision 2026-10-29).
        const { data: net, error: shortfallErr } = await admin.rpc('apply_fee_payout_shortfalls', { p_fee_id: fee.id });
        if (shortfallErr) throw shortfallErr;
        transferPence = Number(net ?? 0);
        if (transferPence <= 0) {
          const { data: settled, error: settleErr } = await admin.from('booking_fee_charges')
            .update({ payout_status: 'transferred', payout_failure_reason: 'settled an earlier shortfall in full' })
            .eq('id', fee.id).eq('payout_status', 'held')
            .select('id');
          if (settleErr) throw settleErr;
          // The claim stops a refund cancelling it, so this shouldn't happen;
          // if it does, nothing was sent and the deduction must go back.
          if (!settled?.length) throw new Error('fee payout no longer held while settling a shortfall');
          counts.transferred++;
          continue;
        }
      }
      const transfer = previous ?? await stripe.transfers.create({
        amount: transferPence,
        currency: fee.currency ?? 'gbp',
        destination: fee.stripe_account_id,
        source_transaction: chargeId,
        transfer_group: `fee_payout_${fee.id}`,
        metadata: { fee_charge_id: fee.id, booking_id: fee.booking_id, provider_id: fee.provider_id },
      }, { idempotencyKey: `fee_payout_${fee.id}` });
      madeTransfer = true;

      const { data: written, error: writeErr } = await admin.from('booking_fee_charges')
        .update({ payout_status: 'transferred', stripe_transfer_id: transfer.id, payout_failure_reason: null })
        .eq('id', fee.id).eq('payout_status', 'held')
        .select('id');
      if (writeErr) console.error(`[release-payouts] fee transfer ${transfer.id} succeeded but write failed for ${fee.id}: ${String(writeErr)}`);
      // Money went out but the row had already left 'held' (the claim should
      // prevent this). Nothing will take this transfer back by itself.
      else if (!written?.length) console.error(`[release-payouts] fee transfer ${transfer.id} sent but fee ${fee.id} was no longer held; check it by hand`);
      counts.transferred++;
    } catch (err) {
      // As for booking payouts: if nothing was sent, give the deduction back
      // so the debt isn't forgiven by a fee the provider never received. A
      // timeout can hide a transfer Stripe did make, so look before giving back.
      if (!madeTransfer) {
        const late = await stripe.transfers.list({ transfer_group: `fee_payout_${fee.id}`, limit: 1 }).catch(() => null);
        madeTransfer = !!late?.data[0] || late === null;
      }
      if (!madeTransfer) {
        const { error: releaseErr } = await admin.rpc('release_fee_payout_shortfalls', { p_fee_id: fee.id });
        if (releaseErr) console.error(`[release-payouts] could not give back shortfall deductions on fee ${fee.id}: ${String(releaseErr)}`);
      }
      await admin.from('booking_fee_charges')
        .update({ payout_status: 'failed', payout_failure_reason: String(err).slice(0, 500) })
        .eq('id', fee.id).eq('payout_status', 'held');
      console.error(`[release-payouts] fee transfer failed for ${fee.id}: ${String(err)}`);
      counts.failed++;
    }
  }
  return counts;
}

// Tips follow the same 24-hour hold as fee payouts. The provider receives the
// client-paid amount less Stripe's actual fee (never a guessed percentage).
async function releaseTipPayouts() {
  const counts = { transferred: 0, cancelled: 0, failed: 0, skipped: 0, considered: 0 };
  const { data: due, error } = await admin.from('booking_tips')
    .select('id, booking_id, provider_id, payment_intent_id, payout_pence, currency')
    .eq('status', 'succeeded').eq('payout_status', 'held')
    .lte('release_after', new Date().toISOString()).order('release_after', { ascending: true }).limit(BATCH_LIMIT);
  if (error) throw error;
  counts.considered = due?.length ?? 0;
  for (const tip of due ?? []) {
    try {
      if (!tip.payment_intent_id || !tip.payout_pence || tip.payout_pence <= 0) {
        await admin.from('booking_tips').update({ payout_status: 'cancelled', failure_reason: 'missing payment or zero payout' }).eq('id', tip.id).eq('payout_status', 'held');
        counts.cancelled++; continue;
      }
      const { data: provider } = await admin.from('providers').select('stripe_account_id, stripe_payouts_enabled').eq('id', tip.provider_id).maybeSingle();
      if (!provider?.stripe_account_id || !provider.stripe_payouts_enabled) { counts.skipped++; continue; }
      const intent = await stripe.paymentIntents.retrieve(tip.payment_intent_id);
      const chargeId = typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge?.id;
      if (intent.status !== 'succeeded' || !chargeId) { counts.skipped++; continue; }
      const charge = await stripe.charges.retrieve(chargeId);
      if (charge.disputed || charge.amount_refunded > 0) { counts.skipped++; continue; }
      const previous = await stripe.transfers.list({ transfer_group: `tip_payout_${tip.id}`, limit: 1 });
      const transfer = previous.data[0] ?? await stripe.transfers.create({
        amount: tip.payout_pence, currency: tip.currency ?? 'gbp', destination: provider.stripe_account_id,
        source_transaction: chargeId, transfer_group: `tip_payout_${tip.id}`,
        metadata: { booking_tip_id: tip.id, booking_id: tip.booking_id, provider_id: tip.provider_id },
      }, { idempotencyKey: `tip_payout_${tip.id}` });
      const { error: writeError } = await admin.from('booking_tips').update({ payout_status: 'transferred', stripe_transfer_id: transfer.id, failure_reason: null })
        .eq('id', tip.id).eq('payout_status', 'held');
      if (writeError) throw writeError;
      counts.transferred++;
    } catch (err) {
      await admin.from('booking_tips').update({ payout_status: 'failed', failure_reason: String(err).slice(0, 500) }).eq('id', tip.id).eq('payout_status', 'held');
      console.error(`[release-payouts] tip transfer failed for ${tip.id}: ${String(err)}`);
      counts.failed++;
    }
  }
  return counts;
}
