// supabase/functions/send-support-request/index.ts
// Delivers the in-app "Report a Problem" form (ReportProblemScreen) to the
// support inbox.
//
// Deliberately NOT built on the general-purpose send-email function: that one
// takes a caller-supplied `to` and `html`, so routing support reports through
// it would mean the client could aim a cerviced.co send at any address. Here
// the recipient is hardcoded, the client supplies only plain text, and the
// reporter's identity comes from their verified JWT rather than from the
// request body — so a report can never claim to be from someone else.
//
// The ROW IS THE RECORD; the email is a notification of it. The insert into
// support_requests happens first and the send second, so a delivery failure
// costs a notification, never the report itself — and the send outcome is
// written back to notified_at / notify_error so an undelivered report is
// visible as exactly that.
//
// Requires a signed-in user (verify_jwt = true in config.toml).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = 'CERVICED <noreply@cerviced.co>';
const SUPPORT_EMAIL = 'support@cerviced.co';

// Mirrors CATEGORIES in src/screens/shared/ReportProblemScreen.tsx. Anything
// else is rejected rather than passed through into the email subject line.
const CATEGORIES = [
  'Bug / Crash',
  'Booking Issue',
  'Provider Issue',
  'Payment',
  'Account',
  'Other',
];

const MAX_DESCRIPTION = 4000;
const MAX_CONTEXT = 120;

// Now that reports are rows, there is something to count. A person with a
// genuine problem does not file seven reports in an hour; a script does.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 6;

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

/** Everything below is user-typed or client-supplied and lands in an HTML email. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Client-supplied context (platform, app version) — informational only, never trusted. */
function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
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

    const body = await req.json();
    const category = clip(body?.category, 60);
    const description = clip(body?.description, MAX_DESCRIPTION);
    const platform = clip(body?.platform, MAX_CONTEXT);
    const appVersion = clip(body?.appVersion, MAX_CONTEXT);
    const activeMode = clip(body?.activeMode, MAX_CONTEXT);

    if (!CATEGORIES.includes(category)) return json({ error: 'Unknown category.' }, 400);
    if (!description) return json({ error: 'Description is required.' }, 400);

    // Identity comes from the JWT, not the request body.
    const reporterEmail = user.email ?? '(no email on account)';

    // Which hats the account actually holds, and the business name if it has a
    // provider hat, both read server-side. The app also reports which hat the
    // reporter was wearing, but that is the one thing it can get wrong or omit
    // — so it is shown as a secondary line and the authoritative lookup below
    // is what support should trust. Both lookups run concurrently.
    const [{ data: account }, { data: provider }] = await Promise.all([
      supabase
        .from('users')
        .select('role, has_client_profile')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('providers')
        .select('id, display_name')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    const hasProviderHat = account?.role === 'provider' || !!provider;
    const hasClientHat = account?.has_client_profile === true;
    const holds = hasProviderHat && hasClientHat
      ? 'both hats (provider + client)'
      : hasProviderHat
        ? 'provider only'
        : hasClientHat
          ? 'client only'
          : '(no hat on record)';

    const wearing = activeMode === 'provider'
      ? 'provider hat'
      : activeMode === 'client'
        ? 'client hat'
        : '(app did not report)';

    const rows: Array<[string, string]> = [
      ['Category', category],
      ['From', reporterEmail],
      ['Sent while wearing', wearing],
      ['Account holds', holds],
    ];
    if (provider?.display_name) rows.push(['Business', provider.display_name]);
    if (provider?.id) rows.push(['Provider ID', provider.id]);
    rows.push(
      ['User ID', user.id],
      ['Platform', platform || '(not reported)'],
      ['App version', appVersion || '(not reported)'],
      ['Received', new Date().toISOString()],
    );

    // Makes the inbox scannable: a provider's report is named by their
    // business, so you know who you're dealing with before opening it.
    const who = activeMode === 'provider' && provider?.display_name
      ? `${provider.display_name} (provider)`
      : activeMode === 'provider'
        ? 'Provider'
        : 'Client';

    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count: recentCount } = await supabase
      .from('support_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', since);

    if ((recentCount ?? 0) >= RATE_LIMIT_MAX) {
      return json(
        { error: "You've sent a lot of reports in the last hour. Please wait a little before sending another." },
        429,
      );
    }

    // The report is saved before anything is sent. If the insert fails there is
    // nothing to notify anyone about, so this one does abort.
    const { data: ticket, error: insertError } = await supabase
      .from('support_requests')
      .insert({
        user_id: user.id,
        category,
        description,
        reporter_email: user.email ?? null,
        reported_as: activeMode === 'provider' || activeMode === 'client' ? activeMode : null,
        account_holds: holds,
        provider_id: provider?.id ?? null,
        business_name: provider?.display_name ?? null,
        platform: platform || null,
        app_version: appVersion || null,
      })
      .select('id, ticket_number')
      .single();

    if (insertError || !ticket) {
      throw new Error(`Could not save the support request: ${insertError?.message ?? 'no row returned'}`);
    }

    const ref = `#${ticket.ticket_number}`;
    rows.unshift(['Ticket', ref]);

    const html = `<div style="font-family:sans-serif;max-width:640px;color:#1a1a1a">
      <h2 style="color:#a342c3;margin:0 0 16px">${escapeHtml(category)}</h2>
      <table cellpadding="4" cellspacing="0" style="font-size:13px;color:#444;margin-bottom:20px">
        ${rows
          .map(
            ([label, value]) =>
              `<tr><td style="color:#888">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`,
          )
          .join('')}
      </table>
      <div style="white-space:pre-wrap;border-left:3px solid #a342c3;padding-left:14px;font-size:15px;line-height:1.5">${escapeHtml(description)}</div>
    </div>`;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: SUPPORT_EMAIL,
        // reply_to is the verified account email, so support can answer the
        // reporter directly without trusting anything in the request body.
        reply_to: user.email ? [user.email] : undefined,
        subject: `${ref} [${category}] ${who} — ${reporterEmail}`,
        html,
      }),
    });

    // From here the report is already safely stored, so a failed send is
    // recorded and reported as a delivery problem — it must not read to the
    // caller as "your report was lost", because it wasn't.
    if (!emailRes.ok) {
      const errText = await emailRes.text();
      await supabase
        .from('support_requests')
        .update({ notify_error: errText.slice(0, 2000) })
        .eq('id', ticket.id);
      console.error(`[support] ${ref} saved but not emailed: ${errText}`);
      return json({ saved: true, notified: false, ticketNumber: ticket.ticket_number });
    }

    await supabase
      .from('support_requests')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', ticket.id);

    return json({ saved: true, notified: true, ticketNumber: ticket.ticket_number });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
