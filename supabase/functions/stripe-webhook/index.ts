import { reconcileRefund } from '../_shared/reconcileRefund.ts';
import { settleCheckout } from '../_shared/settleCheckout.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.100.0';
import Stripe from 'npm:stripe@17.4.0';

// Signed Stripe events reconcile checkout capture, refunds, connected-account
// capabilities, and provider transfers. Always retrieve current Stripe state:
// delivery may be repeated or out of order. A handler failure returns 500 so
// Stripe retries; no Supabase JWT is expected from Stripe.

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
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

  try {
    switch (event.type) {
      case 'payment_intent.amount_capturable_updated':
      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent;
        if (intent.metadata.checkout_batch_id) await settleCheckout(admin, stripe, intent.id);
        break;
      }
      case 'refund.created':
      case 'refund.updated': {
        const refund = await stripe.refunds.retrieve((event.data.object as Stripe.Refund).id);
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
        // Not auto-resolved in v1 — surfaced for admin/legal follow-up.
        const dispute = event.data.object as Stripe.Dispute;
        console.warn(
          `[stripe-webhook] ${event.type} dispute=${dispute.id} charge=${String(dispute.charge)} ` +
          `amount=${dispute.amount} status=${dispute.status} reason=${dispute.reason} — needs manual review`,
        );
        break;
      }
      case 'payout.failed': {
        // A connected account's bank payout (their balance -> their bank)
        // failing is the provider's concern with Stripe, not our ledger's, but
        // it's worth a loud log.
        const payout = event.data.object as Stripe.Payout;
        console.warn(
          `[stripe-webhook] payout.failed payout=${payout.id} account_event — ` +
          `failure=${payout.failure_code ?? 'unknown'} — provider bank payout failed`,
        );
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

// Mirror the connected account's capability flags onto the provider row. Only
// writes when something actually changed, so a redelivered event doesn't churn
// the row (and doesn't needlessly re-fire the go-live trigger, which is gated
// on stripe_charges_enabled changing).
async function handleAccountUpdated(eventAccount: Stripe.Account): Promise<void> {
  // Read current state: events can arrive out of order.
  const account = await stripe.accounts.retrieve(eventAccount.id);
  const { data: provider, error: readError } = await admin
    .from('providers')
    .select('id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted')
    .eq('stripe_account_id', account.id)
    .maybeSingle();
  if (readError) throw readError;
  if (!provider) {
    // An account we don't have a provider row for (e.g. an account created but
    // its id never persisted). Nothing to sync; log so it's visible.
    console.warn(`[stripe-webhook] account.updated for unknown account ${account.id}`);
    return;
  }

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
    .select('id, booking_id, stripe_account_id, payout_amount, status').eq('id', payoutId).single();
  if (error) throw error;
  if (payout.status === 'reversed') return;
  const destination = typeof transfer.destination === 'string' ? transfer.destination : transfer.destination?.id;
  if (destination !== payout.stripe_account_id || transfer.amount !== payout.payout_amount) throw new Error('Transfer mismatch');
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
  const { data: rows, error } = await admin
    .from('provider_payouts')
    .update({ status: 'reversed', stripe_reversal_id: reversalId })
    .eq('stripe_transfer_id', transfer.id)
    .select('id');
  if (error) throw error;
  if (!rows || rows.length === 0) {
    console.log(`[stripe-webhook] transfer.reversed ${transfer.id} matched no payout row`);
    return;
  }
  console.log(`[stripe-webhook] payout row(s) ${rows.map((r) => r.id).join(',')} marked reversed (transfer=${transfer.id})`);
}

