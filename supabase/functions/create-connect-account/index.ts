import { readProviderFinance } from '../_shared/providerFinance.ts';
import { createConnectedAccount } from '../_shared/createConnectedAccount.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.100.0';
import Stripe from 'npm:stripe@17.4.0';

// Express onboarding for CERVICED providers. Chosen model: "buyers purchase
// from you" + split payouts (Uber-Eats pattern) — the platform is merchant of
// record and pays providers out by Transfer. This function creates (or reuses)
// the provider's Express connected account and returns a hosted Account Link
// the app opens so Stripe collects KYC/bank details. It never trusts a
// client-sent account id; it resolves the account from the caller's own
// provider row and writes it with the service role.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

interface RequestBody {
  // Deep links the app registers so Stripe can bounce the provider back into
  // it. `refreshUrl` is hit if the link expired before completion; `returnUrl`
  // when they finish (or bail) — the app then re-reads the account status.
  action?: 'onboard' | 'status' | 'dashboard' | 'finance';
  cursor?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: RequestBody = await req.json();

    // Resolve the caller's OWN provider row (providers.user_id = auth.uid()).
    // The RLS SELECT policy already scopes this to the caller, but we filter
    // explicitly too so the account can only ever be attached to their row.
    const { data: provider, error: providerError } = await supabase
      .from('providers')
      .select('id, stripe_account_id, display_name')
      .eq('user_id', user.id)
      .single();
    if (providerError || !provider) {
      return new Response(JSON.stringify({ error: 'No provider profile for this account' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let accountId = provider.stripe_account_id as string | null;
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    if (body.action === 'status') {
      if (!accountId) return json({ connected: false, payoutsEnabled: false, detailsSubmitted: false });
      const account = await stripe.accounts.retrieve(accountId);
      const { error } = await admin.from('providers').update({
        stripe_charges_enabled: account.charges_enabled,
        stripe_payouts_enabled: account.payouts_enabled,
        stripe_details_submitted: account.details_submitted,
      }).eq('id', provider.id);
      if (error) throw error;
      return json({ connected: true, payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        requirementsDue: account.requirements?.currently_due?.length ?? 0 });
    }
    if (body.action === 'finance') {
      if (body.cursor !== undefined && (typeof body.cursor !== 'string' || !/^po_[A-Za-z0-9]+$/.test(body.cursor))) {
        return json({ error: 'Invalid payout cursor' }, 400);
      }
      return json(await readProviderFinance(stripe, accountId, body.cursor));
    }
    if (body.action === 'dashboard') {
      if (!accountId) throw new Error('No connected account');
      const link = await stripe.accounts.createLoginLink(accountId);
      return json({ url: link.url });
    }
    if (body.action && body.action !== 'onboard') return json({ error: 'Invalid action' }, 400);

    // Create the Express account once; reuse it on every subsequent call so a
    // provider who re-opens onboarding continues the same account rather than
    // orphaning a new one each time.
    if (!accountId) {
      if (!user.email?.trim()) return json({ code: 'stripe_contact_email_required', error: 'Add an email address to your account before setting up Stripe.' }, 422);
      const account = await createConnectedAccount(Deno.env.get('STRIPE_SECRET_KEY')!, provider.id, user.id, user.email);
      accountId = account.id;

      // Persist with the service role — clients cannot write these columns
      // (REVOKE UPDATE in the schema migration). Guard against a concurrent
      // create by only writing when the row still has no account id.
      const { error: writeError } = await admin.from('providers')
        .update({ stripe_account_id: accountId }).eq('id', provider.id).is('stripe_account_id', null);
      if (writeError) throw writeError;
      const { data: fresh, error: readError } = await admin.from('providers')
        .select('stripe_account_id').eq('id', provider.id).single();
      if (readError || !fresh?.stripe_account_id) throw readError ?? new Error('Account could not be linked');
      accountId = fresh.stripe_account_id;

    }

    // A fresh Account Link every call — they are single-use and short-lived.
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/stripe-connect-return?result=refresh`,
      return_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/stripe-connect-return?result=return`,
      type: 'account_onboarding',
    });

    return new Response(
      JSON.stringify({ url: accountLink.url, accountId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error(`[create-connect-account] fatal: ${String(err)}`);
    // Friendly to the client, real reason in the logs (error-message-sweep).
    return new Response(
      JSON.stringify({ code: 'stripe_setup_unavailable', error: 'Stripe account setup is unavailable. Please try again or contact support.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});


function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
