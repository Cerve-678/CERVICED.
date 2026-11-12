import { createClient } from 'npm:@supabase/supabase-js@2.100.0';
import Stripe from 'npm:stripe@17.4.0';
import { isServiceRoleRequest } from '../_shared/serviceAuth.ts';
import { settleHeldPayment } from '../_shared/settleHeldPayment.ts';

// Takes or releases the card hold on a checkout of requests once they're
// answered. Called by the database only: on_held_request_answered posts one
// payment, and the settle-held-payments cron job posts {"sweep": true} to pick
// up anything that call missed. See _shared/settleHeldPayment.ts.

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// Held checkouts still waiting on an answer are read too and come back
// "wait"; at today's volume 200 covers every open one.
const SWEEP_LIMIT = 200;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!(await isServiceRoleRequest(req.headers.get('Authorization')))) return json({ error: 'Forbidden' }, 403);

  let body: { paymentIntentId?: unknown; sweep?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  if (typeof body.paymentIntentId === 'string' && body.paymentIntentId.startsWith('pi_')) {
    try {
      return json({ status: await settleHeldPayment(admin, stripe, body.paymentIntentId) });
    } catch (err) {
      console.error(`[settle-held-payment] ${body.paymentIntentId}: ${String(err)}`);
      return json({ error: 'Not settled; the sweep will retry' }, 500);
    }
  }

  if (body.sweep === true) {
    const { data, error } = await admin.from('checkout_batches')
      .select('payment_intent_id')
      .in('capture_state', ['held', 'settling'])
      .not('payment_intent_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(SWEEP_LIMIT);
    if (error) {
      console.error(`[settle-held-payment] sweep read failed: ${String(error.message ?? error)}`);
      return json({ error: 'Sweep failed' }, 500);
    }
    const tally: Record<string, number> = {};
    for (const row of data ?? []) {
      let outcome: string;
      try {
        outcome = await settleHeldPayment(admin, stripe, row.payment_intent_id as string);
      } catch (err) {
        console.error(`[settle-held-payment] ${row.payment_intent_id}: ${String(err)}`);
        outcome = 'failed';
      }
      tally[outcome] = (tally[outcome] ?? 0) + 1;
    }
    return json({ swept: tally });
  }

  return json({ error: 'Invalid request' }, 400);
});
