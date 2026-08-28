-- providers.business_type had NO constraint at all, while users.business_type
-- has carried `users_business_type_check` since signup was written. The column
-- that the whole app actually reads was the unconstrained one: every
-- client-facing venue decision (isMobileBooking, the address-release picker's
-- gating, the provider booking detail's Location row) keys off
-- providers.business_type, and nothing stopped a typo'd or legacy value from
-- being written there. A value outside the union doesn't fail loudly — it
-- silently reads as "not mobile", which for a mobile provider means telling
-- clients to travel to an address that is really the provider's home.
--
-- Mirrors the users constraint exactly, NULL included: a provider row can
-- legitimately predate the field, and the app treats NULL as "unknown venue"
-- rather than defaulting it (see appointmentVenue in
-- src/features/business-details/options.ts).
--
-- Every existing row already satisfies this — the 4 non-null values live are
-- home_based, studio and mobile.
ALTER TABLE providers
  DROP CONSTRAINT IF EXISTS providers_business_type_check;

ALTER TABLE providers
  ADD CONSTRAINT providers_business_type_check
  CHECK (
    business_type IS NULL
    OR business_type = ANY (ARRAY['salon'::text, 'studio'::text, 'home_based'::text, 'mobile'::text])
  );
