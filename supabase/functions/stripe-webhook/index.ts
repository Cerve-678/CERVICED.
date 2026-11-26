import { reconcileRefund } from '../_shared/reconcileRefund.ts';
import { settleCheckout } from '../_shared/settleCheckout.ts';
import { checkRequestHold, REQUEST_HOLD_METADATA_KEY } from '../_shared/requestCardHolds.ts';
import { recordFeePaid } from '../_shared/feePayRequest.ts';
import { recordTipPaid } from '../_shared/recordTipPaid.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.100.0';
import Stripe from 'npm:stripe@17.4.0';
import { closeBankDispute, openBankDispute, updateBankDispute } from '../_shared/bankDispute.ts';
import { sendSupportAlert } from '../_shared/supportAlert.ts';
import { payoutFailedSupportEmail } from '../_shared/emailTemplates.ts';

// Signed Stripe events reconcile checkout capture, refunds, connected-account
// capabilities, and provider transfers. Always retrieve current Stripe state:
// delivery may be repeated or out of order. A handler failure returns 500 so
// Stripe retries; no Supabase JWT is expected from Stripe.

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')!;
const stripeKeyIsLive = /^(sk|rk)_live_/.test(stripeSecretKey);

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const webhookSecrets = [Deno.env.get('STRIPE_WEBHOOK_SECRET'), Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET')].filter((value): value is string => Boolean(value));

// Service role: this function does privileged, server-only writes to columns
// the client roles cannot touch (provider capability flags, the payout
// ledger). It never runs in a user's session.
const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req: Request) => {
  // Stripe only ever POSTs; no CORS/OPTIONS handling needed (it isn't a
  // browser caller).
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing signature', { status: 400 });
  }

  // The raw, unparsed body is required for signature verification — parsing it
  // first would change the bytes and break the HMAC.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    // constructEventAsync (not the sync variant) is mandatory on Deno: the
    // sync one uses Node's crypto, which isn't available here; the async one
    // uses Web Crypto (SubtleCrypto).
    let verified: Stripe.Event | undefined;
    for (const secret of webhookSecrets) {
      try {
        verified = await stripe.webhooks.constructEventAsync(rawBody, signature, secret, undefined, Stripe.createSubtleCryptoProvider());
        break;
      } catch { /* Try the optional separate Connect destination secret. */ }
    }
    if (!verified) throw new Error('No matching webhook signature');
    event = verified;
  } catch (err) {
    // A bad signature is the security boundary of this endpoint — reject it,
    // real reason to logs only.
    console.error(`[stripe-webhook] signature verification failed: ${String(err)}`);
    return new Response('Invalid signature', { status: 400 });
  }

  // An event from the other Stripe mode (a live event while this key is test,
  // or the reverse) is about objects this key can't read. Acknowledge it so
  // Stripe stops retrying, and don't touch the ledger.
  if (event.livemode !== stripeKeyIsLive) {
    console.warn(
      `[stripe-webhook] ignored ${event.type} ${event.id}: event is ${event.livemode ? 'live' : 'test'} mode, ` +
      `key is ${stripeKeyIsLive ? 'live' : 'test'} mode`,
    );
    return new Response(JSON.stringify({ received: true, ignored: 'other_mode' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    switch (event.type) {
      case 'payment_intent.amount_capturable_updated':
      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent;
        if (intent.metadata.checkout_batch_id) await settleCheckout(admin, stripe, intent.id);
        // A request's own card hold: its bank check was confirmed (the app
        // normally reports it first; this covers an app closed mid-check).
        // Capture is the database's decision, so 'succeeded' needs nothing.
        if (intent.metadata[REQUEST_HOLD_METADATA_KEY] && event.type === 'payment_intent.amount_capturable_updated') {
          await checkRequestHold(admin, stripe, intent.metadata[REQUEST_HOLD_METADATA_KEY]);
        }
        // A late/no-show fee: charged off-session, or paid by the client after
        // a request (in the app or on Stripe's emailed page). Idempotent.
        if (intent.metadata.fee_charge_id && event.type === 'payment_intent.succeeded') {
          await recordFeePaid(admin, stripe, intent.metadata.fee_charge_id, intent.id);
        }
        if (intent.metadata.booking_tip_id && event.type === 'payment_intent.succeeded') {
          await recordTipPaid(admin, stripe, intent.metadata.booking_tip_id, intent.id);
        }
        break;
      }
      case 'refund.created':
      case 'refund.updated': {
        const refund = await stripe.refunds.retrieve((event.data.object as Stripe.Refund).id);
        // A late/no-show fee refund is recorded by booking-fee itself.
        if (refund.metadata?.fee_charge_id) break;
        await reconcileRefund(admin, stripe, refund);
        break;
      }
      case 'account.updated': {
        await handleAccountUpdated(event.data.object as Stripe.Account);
        break;
      }
      case 'transfer.created':
      case 'transfer.updated': {
        await handleTransfer(event.data.object as Stripe.Transfer);
        break;
      }
      case 'transfer.reversed': {
        await handleTransferReversed(event.data.object as Stripe.Transfer);
        break;
      }
      case 'charge.dispute.created':
      case 'charge.dispute.updated':
      case 'charge.dispute.closed': {
        // CERVICED doesn't take a side (user decision 2026-10-17): the bank
        // decides, and the provider whose booking it is carries the cost. One
        // payment can pay several providers, so only the booking(s) the
        // dispute is about are touched (_shared/bankDispute.ts): their payout
        // is taken back when it opens and paid back if CERVICED wins; a
        // payout not yet sent waits for the outcome (release-payouts).
        const dispute = event.data.object as Stripe.Dispute;
        if (event.type === 'charge.dispute.created') await openBankDispute(admin, stripe, dispute);
        else if (event.type === 'charge.dispute.updated') await updateBankDispute(admin, dispute);
        else await closeBankDispute(admin, stripe, dispute);
        console.warn(
          `[stripe-webhook] ${event.type} dispute=${dispute.id} charge=${String(dispute.charge)} ` +
          `amount=${dispute.amount} status=${dispute.status} reason=${dispute.reason} — answer it in the Stripe Dashboard`,
        );
        break;
      }
      case 'payout.failed': {
        // A connected account's bank payout (their balance -> their bank)
        // failing is the provider's concern with Stripe, not our ledger's:
        // Stripe holds the money and pays it again once the bank details are
        // fixed. Tell the provider and support so it isn't silent.
        const payout = event.data.object as Stripe.Payout;
        console.warn(
          `[stripe-webhook] payout.failed payout=${payout.id} account=${event.account ?? 'platform'} — ` +
          `failure=${payout.failure_code ?? 'unknown'} — provider bank payout failed`,
        );
        if (event.account) await handleBankPayoutFailed(payout, event.account);
        break;
      }
      default:
        // Every other event is acknowledged so Stripe stops retrying, but we
        // don't pretend to handle it.
        console.log(`[stripe-webhook] unhandled event type ${event.type}`);
    }
  } catch (err) {
    // Returning 500 tells Stripe to retry later, which is what we want if a
    // handler failed transiently (DB blip). Real reason to logs.
    console.error(`[stripe-webhook] handler for ${event.type} failed: ${String(err)}`);
    return new Response('Handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

// A provider's own bank payout failed (payout.failed on their connected
// account). One notification per Stripe payout id, so Stripe redelivering the
// event doesn't repeat it, and support hears about it the same once.
async function handleBankPayoutFailed(payout: Stripe.Payout, accountId: string): Promise<void> {
  const { data: provider, error } = await admin
    .from('providers').select('id, user_id, display_name').eq('stripe_account_id', accountId).maybeSingle();
  if (error) throw error;
  if (!provider) {
    console.warn(`[stripe-webhook] payout.failed for unknown account ${accountId}`);
    return;
  }
  const { data: already, error: seenError } = await admin.from('notifications')
    .select('id').eq('user_id', provider.user_id).eq('type', 'payout_failed')
    .eq('metadata->>bank_payout_id', payout.id).limit(1);
  if (seenError) throw seenError;
  if (already?.length) return;

  const amount = `£${(payout.amount / 100).toFixed(2)}`;
  const { error: insertError } = await admin.from('notifications').insert({
    user_id: provider.user_id,
    type: 'payout_failed',
    title: `Your bank didn't accept ${amount}`,
    message: "Your bank turned down a payout from Stripe. Check your bank details in Payments. The money is safe and Stripe sends it again once they're fixed.",
    priority: 'high',
    is_actionable: true,
    provider_id: provider.id,
    recipient_role: 'provider',
    metadata: { bank_payout_id: payout.id },
  });
  if (insertError) throw insertError;
  await sendSupportAlert(payoutFailedSupportEmail({
    kind: 'bank',
    provider: provider.display_name || 'Unknown provider',
    amount,
    booking: null,
    why: `Their bank turned it down (${payout.failure_code ?? 'no reason given'}).`,
    tries: null,
    nextStep: 'The provider has been asked to check their bank details. Stripe keeps the money and pays it again once they do.',
  }), 'stripe-webhook');
}

// Mirror the connected account's capability flags onto the provider row. Only
// writes when something actually changed, so a redelivered event doesn't churn
// the row (and doesn't needlessly re-fire the go-live trigger, which is gated
// on stripe_charges_enabled changing).
async function handleAccountUpdated(eventAccount: Stripe.Account): Promise<void> {
  // Find the provider before asking Stripe about the account. An account we
  // don't own (one created but never saved to a provider, or one from the other
  // Stripe mode, which this key can't read) has nothing to sync. Calling Stripe
  // first made those throw, so Stripe retried them with a 500.
  const { data: provider, error: readError } = await admin
    .from('providers')
    .select('id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted')
    .eq('stripe_account_id', eventAccount.id)
    .maybeSingle();
  if (readError) throw readError;
  if (!provider) {
    console.warn(`[stripe-webhook] account.updated for unknown account ${eventAccount.id}`);
    return;
  }

  // Read current state: events can arrive out of order.
  const account = await stripe.accounts.retrieve(eventAccount.id);

  const nextCharges = account.charges_enabled === true;
  const nextPayouts = account.payouts_enabled === true;
  const nextDetails = account.details_submitted === true;

  if (
    provider.stripe_charges_enabled === nextCharges &&
    provider.stripe_payouts_enabled === nextPayouts &&
    provider.stripe_details_submitted === nextDetails
  ) {
    return; // No change — skip the write.
  }

  const { error: writeError } = await admin
    .from('providers')
    .update({
      stripe_charges_enabled: nextCharges,
      stripe_payouts_enabled: nextPayouts,
      stripe_details_submitted: nextDetails,
    })
    .eq('id', provider.id);
  if (writeError) throw writeError;

  console.log(
    `[stripe-webhook] synced provider=${provider.id} account=${account.id} ` +
    `charges=${nextCharges} payouts=${nextPayouts} details=${nextDetails}`,
  );
}

// A Transfer confirming (or updating) that a provider's split left the
// platform balance for their connected account. Match it to the ledger row the
// release job stamped with this transfer id and mark it transferred. Idempotent
// on redelivery — writing 'transferred' twice is a no-op-equivalent update.
async function handleTransfer(eventTransfer: Stripe.Transfer): Promise<void> {
  const transfer = await stripe.transfers.retrieve(eventTransfer.id);
  if (transfer.reversed) { await handleTransferReversed(transfer); return; }
  const payoutId = transfer.metadata.payout_id;
  if (!payoutId) return;
  const { data: payout, error } = await admin.from('provider_payouts')
    .select('id, booking_id, stripe_account_id, payout_amount, deducted_pence, status').eq('id', payoutId).single();
  if (error) throw error;
  if (payout.status === 'reversed') return;
  const destination = typeof transfer.destination === 'string' ? transfer.destination : transfer.destination?.id;
  // A partial refund lowers payout_amount by reversing part of the transfer,
  // so compare against what is left of it, not its original amount. Anything
  // deducted for an earlier shortfall never went into the transfer.
  const netTransferred = transfer.amount - (transfer.amount_reversed ?? 0);
  // A take-back Stripe couldn't reverse lowered payout_amount but left the
  // transfer whole; it is recorded as a shortfall against this transfer.
  const { data: owed, error: owedError } = await admin.from('provider_shortfalls')
    .select('unreversed_pence').eq('stripe_transfer_id', transfer.id)
    // Only these also lowered payout_amount; a bank-dispute shortfall didn't.
    .in('source', ['refund', 'cancellation']).limit(50);
  if (owedError) throw owedError;
  const unreversed = (owed ?? []).reduce((sum, r) => sum + Number(r.unreversed_pence), 0);
  const expected = payout.payout_amount - Number(payout.deducted_pence ?? 0) + unreversed;
  if (destination !== payout.stripe_account_id || netTransferred !== expected) throw new Error('Transfer mismatch');
  const { error: writeError } = await admin.from('provider_payouts')
    .update({ status: 'transferred', stripe_transfer_id: transfer.id, failure_reason: null })
    .eq('id', payout.id).neq('status', 'reversed');
  if (writeError) throw writeError;
  const { data: booking, error: bookingError } = await admin.from('bookings')
    .select('stripe_refund_id').eq('id', payout.booking_id).single();
  if (bookingError) throw bookingError;
  if (booking.stripe_refund_id) await reconcileRefund(admin, stripe, await stripe.refunds.retrieve(booking.stripe_refund_id));
}

// A Transfer reversal — the platform clawed a provider's split back after a
// post-transfer refund. Reflect it on the ledger row.
async function handleTransferReversed(transfer: Stripe.Transfer): Promise<void> {
  const reversalId = transfer.reversals?.data?.[0]?.id ?? null;
  // transfer.reversed fires for PARTIAL reversals too (a provider's partial or
  // goodwill refund). Only a fully reversed transfer means the payout is gone;
  // a partial one was already recorded by reconcileRefund, which lowered
  // payout_amount, so just note the reversal id.
  const fullyReversed = transfer.reversed === true || (transfer.amount_reversed ?? 0) >= transfer.amount;
  const { data: rows, error } = await admin
    .from('provider_payouts')
    .update(fullyReversed ? { status: 'reversed', payout_amount: 0, stripe_reversal_id: reversalId } : { stripe_reversal_id: reversalId })
    .eq('stripe_transfer_id', transfer.id)
    .select('id');
  if (error) throw error;
  if (!rows || rows.length === 0) {
    console.log(`[stripe-webhook] transfer.reversed ${transfer.id} matched no payout row`);
    return;
  }
  console.log(`[stripe-webhook] payout row(s) ${rows.map((r) => r.id).join(',')} marked reversed (transfer=${transfer.id})`);
}
