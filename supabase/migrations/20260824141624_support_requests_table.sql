-- Support requests become rows, not just emails.
--
-- Until now the in-app "Report a Problem" form (ReportProblemScreen) had two
-- lives: before 2026-08-24 it sent nothing at all (an 800ms setTimeout and a
-- "Report Sent" alert), and after it, it emailed support@cerviced.co and kept
-- no record. Email-as-the-system-of-record is the actual problem here:
--
--   * if Resend or the receiving mailbox drops the message, the report is
--     simply gone, and nobody — not us, not the reporter — can tell;
--   * there is no status, so "what is still unanswered" is unanswerable;
--   * there is nothing to rate-limit against;
--   * the reporter gets no reference and no way to see what they sent.
--
-- This table makes the row the record and the email a notification of it. The
-- edge function (send-support-request) writes here FIRST and only then sends,
-- recording the send outcome in notified_at / notify_error — so a report that
-- was captured but not delivered is visible as exactly that, rather than
-- looking identical to one that never arrived.
--
-- WRITES ARE SERVICE-ROLE ONLY. There is deliberately no INSERT/UPDATE/DELETE
-- policy: RLS denies those to `authenticated`, and the edge function writes
-- with the service role, which bypasses RLS. That keeps identity, the hat, and
-- the business name server-derived — a client cannot file a report as someone
-- else, nor mark its own ticket resolved.
--
-- ON DELETE CASCADE on user_id: a support request is personal data with no
-- retention obligation behind it (unlike `transactions`, which survive account
-- deletion pseudonymised — see transactions_survive_account_deletion.sql), so
-- erasing the account erases them. The tradeoff, noted deliberately: an open
-- ticket disappears mid-conversation if its reporter deletes their account.

create table if not exists public.support_requests (
  id             uuid primary key default gen_random_uuid(),
  -- Human-quotable reference. Sequential on purpose: "#1042" is something a
  -- person can read out, which a uuid is not.
  ticket_number  bigint generated always as identity,
  user_id        uuid not null references public.users(id) on delete cascade,

  category       text not null,
  description    text not null,
  status         text not null default 'open',

  -- Snapshots taken at report time. Stored rather than joined so a later
  -- rename or hat change never rewrites what the report said when it was made.
  reporter_email text,
  reported_as    text,
  account_holds  text,
  provider_id    uuid references public.providers(id) on delete set null,
  business_name  text,
  platform       text,
  app_version    text,

  -- Whether the notification email actually went out, and why not.
  notified_at    timestamptz,
  notify_error   text,

  created_at     timestamptz not null default now(),
  resolved_at    timestamptz,

  constraint support_requests_ticket_number_key unique (ticket_number),
  constraint support_requests_status_check
    check (status in ('open', 'in_progress', 'resolved', 'closed')),
  constraint support_requests_reported_as_check
    check (reported_as is null or reported_as in ('provider', 'client')),
  constraint support_requests_description_length
    check (char_length(description) between 1 and 4000),
  constraint support_requests_category_length
    check (char_length(category) between 1 and 60)
);

-- "What has this person reported" and the rate-limit count both hit this.
create index if not exists support_requests_user_created_idx
  on public.support_requests (user_id, created_at desc);

-- "What is still open" — the triage queue.
create index if not exists support_requests_status_created_idx
  on public.support_requests (status, created_at desc);

alter table public.support_requests enable row level security;

-- Reporters can read their own reports and nothing else. No write policies:
-- see the service-role note above.
drop policy if exists support_requests_select_own on public.support_requests;
create policy support_requests_select_own
  on public.support_requests
  for select
  to authenticated
  using (user_id = auth.uid());

revoke all on public.support_requests from anon;
grant select on public.support_requests to authenticated;
