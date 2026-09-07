// supabase/functions/send-account-email/index.ts
// Sends a transactional account email — a welcome for a hat the signed-in
// user just took on, or a password-changed security notice — to that same
// user's own address.
//
// Replaces the client-side path where the app built the HTML itself and posted
// it to the old general-purpose send-email endpoint. The caller now names only
// WHICH email it is; the template, the recipient and the name on it are all
// resolved here, so the phone can neither choose who receives our branded mail
// nor what it says.
//
// `kind` is the one thing the caller supplies, and it deliberately is not
// derived from the account's role: a provider adding a client hat gets the
// CLIENT welcome, and role would give the wrong answer. It only selects
// between our own templates going to the user's own address, so it carries
// no authority.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { clientWelcomeEmail, providerWelcomeEmail, passwordChangedEmail } from '../_shared/emailTemplates.ts';
import { escapeHtml } from '../_shared/escapeHtml.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = 'CERVICED <noreply@cerviced.co>';

const KINDS = ['client_welcome', 'provider_welcome', 'password_changed'] as const;
type Kind = typeof KINDS[number];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'Not signed in.' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    const user = userData?.user;
    if (userError || !user) return json({ error: 'Not signed in.' }, 401);

    const { kind } = await req.json();
    if (!KINDS.includes(kind as Kind)) return json({ error: 'Unknown email kind.' }, 400);

    const [{ data: account }, { data: provider }] = await Promise.all([
      supabase
        .from('users')
        .select('name, email, business_name, business_email')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('providers')
        .select('display_name, email')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    const name = account?.name ?? '';
    const businessName = provider?.display_name ?? account?.business_name ?? undefined;

    // The provider welcome goes to the business address when there is one —
    // that is the address a business actually reads — falling back to the
    // login address. The client welcome always goes to the login address.
    const to = kind === 'provider_welcome'
      ? (provider?.email || account?.business_email || account?.email || user.email)
      : (account?.email || user.email);

    if (!to) return json({ error: 'No address on file for this account.' }, 422);

    const { subject, html } = kind === 'provider_welcome'
      ? providerWelcomeEmail({
          name: escapeHtml(name),
          ...(businessName ? { businessName: escapeHtml(businessName) } : {}),
        })
      : kind === 'password_changed'
      ? passwordChangedEmail({ name: escapeHtml(name) })
      : clientWelcomeEmail({ name: escapeHtml(name) });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[account-email] ${kind} for ${user.id} failed: ${errText}`);
      return json({ error: 'Send failed.' }, 502);
    }

    return json({ sent: true });
  } catch (error) {
    console.error(`[account-email] unhandled: ${error instanceof Error ? error.message : String(error)}`);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
