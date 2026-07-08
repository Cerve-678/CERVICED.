-- ============================================================
-- CERVICED: Client Intake Forms Migration
-- Run in Supabase SQL Editor
-- ============================================================

-- ── 1. Ensure beauty-profile columns exist on users table ──
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS hair_type            TEXT,
  ADD COLUMN IF NOT EXISTS skin_type            TEXT,
  ADD COLUMN IF NOT EXISTS allergies            TEXT[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS skin_concerns        TEXT[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS style_vibe           TEXT,
  ADD COLUMN IF NOT EXISTS medical_notes        TEXT,
  ADD COLUMN IF NOT EXISTS photography_consent  BOOLEAN  DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS treatment_history    TEXT[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS service_interests    TEXT[]   DEFAULT '{}';

-- ── 2. booking_intake_forms table ──────────────────────────
CREATE TABLE IF NOT EXISTS public.booking_intake_forms (
  id              UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      UUID      NOT NULL REFERENCES public.bookings(id)   ON DELETE CASCADE,
  provider_id     UUID      NOT NULL REFERENCES public.providers(id)  ON DELETE CASCADE,
  client_user_id  UUID      NOT NULL REFERENCES public.users(id)      ON DELETE CASCADE,
  title           TEXT      NOT NULL DEFAULT 'Pre-Appointment Form',
  questions       JSONB     NOT NULL DEFAULT '[]',
  answers         JSONB,
  status          TEXT      NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'completed')),
  sent_at         TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intake_forms_booking_id
  ON public.booking_intake_forms(booking_id);
CREATE INDEX IF NOT EXISTS idx_intake_forms_client_user_id
  ON public.booking_intake_forms(client_user_id);
CREATE INDEX IF NOT EXISTS idx_intake_forms_provider_id
  ON public.booking_intake_forms(provider_id);
CREATE INDEX IF NOT EXISTS idx_intake_forms_status
  ON public.booking_intake_forms(status);

-- ── 3. Row-Level Security ───────────────────────────────────
ALTER TABLE public.booking_intake_forms ENABLE ROW LEVEL SECURITY;

-- Provider can create forms for their bookings
CREATE POLICY "provider_insert_intake_forms" ON public.booking_intake_forms
  FOR INSERT WITH CHECK (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
    )
  );

-- Provider can read any form they created
CREATE POLICY "provider_select_intake_forms" ON public.booking_intake_forms
  FOR SELECT USING (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
    )
  );

-- Provider can update (e.g. edit questions before client sees)
CREATE POLICY "provider_update_intake_forms" ON public.booking_intake_forms
  FOR UPDATE USING (
    provider_id IN (
      SELECT id FROM public.providers WHERE user_id = auth.uid()
    )
  );

-- Client can read forms addressed to them
CREATE POLICY "client_select_intake_forms" ON public.booking_intake_forms
  FOR SELECT USING (client_user_id = auth.uid());

-- Client can fill in answers
CREATE POLICY "client_submit_intake_forms" ON public.booking_intake_forms
  FOR UPDATE USING  (client_user_id = auth.uid())
  WITH CHECK (client_user_id = auth.uid());
