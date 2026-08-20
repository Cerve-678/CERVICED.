-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260817152452
-- Remote name: provider_practice_details_columns
-- Do not edit this recovery archive; create a new tracked migration for changes.

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS patch_test_policy TEXT
    CHECK (patch_test_policy IN ('always','new_clients','optional','not_needed')),
  ADD COLUMN IF NOT EXISTS qualifications TEXT,
  ADD COLUMN IF NOT EXISTS is_insured_self_declared BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dbs_checked_self_declared BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS service_setting TEXT
    CHECK (service_setting IN ('salon_studio','home_studio','mobile','multiple')),
  ADD COLUMN IF NOT EXISTS travel_radius TEXT,
  ADD COLUMN IF NOT EXISTS clientele TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS availability_windows TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS accepts_new_clients TEXT
    CHECK (accepts_new_clients IN ('yes','waitlist','no')),
  ADD COLUMN IF NOT EXISTS walk_ins_welcome BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_bookings_available BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS products_used TEXT,
  ADD COLUMN IF NOT EXISTS vegan_cruelty_free BOOLEAN NOT NULL DEFAULT false;

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
