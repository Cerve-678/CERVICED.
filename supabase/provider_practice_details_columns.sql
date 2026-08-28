-- ============================================================
-- provider_practice_details_columns.sql
--
-- GAP: the Business Details screen (ProviderBusinessEmailScreen, now split
-- into a hub + BusinessIdentity / YourPractice / TrustAndAccessScreen) kept
-- 14 fields in AsyncStorage under '@provider_extras' because no DB column
-- existed for them. That meant they were device-local only: lost on
-- reinstall, never synced across devices, and never visible to clients —
-- despite the UI collecting them as if they were profile facts.
--
-- Most are cosmetic-ish (style aesthetic, products used), but three are
-- trust/safety-adjacent and had no business being device-local:
--   * patch_test_policy  — health-adjacent. Clients need to know whether a
--     patch test is required BEFORE booking a colour/lash/brow service.
--   * is_insured / dbs_checked — trust claims a client may rely on. Stored
--     as provider self-attestation only; the app does NOT verify either.
--     Naming keeps that explicit (`*_self_declared`) so no future reader
--     mistakes these for platform-verified credentials.
--
-- All new columns are nullable with no backfill: existing rows keep NULL,
-- which the app renders as "not set" rather than as a false negative. A
-- provider's device-local values are migrated up on their next save.
--
-- RLS: no new policies needed. `providers_owner_all` (ALL, auth.uid() =
-- user_id) already covers provider writes to these columns, and
-- `providers_public_read` already gates client reads on
-- has_gone_live = true AND is_active = true.
-- ============================================================

ALTER TABLE public.providers
  -- Trust & safety (provider self-declared, NOT platform-verified)
  ADD COLUMN IF NOT EXISTS patch_test_policy TEXT
    CHECK (patch_test_policy IN ('always','new_clients','optional','not_needed')),
  ADD COLUMN IF NOT EXISTS qualifications TEXT,
  ADD COLUMN IF NOT EXISTS is_insured_self_declared BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dbs_checked_self_declared BOOLEAN NOT NULL DEFAULT false,

  -- Where you work. NOTE: an earlier revision of this migration also added a
  -- `service_setting` column (salon_studio/home_studio/mobile/multiple). That
  -- was dropped from this file because the UI replaced the single-setting
  -- question with a cities-covered selector writing `service_locations` (the
  -- same list the client Search "City" filter reads). The column may still
  -- exist on the live DB from that earlier run — it is unwritten and safe to
  -- drop manually; a fresh environment simply never creates it.
  ADD COLUMN IF NOT EXISTS travel_radius TEXT,

  -- Who you work with / how you take bookings
  ADD COLUMN IF NOT EXISTS clientele TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS availability_windows TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS accepts_new_clients TEXT
    CHECK (accepts_new_clients IN ('yes','waitlist','no')),
  ADD COLUMN IF NOT EXISTS walk_ins_welcome BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_bookings_available BOOLEAN NOT NULL DEFAULT false,

  -- Style & products (style_tags TEXT[] already exists — reused, not duplicated)
  ADD COLUMN IF NOT EXISTS products_used TEXT,
  ADD COLUMN IF NOT EXISTS vegan_cruelty_free BOOLEAN NOT NULL DEFAULT false;

-- Clients filter/search on these, so index the array + lookup columns.
CREATE INDEX IF NOT EXISTS idx_providers_clientele
  ON public.providers USING GIN (clientele);
CREATE INDEX IF NOT EXISTS idx_providers_availability_windows
  ON public.providers USING GIN (availability_windows);
CREATE INDEX IF NOT EXISTS idx_providers_accepts_new_clients
  ON public.providers (accepts_new_clients)
  WHERE accepts_new_clients IS NOT NULL;

COMMENT ON COLUMN public.providers.patch_test_policy IS
  'Health-adjacent: whether a patch test is required before treatment. Shown to clients pre-booking.';
COMMENT ON COLUMN public.providers.is_insured_self_declared IS
  'Provider self-attestation only. Cerviced does NOT verify insurance — never present as platform-verified.';
COMMENT ON COLUMN public.providers.dbs_checked_self_declared IS
  'Provider self-attestation only. Cerviced does NOT verify DBS status — never present as platform-verified.';

-- ============================================================
-- DONE — provider_practice_details_columns.sql applied.
-- ============================================================
