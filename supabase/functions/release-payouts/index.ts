import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@17.4.0?target=deno';

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

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Only the server/cron may run this. The service role key is the shared
  // secret; a normal user session must never reach the transfer path.
  const authHeader = req.headers.get('Authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { data: due, error: dueError } = await admin
      .from('provider_payouts')
      .select('id, booking_id, provider_id, stripe_account_id, payout_amount, currency')
      .eq('status', 'held')
      .lte('release_after', new Date().toISOString())
      .order('release_after', { ascending: true })
      .limit(BATCH_LIMIT);
    if (dueError) throw dueError;

    let transferred = 0;
    let cancelled = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of due ?? []) {
      // Re-check the booking is still genuinely owed before moving money.
      const { data: booking, error: bookingError } = await admin
        .from('bookings')
        .select('status')
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

      if (row.payout_amount <= 0) {
        // Zero-value payout (shouldn't happen given the split, but never call
        // Stripe with it). Close it out.
        await admin.from('provider_payouts').update({ status: 'cancelled', failure_reason: 'zero payout amount' })
          .eq('id', row.id).eq('status', 'held');
        cancelled++;
        continue;
      }

      try {
        const transfer = await stripe.transfers.create(
          {
            amount: row.payout_amount,
            currency: row.currency ?? 'gbp',
            destination: row.stripe_account_id,
            // Ties the transfer back to what it paid, for reconciliation and
            // for the webhook to match it.
            metadata: { payout_id: row.id, booking_id: row.booking_id, provider_id: row.provider_id },
          },
          // The money-safety guarantee: same key -> same transfer, never a
          // second one, if this row is ever retried.
          { idempotencyKey: `payout_${row.id}` },
        );

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
        // restricted). Mark failed with the real reason for admin follow-up;
        // it won't be auto-retried (status leaves 'held').
        const { error: failWriteErr } = await admin
          .from('provider_payouts')
          .update({ status: 'failed', failure_reason: String(err).slice(0, 500) })
          .eq('id', row.id)
          .eq('status', 'held');
        if (failWriteErr) console.error(`[release-payouts] fail-status write errored for ${row.id}: ${String(failWriteErr)}`);
        console.error(`[release-payouts] transfer failed for payout ${row.id}: ${String(err)}`);
        failed++;
      }
    }

    console.log(`[release-payouts] done: transferred=${transferred} cancelled=${cancelled} failed=${failed} skipped=${skipped} considered=${(due ?? []).length}`);
    return new Response(
      JSON.stringify({ transferred, cancelled, failed, skipped, considered: (due ?? []).length }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error(`[release-payouts] fatal: ${String(err)}`);
    return new Response(JSON.stringify({ error: 'Release run failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
