-- One row per price-list read by the extract-provider-profile edge function
-- (Info Reg → Import a price list). Each read is a paid Claude call, and the
-- function lets any provider account call it (users.role is chosen at
-- sign-up, so it isn't a real gate), so it counts these rows to cap how many
-- reads one account can make: see MAX_READS_PER_HOUR/DAY in
-- supabase/functions/extract-provider-profile/index.ts.
--
-- Only the edge function (service role) reads or writes it: RLS is on with no
-- policies, and nothing is granted to anon/authenticated. It holds no content
-- from what was read, only who, when, and what kind.
--
-- Numbered above live max (20261109220000) and every migration on an open PR.

BEGIN;

CREATE TABLE IF NOT EXISTS public.profile_import_reads (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  source      text NOT NULL CHECK (source IN ('link', 'files')),
  file_count  integer NOT NULL DEFAULT 0 CHECK (file_count >= 0)
);

CREATE INDEX IF NOT EXISTS profile_import_reads_user_time_idx
  ON public.profile_import_reads (user_id, created_at DESC);

ALTER TABLE public.profile_import_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_import_reads FROM PUBLIC, anon, authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261109230000', 'profile_import_reads')
ON CONFLICT (version) DO NOTHING;

COMMIT;
