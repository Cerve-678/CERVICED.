-- 20261110150000_waitlist_signups.sql
--
-- Somewhere for cerviced.co's waitlist form to save sign-ups. Until now the
-- form was never connected and nothing anyone filled in was kept.
--
-- New table public.waitlist_signups, standalone: it touches no app table and
-- nothing in the app reads it.
--
-- Who can do what:
--   • anon (the public website) can INSERT only, and only rows that pass the
--     shape checks in the policy. It can never SELECT, UPDATE or DELETE, so the
--     list can't be read back out through the website's publishable key. The
--     form posts with Prefer: return=minimal, which needs no SELECT.
--   • authenticated (app users) gets nothing.
--   • The list is read through the Supabase dashboard / service role only.
-- One sign-up per email per side: the unique index turns a repeat into a 409,
-- which the page shows as "You're already on the list".
--
-- Replaces waitlist/waitlist_signups.sql (never applied), now deleted.

BEGIN;

CREATE TABLE public.waitlist_signups (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role           text NOT NULL CHECK (role IN ('provider', 'client')),
  email          text NOT NULL,
  postcode_area  text NOT NULL,
  business_name  text,
  services       text,
  current_tool   text,
  books_most     text,
  consented_at   timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.waitlist_signups IS
  'cerviced.co waitlist sign-ups. The website (anon) can only insert; read via the dashboard/service role.';

CREATE UNIQUE INDEX waitlist_signups_email_role_key
  ON public.waitlist_signups (lower(email), role);

ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

-- Supabase grants every privilege on new public tables to anon and
-- authenticated by default. Take them all away, then give back only INSERT.
REVOKE ALL ON public.waitlist_signups FROM anon, authenticated;
GRANT INSERT ON public.waitlist_signups TO anon;

CREATE POLICY waitlist_signups_anon_insert
  ON public.waitlist_signups
  FOR INSERT
  TO anon
  WITH CHECK (
    role IN ('provider', 'client')
    AND char_length(email) BETWEEN 3 AND 320
    AND email LIKE '%_@_%._%'
    AND char_length(postcode_area) BETWEEN 2 AND 8
    AND (business_name IS NULL OR char_length(business_name) <= 120)
    AND (services      IS NULL OR char_length(services)      <= 300)
    AND (current_tool  IS NULL OR char_length(current_tool)  <= 80)
    AND (books_most    IS NULL OR char_length(books_most)    <= 300)
    AND consented_at BETWEEN now() - interval '1 day' AND now() + interval '1 day'
  );

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261110150000', 'waitlist_signups')
ON CONFLICT (version) DO NOTHING;

COMMIT;
