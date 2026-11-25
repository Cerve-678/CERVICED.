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
// A refund request (refundRequestId in the body) is ALSO emailed to the
// booking's provider, since they are the one who can refund it. The request
// row itself is made first by request_booking_refund(), which already
// notified them in the app; this links the ticket to it and sends the email.
// Neither step can fail the report.
//
// Requires a signed-in user (verify_jwt = true in config.toml).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { refundRequestedProviderEmail, supportRequestEmail } from '../_shared/emailTemplates.ts';
import { formatLongDate, formatTime12 } from '../_shared/bookingDates.ts';

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

// A report about one message, review or person (App Store guideline 1.2).
// Its category is fixed here rather than chosen in the form, and what was
// reported is looked up server-side, so the email shows the real content and
// a report can only be made about something the reporter can actually see.
const REPORT_CATEGORY = 'Reported content';
type ReportKind = 'message' | 'review' | 'conversation';
const REPORT_KINDS: ReportKind[] = ['message', 'review', 'conversation'];
const MAX_REPORTED_EXCERPT = 1500;

interface ResolvedReport {
  kind: ReportKind;
  id: string;
  reportedUserId: string | null;
  rows: Array<[string, string]>;
}

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Links this ticket to the caller's refund request and emails the provider.
 * Only a request the caller filed themselves, with no ticket linked yet —
 * so a replayed id can neither re-email a provider nor hijack someone else's
 * request. Never throws: the report is already saved by the time this runs.
 */
async function notifyProviderOfRefundRequest(
  supabase: SupabaseClient,
  userId: string,
  refundRequestId: string,
  ticketId: string,
): Promise<boolean> {
  try {
    const { data: linked, error: linkError } = await supabase
      .from('refund_requests')
      .update({ support_request_id: ticketId })
      .eq('id', refundRequestId)
      .eq('client_id', userId)
      .is('support_request_id', null)
      .in('status', ['with_provider', 'under_review'])
      .select('booking_id, provider_id, reason')
      .maybeSingle();
    if (linkError) throw linkError;
    if (!linked?.provider_id) return false;

    const [
      { data: booking, error: bookingError },
      { data: provider, error: providerError },
      { data: payout, error: payoutError },
    ] = await Promise.all([
      supabase
        .from('bookings')
        .select('customer_name, service_name_snapshot, booking_date, booking_time')
        .eq('id', linked.booking_id)
        .single(),
      supabase
        .from('providers')
        .select('user_id')
        .eq('id', linked.provider_id)
        .single(),
      // release-payouts holds this back while the request is open.
      supabase
        .from('provider_payouts')
        .select('status, payout_amount')
        .eq('booking_id', linked.booking_id)
        .maybeSingle(),
    ]);
    if (bookingError) throw bookingError;
    if (providerError) throw providerError;
    if (payoutError) throw payoutError;

    // The provider's LOGIN address, same as every other provider email: the
    // business address is unvalidated (see email-is-server-owned).
    const { data: account, error: accountError } = await supabase
      .from('users')
      .select('email')
      .eq('id', provider.user_id)
      .single();
    if (accountError) throw accountError;
    const to = account?.email;
    if (!to) return false;

    const { subject, html } = refundRequestedProviderEmail({
      clientName: booking.customer_name?.trim() || 'A client',
      service: booking.service_name_snapshot || 'their booking',
      date: formatLongDate(booking.booking_date),
      time: formatTime12(booking.booking_time),
      reason: linked.reason,
      heldPence: payout?.status === 'held' ? Number(payout.payout_amount) : null,
    });
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
    if (!res.ok) throw new Error(await res.text());
    return true;
  } catch (e) {
    console.error(`[support] refund request ${refundRequestId}: provider not emailed:`, e);
    return false;
  }
}

/** The client and the provider's account in a conversation, or null. */
async function conversationPeople(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<{ clientId: string; providerUserId: string; businessName: string | null } | null> {
  const { data, error } = await supabase
    .from('provider_conversations')
    .select('user_id, providers!inner(user_id, display_name)')
    .eq('id', conversationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const provider = Array.isArray(data.providers) ? data.providers[0] : data.providers;
  if (!provider?.user_id) return null;
  return { clientId: data.user_id, providerUserId: provider.user_id, businessName: provider.display_name ?? null };
}

/**
 * Looks up what is being reported and checks the reporter can see it: a
 * message or conversation they are part of, or a review that is shown to
 * them. Returns null when it doesn't exist or they can't see it, so the
 * caller answers the same way in both cases.
 */
async function resolveReport(
  supabase: SupabaseClient,
  reporterId: string,
  kind: ReportKind,
  id: string,
): Promise<ResolvedReport | null> {
  if (kind === 'message') {
    const { data: message, error } = await supabase
      .from('provider_messages')
      .select('id, conversation_id, sender_id, content, created_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!message) return null;
    const people = await conversationPeople(supabase, message.conversation_id);
    if (!people || (reporterId !== people.clientId && reporterId !== people.providerUserId)) return null;
    if (message.sender_id === reporterId) return null;
    return {
      kind,
      id,
      reportedUserId: message.sender_id,
      rows: [
        ['Reported', 'A message'],
        ['Message', clip(message.content, MAX_REPORTED_EXCERPT)],
        ['Sent', message.created_at],
        ['Sent by user ID', message.sender_id],
        ['Conversation ID', message.conversation_id],
      ],
    };
  }

  if (kind === 'conversation') {
    const people = await conversationPeople(supabase, id);
    if (!people || (reporterId !== people.clientId && reporterId !== people.providerUserId)) return null;
    const reportedIsProvider = reporterId === people.clientId;
    const reportedUserId = reportedIsProvider ? people.providerUserId : people.clientId;
    const rows: Array<[string, string]> = [
      ['Reported', reportedIsProvider ? 'A provider, from a chat' : 'A client, from a chat'],
      ['Reported user ID', reportedUserId],
      ['Conversation ID', id],
    ];
    if (reportedIsProvider && people.businessName) rows.splice(1, 0, ['Business', people.businessName]);
    return { kind, id, reportedUserId, rows };
  }

  const { data: review, error } = await supabase
    .from('reviews')
    .select('id, user_id, provider_id, rating, comment, created_at, is_anonymous, providers!inner(user_id, display_name, has_gone_live, is_active)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!review) return null;
  const provider = Array.isArray(review.providers) ? review.providers[0] : review.providers;
  const shownPublicly = !review.is_anonymous && provider?.has_gone_live === true && provider?.is_active === true;
  const isAboutReporter = provider?.user_id === reporterId;
  if (!shownPublicly && !isAboutReporter) return null;
  if (review.user_id === reporterId) return null;
  return {
    kind,
    id,
    reportedUserId: review.user_id,
    rows: [
      ['Reported', 'A review'],
      ['Review', clip(review.comment, MAX_REPORTED_EXCERPT) || '(no written review)'],
      ['Rating', String(review.rating)],
      ['About', provider?.display_name ?? review.provider_id],
      ['Written by user ID', review.user_id],
      ['Written', review.created_at],
    ],
  };
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
    const refundRequestId = typeof body?.refundRequestId === 'string' && UUID.test(body.refundRequestId)
      ? body.refundRequestId
      : null;

    const reportKind = REPORT_KINDS.find((k) => k === body?.report?.kind) ?? null;
    const reportId = typeof body?.report?.id === 'string' && UUID.test(body.report.id) ? body.report.id : null;
    if (body?.report != null && (!reportKind || !reportId)) return json({ error: 'Unknown report.' }, 400);

    let report: ResolvedReport | null = null;
    if (reportKind && reportId) {
      report = await resolveReport(supabase, user.id, reportKind, reportId);
      if (!report) return json({ error: "We couldn't find that to report. It may have been removed." }, 404);
    } else {
      if (!CATEGORIES.includes(category)) return json({ error: 'Unknown category.' }, 400);
      if (!description) return json({ error: 'Description is required.' }, 400);
    }
    const ticketCategory = report ? REPORT_CATEGORY : category;
    const ticketDescription = report ? (description || '(No note added.)') : description;

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
      ['Category', ticketCategory],
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
        category: ticketCategory,
        description: ticketDescription,
        reported_kind: report?.kind ?? null,
        reported_id: report?.id ?? null,
        reported_user_id: report?.reportedUserId ?? null,
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
    if (refundRequestId) rows.push(['Refund request', refundRequestId]);
    if (report) rows.splice(1, 0, ...report.rows);

    // Runs alongside the support email; independent of it.
    const providerEmailed = refundRequestId
      ? notifyProviderOfRefundRequest(supabase, user.id, refundRequestId, ticket.id)
      : Promise.resolve(false);

    // Built from the shared templates so the support inbox gets the same
    // letterhead as everything else we send — this was the last surface still
    // on the retired orchid brand. Everything interpolated is escaped here,
    // per the escape-at-the-call-site rule the templates assume.
    const { subject, html } = supportRequestEmail({
      ticketRef: ref,
      category: ticketCategory,
      reporter: `${who} — ${reporterEmail}`,
      description: ticketDescription,
      rows,
    });

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
        subject,
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
      return json({ saved: true, notified: false, providerNotified: await providerEmailed, ticketNumber: ticket.ticket_number });
    }

    await supabase
      .from('support_requests')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', ticket.id);

    return json({ saved: true, notified: true, providerNotified: await providerEmailed, ticketNumber: ticket.ticket_number });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
