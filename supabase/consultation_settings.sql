-- Adds consultation settings to providers and 'consultation' to service_type.

-- ── Providers: consultation flags ─────────────────────────────────────────────
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS online_consultations_available BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consultation_required_new_clients BOOLEAN NOT NULL DEFAULT false;

-- ── Services: allow 'consultation' as a service_type ──────────────────────────
-- Drop the existing constraint (it was created inline on the column), re-add with new value.
-- Safe to run multiple times — IF NOT EXISTS handles the column; we recreate the constraint.
ALTER TABLE public.services
  DROP CONSTRAINT IF EXISTS services_service_type_check;

ALTER TABLE public.services
  ADD CONSTRAINT services_service_type_check
  CHECK (service_type IN ('treatment','enhancement','maintenance','restorative','consultation'));
