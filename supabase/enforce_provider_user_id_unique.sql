-- Migration: enforce one provider row per auth account
--
-- providers.user_id previously had only a non-unique index
-- (idx_providers_user_id in phase1_schema.sql), not a UNIQUE constraint.
-- saveProviderToSupabase() does a non-atomic check-then-insert (SELECT
-- ...maybeSingle() then INSERT), so two concurrent saves (double-tap Save,
-- or the same account open on two devices) could create two providers rows
-- for the same user_id. Every downstream lookup uses .maybeSingle(), which
-- throws when more than one row matches — some call sites silently caught
-- that error and fell back to a stale local AsyncStorage cache instead of
-- surfacing it, which is a likely source of "wrong provider name shown" /
-- account-confusion reports. The auth UUID (users.id / auth.uid()) is the
-- single source of truth for account identity; this constraint makes the
-- database enforce "one provider row per account" instead of the app.

-- 1) SAFETY CHECK — run this first (it's just a SELECT, safe to run alone).
--    If it returns any rows, resolve them before running step 2 below, or
--    step 2 will fail with a duplicate-key error. For each user_id shown,
--    decide which provider_id to keep (the one with real services/bookings
--    attached) and manually reassign/delete the other(s) — do not delete
--    blindly, a wrong choice orphans that provider's live bookings.
SELECT user_id, COUNT(*) AS row_count, array_agg(id) AS provider_ids
FROM public.providers
GROUP BY user_id
HAVING COUNT(*) > 1;

-- 2) Enforce the constraint (idempotent — skips if already present).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'providers_user_id_key'
  ) THEN
    ALTER TABLE public.providers
      ADD CONSTRAINT providers_user_id_key UNIQUE (user_id);
  END IF;
END $$;
