import { createClient } from 'npm:@supabase/supabase-js@2.100.0';
import Stripe from 'npm:stripe@17.4.0';
import { takeBackForBookings } from '../_shared/bankDispute.ts';

// An admin's answer to "which booking(s) is this bank dispute about?", for a
// dispute whose amount matched no booking on the payment (_shared/disputePlan.ts).
// Until this runs, nothing is taken back and every unpaid payout on that
// payment waits. This takes the money back from the chosen bookings'
// providers only (unless CERVICED already won it), then records the answer,
// which lets every other provider's payout carry on.
//
// Take back first, record second: if the take-back fails, the dispute stays
// on the admin screen to try again, and the take-back is keyed per payout so a
// second try never takes twice. Recording the same answer again is a no-op.
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

    const { data: dispute, error: disputeErr } = await admin.from('payment_disputes')
      .select('id, stripe_dispute_id, attribution, outcome').eq('id', disputeId).maybeSingle();
    if (disputeErr) throw disputeErr;
    if (!dispute) return json({ error: 'That dispute no longer exists.' }, 404);
    if (dispute.attribution !== 'needs_admin' && dispute.attribution !== 'admin') {
      return json({ error: 'This dispute has already been decided.' }, 409);
    }

    // Only bookings this payment paid for, checked before any money moves
    // (assign_bank_dispute() checks again under its lock).
    const { data: links, error: linkErr } = await admin.from('payment_dispute_bookings')
      .select('booking_id, role').eq('dispute_id', disputeId);
    if (linkErr) throw linkErr;
    const onPayment = new Set((links ?? []).map(l => l.booking_id));
    if (!bookingIds.every(id => onPayment.has(id))) {
      return json({ error: "Those bookings weren't paid by the disputed payment." }, 409);
    }
    // Already answered: only the same answer again (a retry after a failure)
    // goes on, so a second answer can never take from another provider.
    if (dispute.attribution === 'admin') {
      const answered = (links ?? []).filter(l => l.role === 'disputed').map(l => l.booking_id).sort();
      if (answered.join() !== [...bookingIds].sort().join()) {
        return json({ error: 'This dispute has already been decided.' }, 409);
      }
    }

    // Won already: the money came back, so there's nothing to take.
    if (dispute.outcome !== 'won') {
      await takeBackForBookings(admin, stripe, dispute.stripe_dispute_id, bookingIds);
    }

    const { error: assignErr } = await admin.rpc('assign_bank_dispute', {
      p_dispute_id: disputeId, p_booking_ids: bookingIds, p_admin_user_id: user.id,
    });
    if (assignErr) {
      // A RAISE in assign_bank_dispute() is written for the admin to read.
      if (assignErr.code === 'P0001') return json({ error: assignErr.message }, 409);
      throw assignErr;
    }
    return json({ ok: true }, 200);
  } catch (err) {
    console.error(`[assign-bank-dispute] failed: ${String(err)}`);
    return json({ error: "Couldn't save that. Nothing was taken twice; try again." }, 500);
  }
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
