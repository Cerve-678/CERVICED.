-- The client hat had no storage of its own. AuthContext.loadUserProfile inferred
-- it as `role <> 'provider' OR dob IS NOT NULL`, which made a provider's date of
-- birth double as their client-hat marker — so the client->provider upgrade,
-- which never collected a DOB, silently dropped the hat on the next launch.
-- This gives the hat a column of its own.

alter table public.users
  add column if not exists has_client_profile boolean not null default false;

comment on column public.users.has_client_profile is
  'True when this account has a client profile, independently of any provider profile. Written by the app (client signup, and addClientProfile when a provider adds the client hat). Replaces the old inference from `dob IS NOT NULL` — never re-derive this from another column.';

-- Backfill reproduces the replaced heuristic EXACTLY, so no account gains or
-- loses a hat at deploy time: every non-provider row already read as having a
-- client profile, and a provider row read as having one when dob was set.
-- Going forward the column is set explicitly, which also fixes the heuristic's
-- false positive (a fresh provider who gave a DOB at signup Step 2 but never
-- added a client hat used to read as dual-hat).
update public.users
   set has_client_profile = true
 where has_client_profile = false
   and (role <> 'provider' or dob is not null);
