import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@17.4.0?target=deno';

// Stripe -> CERVICED webhook. This is the LINCHPIN of the Connect build:
// nothing flips a provider payout-eligible or moves a payout row through its
// lifecycle without a Stripe event arriving here. Two jobs it actually owns:
//
//   1. account.updated  -> mirror the connected account's capability flags
//      onto the provider row (stripe_charges_enabled/payouts_enabled/
//      details_submitted). The providers trigger then re-runs the go-live
//      check, so a provider becomes bookable the moment Stripe says they can
//      be paid. The app trusts THESE columns, never a client-sent value.
//
//   2. transfer.*  -> keep the provider_payouts ledger honest. A Transfer is
//      how the platform pays a provider their split out of the platform
//      balance; the release job creates it and stamps stripe_transfer_id, and
//      these events confirm/reverse it.
//
// charge.dispute.* and payout.* are logged with enough detail for a human to
// act on, but are NOT auto-resolved here — disputes and connected-account
// bank payouts need admin/legal judgement in v1, and silently mutating money
// rows off them would be worse than surfacing them. See the handoff note
// stripe-connect-payouts-build-handoff.md.
//
// Auth model: Stripe cannot present a Supabase JWT, so this function runs with
// verify_jwt = false (see config.toml) and authenticates the request by
// verifying the Stripe signature against STRIPE_WEBHOOK_SECRET instead. An
// unsigned or wrongly-signed request is rejected before any work happens.

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia',
});

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

// Service role: this function does privileged, server-only writes to columns
// the client roles cannot touch (provider capability flags, the payout
// ledger). It never runs in a user's session.
const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

serve(async (req) => {
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
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    // A bad signature is the security boundary of this endpoint — reject it,
    // real reason to logs only.
    console.error(`[stripe-webhook] signature verification failed: ${String(err)}`);
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    switch (event.type) {
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
async function handleAccountUpdated(account: Stripe.Account): Promise<void> {
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
async function handleTransfer(transfer: Stripe.Transfer): Promise<void> {
  const { data: rows, error } = await admin
    .from('provider_payouts')
    .update({ status: 'transferred', failure_reason: null })
    .eq('stripe_transfer_id', transfer.id)
    .in('status', ['held', 'transferred', 'failed'])
    .select('id');
  if (error) throw error;
  if (!rows || rows.length === 0) {
    // The release job stamps stripe_transfer_id before/at creation, so a
    // transfer with no matching row means an out-of-band transfer or an event
    // that beat our own write. Log rather than guess.
    console.log(`[stripe-webhook] transfer ${transfer.id} matched no payout row (yet)`);
    return;
  }
  console.log(`[stripe-webhook] payout row(s) ${rows.map((r) => r.id).join(',')} marked transferred (transfer=${transfer.id})`);
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
