-- Provider signup — Step 4 ("About your business") and Step 5 ("Tell me
-- more") questions collected at signup, before a `providers` row exists.
-- Land on `users` (same pattern business_name/business_type already use) so
-- InfoRegScreen's first-save prefill (getUserSignupPrefillInfo,
-- providerRegistrationService.ts) can carry them forward into the real
-- `providers` row instead of the provider retyping them.
--
-- price_range and preferred_contact_methods both have a PERMANENT home on
-- `providers` already (price_tier, preferred_contact_methods — the latter
-- pre-existing, the former previously unwritten). But for a brand-new
-- provider signup there is no `providers` row yet to write either into, so
-- without a staging column here both answers would be silently lost between
-- signup and InfoRegScreen's first save (only a client→provider switch,
-- which already has a providers row, could ever receive them). Staged here
-- the same way team_size/accessibility_notes/languages_spoken are.
--
-- specialties (formerly "techniques") is a category-aware, free-choice list
-- of what the provider specialises in — the chip OPTIONS shown at signup
-- depend on which service categories they picked (see SPECIALTY_OPTIONS in
-- SignUpStep5Screen.tsx), but the stored value is just a flat string array,
-- same shape regardless of category.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS team_size TEXT
    CHECK (team_size IN ('solo','small_team','large_team')),
  ADD COLUMN IF NOT EXISTS accessibility_notes TEXT,
  ADD COLUMN IF NOT EXISTS languages_spoken TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS specialties TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS price_range TEXT
    CHECK (price_range IN ('budget','mid','premium','luxury')),
  ADD COLUMN IF NOT EXISTS preferred_contact_methods TEXT[] DEFAULT '{}',
  -- Operational fact — see SignUpStep4Screen.tsx's "Preferred payment type".
  ADD COLUMN IF NOT EXISTS preferred_payment_methods TEXT[] DEFAULT '{}';

-- Same fields' permanent home once a `providers` row exists — signup's
-- `users` copy above is only a staging area until InfoRegScreen's first
-- save prefills these across (see getUserSignupPrefillInfo).
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS team_size TEXT
    CHECK (team_size IN ('solo','small_team','large_team')),
  ADD COLUMN IF NOT EXISTS accessibility_notes TEXT,
  ADD COLUMN IF NOT EXISTS languages_spoken TEXT[] DEFAULT '{}',
  -- Service-coverage cities (Step 4's "where you work" — see
  -- src/constants/ukCities.ts). Previously only staged on `users` and never
  -- copied across, so it drove nothing client-facing; this is what the new
  -- Search "City" filter matches against.
  ADD COLUMN IF NOT EXISTS service_locations TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_payment_methods TEXT[] DEFAULT '{}';
  -- specialties intentionally NOT duplicated onto `providers` — that table
  -- already has technique_tags at the per-SERVICE level (services jsonb
  -- inside `categories`). The signup-time answer is a provider-level
  -- starting point only; InfoRegScreen's prefill should seed each service's
  -- techniqueTags from it, not create a second, competing provider-level
  -- specialties column.

CREATE INDEX IF NOT EXISTS idx_providers_service_locations
  ON public.providers USING GIN (service_locations);
