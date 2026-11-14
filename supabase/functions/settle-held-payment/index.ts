import { createClient } from 'npm:@supabase/supabase-js@2.100.0';
import Stripe from 'npm:stripe@17.4.0';
import { isServiceRoleRequest } from '../_shared/serviceAuth.ts';
import { settleRequestHold, sweepRequestHolds } from '../_shared/requestCardHolds.ts';

// Takes or releases a request's card hold once it's answered. Called by the
// database only: on_held_request_answered posts one hold, and the
// settle-request-card-holds cron job posts {"sweep": true} to place, check
// and settle anything a call missed. See _shared/requestCardHolds.ts.

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!(await isServiceRoleRequest(req.headers.get('Authorization')))) return json({ error: 'Forbidden' }, 403);

  let body: { holdId?: unknown; sweep?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  if (typeof body.holdId === 'string' && UUID.test(body.holdId)) {
    try {
      return json({ status: await settleRequestHold(admin, stripe, body.holdId) });
    } catch (err) {
      console.error(`[settle-held-payment] ${body.holdId}: ${String(err)}`);
      return json({ error: 'Not settled; the sweep will retry' }, 500);
    }
  }

  if (body.sweep === true) {
    try {
      return json({ swept: await sweepRequestHolds(admin, stripe) });
    } catch (err) {
      console.error(`[settle-held-payment] sweep failed: ${String(err)}`);
      return json({ error: 'Sweep failed' }, 500);
    }
  }

  return json({ error: 'Invalid request' }, 400);
});
