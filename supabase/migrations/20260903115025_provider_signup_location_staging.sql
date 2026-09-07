-- Stages Step 4's single "Where you're based" answer (AreaPicker,
-- replacing the old multi-city CityMultiSelect step) on `users` until
-- InfoRegScreen's first save carries it into providers.location_text —
-- same staging pattern as business_name/team_size/price_range etc.
-- (see provider_signup_business_fields.sql).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS location_text TEXT;
