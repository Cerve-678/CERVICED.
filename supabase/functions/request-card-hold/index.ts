import { createClient } from 'npm:@supabase/supabase-js@2.100.0';
import Stripe from 'npm:stripe@17.4.0';
import { checkRequestHold } from '../_shared/requestCardHolds.ts';

// The client's side of a request hold their bank wants to check. Right after
// checkout the success screen lists any such hold; the app asks for it here
// ('start'), shows the bank's check with the Stripe SDK, then asks again
// ('check') so the request goes to the provider straight away. The client has
// 30 minutes (request_hold_placed); after that the request lapses and the
// slot is freed.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** What the app is told: held, still waiting on the bank, or not sent. */
function clientState(state: string): 'authorised' | 'needs_action' | 'dropped' {
  if (state === 'needs_action') return 'needs_action';
  if (state === 'dropped') return 'dropped';
  return 'authorised';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization' }, 401);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: 'Invalid session' }, 401);

    const body = await req.json().catch(() => ({})) as { holdId?: unknown; step?: unknown };
    if (typeof body.holdId !== 'string' || !UUID.test(body.holdId) || (body.step !== 'start' && body.step !== 'check')) {
      return json({ error: 'Invalid request' }, 400);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: hold, error: holdError } = await admin.from('request_card_holds')
      .select('id, state, payment_intent_id, action_deadline')
      .eq('id', body.holdId).eq('user_id', user.id).maybeSingle();
    if (holdError) throw holdError;
    if (!hold) return json({ error: 'Not found' }, 404);

    if (body.step === 'start') {
      const open = hold.state === 'needs_action' && hold.payment_intent_id
        && hold.action_deadline && Date.parse(hold.action_deadline) > Date.now();
      if (!open) {
        // Past its deadline or already answered: record where it got to.
        return json({ state: clientState(await checkRequestHold(admin, stripe, hold.id)) });
      }
      const intent = await stripe.paymentIntents.retrieve(hold.payment_intent_id!);
      if (intent.status !== 'requires_action') {
        return json({ state: clientState(await checkRequestHold(admin, stripe, hold.id)) });
      }
      return json({ state: 'needs_action', clientSecret: intent.client_secret });
    }

    return json({ state: clientState(await checkRequestHold(admin, stripe, hold.id)) });
  } catch (err) {
    console.error(`[request-card-hold] ${String(err)}`);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
