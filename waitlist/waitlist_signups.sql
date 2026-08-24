-- CERVICED — pre-launch waitlist signups
--
-- NOT APPLIED LIVE. This is deliberately kept out of supabase/migrations/
-- until someone decides the waitlist site is going ahead. If it does, move it
-- into a properly-timestamped migration rather than running it ad hoc —
-- see the migration-drift notes in CLAUDE.md.
--
-- Nothing here touches app tables. It is a standalone marketing-capture table.

create table if not exists public.waitlist_signups (
  id             uuid primary key default gen_random_uuid(),
  role           text not null check (role in ('provider', 'client')),
  email          text not null,
  postcode_area  text not null,
  business_name  text,
  services       text,
  current_tool   text,
  books_most     text,
  consented_at   timestamptz not null,
  created_at     timestamptz not null default now()
);

-- One signup per email per side. The page turns a 409 into a friendly
-- "you're already on the list" instead of an error.
create unique index if not exists waitlist_signups_email_role_key
  on public.waitlist_signups (lower(email), role);

alter table public.waitlist_signups enable row level security;

-- The public page inserts as `anon` and must never be able to read anything
-- back. There is deliberately NO select/update/delete policy for anon or
-- authenticated: without one, RLS denies by default, so the signup list is
-- readable only via the service role (dashboard / server-side export).
drop policy if exists waitlist_signups_anon_insert on public.waitlist_signups;
create policy waitlist_signups_anon_insert
  on public.waitlist_signups
  for insert
  to anon
  with check (
    role in ('provider', 'client')
    and char_length(email) between 3 and 320
    and char_length(postcode_area) between 2 and 8
  );

grant insert on public.waitlist_signups to anon;
