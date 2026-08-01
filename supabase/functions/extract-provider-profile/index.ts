// supabase/functions/extract-provider-profile/index.ts
// Server-side replacement for the client-side extraction that used to live in
// acuityTransferService.ts. Fetches a provider's public page (booking page,
// directory listing, etc.) and uses Claude to pull out structured business
// info. Keeping this server-side means ANTHROPIC_API_KEY never ships inside
// the app bundle. The actual fetch/parse/prompt logic lives in
// _shared/extractProviderProfile.ts, reused by the batch scrape pipeline
// (run-scrape-job) so both stay in sync.
//
// Only the app's signed-in-provider Acuity-import flow calls this over HTTP
// (acuityTransferService.ts) — the batch scrape pipeline calls
// extractProviderProfile() directly in-process, not through this endpoint.
// Requiring a valid session here (rather than just the anon key) keeps an
// unauthenticated caller from running arbitrary URLs through the paid
// Claude API on CERVICED's dime, or using this as an open fetch proxy.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractProviderProfile } from '../_shared/extractProviderProfile.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Must be signed in to use this.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: 'Missing required field: url' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const extracted = await extractProviderProfile(url);

    return new Response(JSON.stringify({ extracted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
