import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@17.4.0?target=deno';

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
});

interface RequestBody {
  // Deep links the app registers so Stripe can bounce the provider back into
  // it. `refreshUrl` is hit if the link expired before completion; `returnUrl`
  // when they finish (or bail) — the app then re-reads the account status.
  refreshUrl: string;
  returnUrl: string;
}

serve(async (req) => {
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
    if (!body.refreshUrl || !body.returnUrl) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    // Create the Express account once; reuse it on every subsequent call so a
    // provider who re-opens onboarding continues the same account rather than
    // orphaning a new one each time.
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'GB',
        // Platform collects card payments; provider only receives transfers.
        capabilities: { transfers: { requested: true } },
        business_type: 'individual',
        metadata: { provider_id: provider.id, user_id: user.id },
      });
      accountId = account.id;

      // Persist with the service role — clients cannot write these columns
      // (REVOKE UPDATE in the schema migration). Guard against a concurrent
      // create by only writing when the row still has no account id.
      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const { error: writeError } = await admin
        .from('providers')
        .update({ stripe_account_id: accountId })
        .eq('id', provider.id)
        .is('stripe_account_id', null);
      if (writeError) {
        // Another request already attached an account — clean up the one we
        // just created so we don't leak an orphaned Stripe account, then reuse
        // the row's existing id.
        await stripe.accounts.del(accountId).catch(() => {});
        const { data: fresh } = await admin
          .from('providers')
          .select('stripe_account_id')
          .eq('id', provider.id)
          .single();
        accountId = fresh?.stripe_account_id ?? null;
        if (!accountId) throw writeError;
      }
    }

    // A fresh Account Link every call — they are single-use and short-lived.
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: body.refreshUrl,
      return_url: body.returnUrl,
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
      JSON.stringify({ error: 'Could not start payout setup. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
