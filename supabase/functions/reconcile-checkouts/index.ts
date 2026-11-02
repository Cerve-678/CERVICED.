import { createClient } from 'npm:@supabase/supabase-js@2.100.0';
import Stripe from 'npm:stripe@17.4.0';
import { isServiceRoleRequest } from '../_shared/serviceAuth.ts';
import { settleCheckout } from '../_shared/settleCheckout.ts';

// Finishes checkouts that a payment was started for but nobody finished.
//
// Normally the app settles a checkout straight after the card is approved,
// and the signed Stripe webhook is the backup. When both miss (the app closed,
// the database timed out, the webhook isn't subscribed to payment events) the
// checkout used to sit as 'prepared' for good: the client was never told
// whether they'd been charged, and an approved card stayed on hold for days.
//
// Called by process_stale_checkouts() via pg_cron (reconcile-checkouts, every
// 5 minutes), only when such a checkout exists. For each one it asks Stripe
// where the payment got to:
//   - never paid, hold still running   → leave it, the client may be paying;
//   - never paid, hold over            → cancel the payment, mark abandoned
//                                        (nothing was taken, nothing is said);
//   - still processing at the bank     → leave it for the next run;
//   - approved, captured or cancelled  → settleCheckout, which books it, or
//                                        cancels or refunds it and tells the
//                                        client (record_checkout_outcome).
// Every step is safe to repeat: Stripe calls carry the same idempotency keys
// settleCheckout always uses, and an outcome is recorded once.

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// The cron runs every 5 minutes; a backlog drains over later runs.
const BATCH_LIMIT = 25;
// Give the app and the webhook their chance first.
const MIN_AGE_MS = 3 * 60 * 1000;
const UNPAID = new Set(['requires_payment_method', 'requires_confirmation', 'requires_action']);

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (!(await isServiceRoleRequest(req.headers.get('Authorization')))) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { data: stale, error } = await admin.from('checkout_batches')
      .select('id, payment_intent_id, expires_at')
      .eq('status', 'prepared')
      .not('payment_intent_id', 'is', null)
      .lte('created_at', new Date(Date.now() - MIN_AGE_MS).toISOString())
      .order('created_at', { ascending: true })
      .limit(BATCH_LIMIT);
    if (error) throw error;

    const counts: Record<string, number> = {};
    const tally = (key: string) => { counts[key] = (counts[key] ?? 0) + 1; };

    for (const batch of stale ?? []) {
      try {
        const intent = await stripe.paymentIntents.retrieve(batch.payment_intent_id!);
        const holdOver = Date.parse(batch.expires_at) <= Date.now();
        if (UNPAID.has(intent.status)) {
          if (!holdOver) { tally('still_paying'); continue; }
          await stripe.paymentIntents.cancel(intent.id, {}, { idempotencyKey: `checkout_cancel_${batch.id}` });
          const { error: recordError } = await admin.rpc('record_checkout_outcome', {
            p_checkout_batch_id: batch.id, p_outcome: 'abandoned',
          });
          if (recordError) throw recordError;
          tally('abandoned');
          continue;
        }
        if (intent.status === 'processing') { tally('processing'); continue; }
        tally(await settleCheckout(admin, stripe, intent.id));
      } catch (err) {
        // One bad checkout must not stop the rest; it is retried next run.
        console.error(`[reconcile-checkouts] ${batch.id} failed: ${String(err)}`);
        tally('error');
      }
    }

    console.log(`[reconcile-checkouts] ${JSON.stringify(counts)}`);
    return new Response(JSON.stringify({ checked: stale?.length ?? 0, ...counts }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(`[reconcile-checkouts] fatal: ${String(err)}`);
    return new Response(JSON.stringify({ error: 'Could not reconcile checkouts.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
