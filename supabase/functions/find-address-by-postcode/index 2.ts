import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// getAddress.io's plain api-key is a server-side secret by their own docs
// (their client-safe alternative, Domain Tokens, is scoped by HTTP Referer —
// meaningless for a native app's direct fetch, so it doesn't fit here
// either). This function is the only place that key is ever used; the app
// calls this function with just a postcode, never the key.
const GETADDRESS_API_KEY = Deno.env.get('GETADDRESS_API_KEY');

interface RequestBody {
  postcode?: string;
  addressId?: string;
}

interface GetAddressSuggestion {
  id: string;
  address: string;
}

interface GetAddressDetail {
  formatted_address: string[];
  latitude: number;
  longitude: number;
  postcode: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Require a real signed-in user, consistent with every other write/
    // lookup path in the app (see create-payment-intent for the same shape).
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!GETADDRESS_API_KEY) {
      return new Response(JSON.stringify({ error: 'Address lookup is not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: RequestBody = await req.json();

    // The legacy /find endpoint has been retired by getAddress.io. Their
    // supported flow is autocomplete (one lookup for a full postcode) then
    // resolve only the address the provider selects.
    if (body.addressId?.trim()) {
      const addressId = body.addressId.trim();
      const response = await fetch(
        `https://api.getaddress.io/get/${encodeURIComponent(addressId)}?api-key=${GETADDRESS_API_KEY}`,
      );
      if (!response.ok) {
        return new Response(JSON.stringify({ error: 'Address details not found' }), {
          status: response.status === 404 ? 404 : 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const address: GetAddressDetail = await response.json();
      const formatted = [...(address.formatted_address ?? []).filter(Boolean), address.postcode]
        .filter((part, index, parts) => parts.indexOf(part) === index)
        .join(', ');
      return new Response(JSON.stringify({
        address: { formatted, latitude: address.latitude, longitude: address.longitude },
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const postcode = body.postcode?.trim();
    if (!postcode) {
      return new Response(JSON.stringify({ error: 'Missing postcode or address ID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch(
      `https://api.getaddress.io/autocomplete/${encodeURIComponent(postcode)}?api-key=${GETADDRESS_API_KEY}&all=true&show-postcode=true`,
    );
    if (!response.ok) {
      // Bad postcode (404) is a normal, expected outcome, not a server error.
      return new Response(JSON.stringify({ addresses: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const data: { suggestions?: GetAddressSuggestion[] } = await response.json();
    const addresses = (data.suggestions ?? [])
      .filter(entry => entry.id && entry.address)
      .map(entry => ({ address: entry.address, id: entry.id }));

    return new Response(JSON.stringify({ addresses }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Address lookup failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
