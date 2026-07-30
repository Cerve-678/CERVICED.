// supabase/functions/extract-provider-profile/index.ts
// Server-side replacement for the client-side extraction that used to live in
// acuityTransferService.ts. Fetches a provider's public page (booking page,
// directory listing, etc.) and uses Claude to pull out structured business
// info. Keeping this server-side means ANTHROPIC_API_KEY never ships inside
// the app bundle. The actual fetch/parse/prompt logic lives in
// _shared/extractProviderProfile.ts, reused by the batch scrape pipeline
// (run-scrape-job) so both stay in sync.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
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
