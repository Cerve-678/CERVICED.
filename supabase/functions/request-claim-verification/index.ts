// supabase/functions/request-claim-verification/index.ts
// Sends a one-time 6-digit code to the contact email on file for an
// unclaimed (scraped) provider listing, so someone claiming it in-app can
// prove they're the actual business before claim_provider_profile() lets
// them attach their account. Triggered only by a specific person actively
// tapping "This is my business" on one listing they picked — this is
// transactional verification, not the (separate, on-hold) proactive
// outreach/invite system, so it does not touch provider_outreach_suppressions.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { claimVerificationEmail } from '../_shared/emailTemplates.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = 'CERVICED <noreply@cerviced.co>';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!name || !domain) return '***';
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${'*'.repeat(Math.max(1, name.length - visible.length))}@${domain}`;
}

function generateCode(): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0];
  return String(100000 + value % 900000);
}

async function hashCode(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(code);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { providerId } = await req.json();
    if (typeof providerId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(providerId)) {
      return new Response(JSON.stringify({ error: 'Missing required field: providerId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: provider, error: fetchError } = await supabase
      .from('providers')
      .select('id, email, display_name, is_claimed, source')
      .eq('id', providerId)
      .maybeSingle();

    if (fetchError || !provider) {
      return new Response(JSON.stringify({ error: 'Listing not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (provider.is_claimed || provider.source !== 'scraped') {
      return new Response(JSON.stringify({ error: 'This listing has already been claimed.' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!provider.email) {
      return new Response(
        JSON.stringify({ error: 'No contact email on file for this listing — claiming it needs manual review.' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // The RPC atomically stores a hash in an RLS-protected table and limits
    // sends to one per listing per minute. No code appears on a public row.
    const code = generateCode();
    const { data: issued, error: issueError } = await supabase.rpc('issue_provider_claim_code', {
      p_provider_id: providerId,
      p_code_hash: await hashCode(code),
    });
    if (issueError) {
      throw new Error(`Could not generate a verification code: ${issueError.message}`);
    }
    if (!issued) {
      return new Response(JSON.stringify({ error: 'Please wait a moment before requesting another code.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: provider.email,
        ...claimVerificationEmail({
          code,
          // A scraped listing's name is third-party text; the template escapes
          // it where it lands in HTML.
          ...(provider.display_name ? { businessName: provider.display_name } : {}),
        }),
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      throw new Error(`Could not send verification email: ${errText}`);
    }

    return new Response(JSON.stringify({ sent: true, maskedEmail: maskEmail(provider.email) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
