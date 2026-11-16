import { createClient } from 'npm:@supabase/supabase-js@2.100.0';
import Stripe from 'npm:stripe@17.4.0';
import { takeBackForDispute } from '../_shared/bankDispute.ts';

// An admin's answer to "which booking(s) is this bank dispute about?", for a
// dispute whose amount matched no booking on the payment (_shared/disputePlan.ts).
// Until this runs, nothing is taken back and every unpaid payout on that
// payment waits. This takes the money back from the chosen bookings'
// providers only (unless CERVICED already won it), then records the answer,
// which lets every other provider's payout carry on.
//
// Record first, take back second: the answer is saved under the dispute's
// lock before any money moves, so two admins, or an admin and the bank's
// outcome, can't both act on it. If the take-back then fails, the dispute
// stays on the admin screen as unfinished; pressing again repeats the same
// answer (a no-op) and the take-back, which is keyed per payout so it never
// takes twice.
//
// AUTH: a CERVICED admin's session (admin_users). The admin is saved with the
// answer in admin_actions (assign_bank_dispute()).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

interface RequestBody {
  disputeId?: unknown;
  bookingIds?: unknown;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ error: 'Missing authorization' }, 401);
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'Invalid session' }, 401);
    const { data: adminRow, error: adminErr } = await admin
      .from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
    if (adminErr) throw adminErr;
    if (!adminRow) return json({ error: 'Only CERVICED admins can do this.' }, 403);

    const body: RequestBody = await req.json();
    const disputeId = typeof body.disputeId === 'string' && UUID.test(body.disputeId) ? body.disputeId : null;
    const bookingIds = Array.isArray(body.bookingIds)
      ? [...new Set(body.bookingIds.filter((id): id is string => typeof id === 'string' && UUID.test(id)))]
      : [];
    if (!disputeId || bookingIds.length === 0 || bookingIds.length !== (body.bookingIds as unknown[]).length) {
      return json({ error: 'Pick at least one booking.' }, 400);
    }

    // Record the answer first, under the dispute's lock: a second, different
    // answer (another admin) or the dispute already won is refused here,
    // before any money moves. Repeating the same answer is accepted, which is
    // how an unfinished take-back is retried.
    const { error: assignErr } = await admin.rpc('assign_bank_dispute', {
      p_dispute_id: disputeId, p_booking_ids: bookingIds, p_admin_user_id: user.id,
    });
    if (assignErr) {
      // A RAISE in assign_bank_dispute() is written for the admin to read.
      if (assignErr.code === 'P0001') return json({ error: assignErr.message }, 409);
      throw assignErr;
    }

    const { data: dispute, error: disputeErr } = await admin.from('payment_disputes')
      .select('id, stripe_dispute_id, outcome').eq('id', disputeId).single();
    if (disputeErr) throw disputeErr;
    // Won already: the money came back, so there's nothing to take. Otherwise
    // take back (keyed per payout); this pays straight back if the dispute is
    // won while it runs.
    if (dispute.outcome !== 'won') {
      await takeBackForDispute(admin, stripe, { rowId: dispute.id, stripeId: dispute.stripe_dispute_id }, bookingIds);
    }
    return json({ ok: true }, 200);
  } catch (err) {
    console.error(`[assign-bank-dispute] failed: ${String(err)}`);
    return json({ error: "Couldn't finish that. Nothing is taken twice; try again." }, 500);
  }
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
