// supabase/functions/send-email/index.ts
// Sends one of the app's transactional emails (welcome, booking confirmation)
// on behalf of the signed-in user.
//
// THIS USED TO BE AN OPEN RELAY. It was deployed with verify_jwt = false and
// took a caller-supplied `to`, `subject` and `html`, so anyone holding the
// app's public anon key — which ships inside the binary and is not a secret —
// could send arbitrary HTML from the project's verified sending domain, to
// any address, with CERVICED branding on it. That is a phishing kit, and the
// cost of it being used once is the whole cerviced.co sending reputation,
// which support@cerviced.co shares.
//
// Two things close it:
//   1. verify_jwt = true (config.toml) — a caller must be signed in.
//   2. The recipient must be an address that already belongs to THAT caller,
//      derived here from their own rows, never from the request. A signed-in
//      user can mail themselves; they cannot mail anyone else.
//
// (2) is what actually removes the phishing value: branded HTML delivered to
// your own inbox is not an attack. The `to` field is kept in the payload
// rather than dropped because the three legitimate callers each pick a
// different one of the caller's own addresses (account vs. business), and a
// mismatch should be a loud 403 rather than mail silently going somewhere
// unexpected.
//
// STILL CLIENT-SUPPLIED, deliberately, and the next thing to fix: the `html`
// body. The templates live in src/services/emailService.ts and are rendered
// on the device. Moving them into _shared/ and having the server pick both
// template and recipient from the event (booking confirmed, account created)
// is the industry-standard shape — ideally with the booking confirmation
// owned by a DB trigger, as this app's notifications already are. Until then
// the blast radius is bounded to the sender's own inbox.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = 'CERVICED <noreply@cerviced.co>';

// A transactional email is a page of HTML, not a document. Anything larger is
// not one of our templates.
const MAX_HTML_BYTES = 256 * 1024;
const MAX_SUBJECT = 200;

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

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
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'Not signed in.' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    const user = userData?.user;
    if (userError || !user) return json({ error: 'Not signed in.' }, 401);

    const { to, subject, html }: EmailPayload = await req.json();

    if (!to || !subject || !html) {
      return json({ error: 'Missing required fields: to, subject, html' }, 400);
    }
    if (subject.length > MAX_SUBJECT) return json({ error: 'Subject too long.' }, 400);
    if (new TextEncoder().encode(html).length > MAX_HTML_BYTES) {
      return json({ error: 'Message body too large.' }, 400);
    }

    // Every address this caller is allowed to mail, read from their own rows.
    // users.business_email covers the provider welcome email, which goes to
    // the business address rather than the login address (and is written by
    // the profile upsert that runs immediately before that send). Both
    // lookups run concurrently.
    const [{ data: account }, { data: provider }] = await Promise.all([
      supabase
        .from('users')
        .select('email, business_email')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('providers')
        .select('email')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    const allowed = new Set(
      [user.email, account?.email, account?.business_email, provider?.email]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .map((value) => value.trim().toLowerCase()),
    );

    if (!allowed.has(to.trim().toLowerCase())) {
      // Logged, because in normal operation this never fires: it means either
      // an abuse attempt or a caller that has drifted from the addresses on
      // the account.
      console.error(`[send-email] refused: user ${user.id} tried to mail a non-own address`);
      return json({ error: 'You can only send to an address on your own account.' }, 403);
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });

    const data = await res.json();

    if (!res.ok) {
      // Logged server-side as well as returned: a silent send failure is how
      // an unverified sending domain went unnoticed for months.
      console.error(`[send-email] Resend rejected the send: ${data?.message ?? res.status}`);
      return json({ error: data?.message ?? 'Resend API error' }, 502);
    }

    return json({ success: true, id: data.id });
  } catch (error) {
    console.error(`[send-email] unhandled: ${error instanceof Error ? error.message : String(error)}`);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
