-- More to Style & vibe in the Beauty Profile (owner, 2026-11-17: "add more to
-- style and vibe so it's not just pills").
--
-- Three new answers on the client's own users row, all optional:
-- style_aesthetics (Clean girl, Soft glam, Old money…), style_occasions
-- (Everyday, Weddings…) and style_routine (Quick & easy / A bit of effort /
-- Full routine). They describe the client's look on their own Beauty Profile
-- and are NOT shared with providers: beauty_profile_fields_for_category and
-- get_client_beauty_profile_for_booking are unchanged. New columns get the
-- users table's existing grants and RLS (own row only). No function changes.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS style_aesthetics text[],
  ADD COLUMN IF NOT EXISTS style_occasions text[],
  ADD COLUMN IF NOT EXISTS style_routine text;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261117130000', 'beauty_profile_style_questions')
ON CONFLICT DO NOTHING;

COMMIT;
