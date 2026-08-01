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
  return String(Math.floor(100000 + Math.random() * 900000));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { providerId } = await req.json();
    if (!providerId) {
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
      .select('id, email, is_claimed, claim_token_last_sent_at')
      .eq('id', providerId)
      .maybeSingle();

    if (fetchError || !provider) {
      return new Response(JSON.stringify({ error: 'Listing not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (provider.is_claimed) {
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

    // Cooldown — without this, anyone can trigger a real email send to a
    // scraped business's inbox repeatedly with no limit. One send per
    // listing per 60 seconds, checked before any code is generated/sent.
    if (provider.claim_token_last_sent_at) {
      const elapsedMs = Date.now() - new Date(provider.claim_token_last_sent_at).getTime();
      if (elapsedMs < 60 * 1000) {
        return new Response(
          JSON.stringify({ error: 'Please wait a moment before requesting another code.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // Single-use, 15-minute code stored on the row's existing claim_token
    // column. Retry once on the (very unlikely) UNIQUE collision with
    // another pending code. claim_attempts resets to 0 here so a fresh
    // code always gets its own full set of 5 guesses (see claim_attempts
    // lockout in claim_provider_profile()).
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { error: updateError } = await supabase
      .from('providers')
      .update({
        claim_token: code,
        claim_token_expires_at: expiresAt,
        claim_attempts: 0,
        claim_token_last_sent_at: new Date().toISOString(),
      })
      .eq('id', providerId)
      .eq('is_claimed', false);

    if (updateError) {
      throw new Error(`Could not generate a verification code: ${updateError.message}`);
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
        subject: `Your CERVICED verification code: ${code}`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
          <h2 style="color:#a342c3">Claim your business listing</h2>
          <p>Enter this code in the CERVICED app to confirm this listing is yours:</p>
          <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:24px 0;">${code}</p>
          <p style="color:#666;font-size:13px;">This code expires in 15 minutes. If you didn't request this, you can ignore this email.</p>
        </div>`,
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
