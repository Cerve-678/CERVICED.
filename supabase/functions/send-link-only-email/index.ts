// supabase/functions/send-link-only-email/index.ts
// The two lifecycle emails a link-only pro (books on their own page) gets that
// no in-app action asks for: "you're live" and the go-live reminder. Called by
// the DATABASE, not the app:
//
//   - 'live'      — handle_provider_gone_live(), when a link-only profile's
//                   has_gone_live first turns true.
//   - 'reminder'  — send_link_only_go_live_reminders(), the daily cron, for a
//                   link-only account a few days old that still isn't live —
//                   including one with no providers row yet (it's created on
//                   the first Edit Profile save), which is the most stuck.
//
// The caller sends only { userId, kind }. Who it goes to, what it says and
// whether it should go at all are all re-read here from the account, so a
// stale request (a profile that has since gone live, or come back down) sends
// nothing rather than something untrue.
//
// CALLER: the service role only — the request functions post the vault's
// service_role_key. Checked with isServiceRoleRequest(), which accepts either
// key format the project has; an exact string compare is what 403'd every
// release-payouts run (2026-10-11).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  LINK_ONLY_GO_LIVE_STEPS,
  linkOnlyGoLiveReminderEmail,
  linkOnlyLiveEmail,
} from '../_shared/emailTemplates.ts';
import { isServiceRoleRequest } from '../_shared/serviceAuth.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = 'CERVICED <noreply@cerviced.co>';

const KINDS = ['live', 'reminder'] as const;
type Kind = typeof KINDS[number];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  try {
    if (!(await isServiceRoleRequest(req.headers.get('Authorization')))) {
      return json({ error: 'This endpoint is called by the database only.' }, 403);
    }

    const { userId, kind } = await req.json();
    if (!userId) return json({ error: 'Missing userId.' }, 400);
    if (!KINDS.includes(kind as Kind)) return json({ error: 'Unknown email kind.' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const [{ data: account }, { data: provider }] = await Promise.all([
      supabase
        .from('users')
        .select('name, email, external_booking_url, deletion_requested_at')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('providers')
        .select('id, display_name, booking_mode, has_gone_live, logo_url, about_text')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);
    if (!account) return json({ error: 'Account not found.' }, 404);
    if (account.deletion_requested_at) return json({ skipped: 'account being deleted' });

    // Same rule as send-account-email: the providers row decides once it
    // exists; before that, the link saved at sign-up does.
    const isLinkOnly = provider
      ? provider.booking_mode === 'external'
      : Boolean(account.external_booking_url?.trim());
    if (!isLinkOnly) return json({ skipped: 'not link-only' });

    // Re-checked rather than trusted from the caller: the state can have moved
    // between the request being queued and this running.
    const live = provider?.has_gone_live === true;
    if (kind === 'live' && !live) return json({ skipped: 'not live' });
    if (kind === 'reminder' && live) return json({ skipped: 'already live' });

    // The login address, as send-account-email uses — the one address on the
    // account known to reach its holder (see the note there).
    const to = account.email;
    if (!to) return json({ skipped: 'no address on file' });

    const params = {
      name: account.name ?? '',
      ...(provider?.display_name ? { businessName: provider.display_name } : {}),
    };

    let mail: { subject: string; html: string };
    if (kind === 'live') {
      mail = linkOnlyLiveEmail(params);
    } else {
      // The same four checks as check_and_set_provider_live's link-only branch,
      // so the email lists exactly what is still keeping the profile down.
      // With no providers row yet, none of the four can be done.
      const [{ count: openDays }, { count: photos }] = !provider
        ? [{ count: 0 }, { count: 0 }]
        : await Promise.all([
            supabase
              .from('provider_availability')
              .select('id', { count: 'exact', head: true })
              .eq('provider_id', provider.id)
              .eq('is_closed', false),
            supabase
              .from('portfolio_items')
              .select('id', { count: 'exact', head: true })
              .eq('provider_id', provider.id),
          ]);
      const [logoStep, aboutStep, hoursStep, portfolioStep] = LINK_ONLY_GO_LIVE_STEPS;
      const remaining = [
        ...(provider?.logo_url?.trim() ? [] : [logoStep]),
        ...(provider?.about_text?.trim() ? [] : [aboutStep]),
        ...((openDays ?? 0) > 0 ? [] : [hoursStep]),
        ...((photos ?? 0) > 0 ? [] : [portfolioStep]),
      ];
      if (remaining.length === 0) return json({ skipped: 'nothing left to do' });
      mail = linkOnlyGoLiveReminderEmail({ ...params, remaining });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject: mail.subject, html: mail.html }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[link-only-email] ${kind} for ${userId} failed: ${errText}`);
      return json({ error: 'Send failed.' }, 502);
    }

    return json({ sent: true });
  } catch (error) {
    console.error(`[link-only-email] unhandled: ${error instanceof Error ? error.message : String(error)}`);
    return json({ error: 'Unexpected error.' }, 500);
  }
});
