-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260817085035
-- Remote name: provider_signup_business_fields
-- Do not edit this recovery archive; create a new tracked migration for changes.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS team_size TEXT
    CHECK (team_size IN ('solo','small_team','large_team')),
  ADD COLUMN IF NOT EXISTS accessibility_notes TEXT,
  ADD COLUMN IF NOT EXISTS languages_spoken TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS specialties TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS price_range TEXT
    CHECK (price_range IN ('budget','mid','premium','luxury')),
  ADD COLUMN IF NOT EXISTS preferred_contact_methods TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_payment_methods TEXT[] DEFAULT '{}';

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS team_size TEXT
    CHECK (team_size IN ('solo','small_team','large_team')),
  ADD COLUMN IF NOT EXISTS accessibility_notes TEXT,
  ADD COLUMN IF NOT EXISTS languages_spoken TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS service_locations TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_payment_methods TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_providers_service_locations
  ON public.providers USING GIN (service_locations);
