-- Run this in Supabase SQL Editor after intake_forms_migration.sql

-- ── Provider Form Library ────────────────────────────────────────────────────
-- Forms the provider builds and saves; not tied to a specific booking yet.

CREATE TABLE IF NOT EXISTS provider_form_library (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id        UUID REFERENCES providers(id) ON DELETE CASCADE NOT NULL,
  title              TEXT NOT NULL,
  questions          JSONB NOT NULL DEFAULT '[]',
  service_names      TEXT[] NOT NULL DEFAULT '{}',   -- provider service names this form is for
  auto_send          BOOLEAN NOT NULL DEFAULT FALSE,  -- auto-send when matching service is booked
  requires_signature BOOLEAN NOT NULL DEFAULT FALSE,
  sent_count         INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE provider_form_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "provider_form_library_all" ON provider_form_library;
CREATE POLICY "provider_form_library_all"
ON provider_form_library FOR ALL
USING (
  provider_id IN (SELECT id FROM providers WHERE user_id = auth.uid())
);

-- ── Extend booking_intake_forms ──────────────────────────────────────────────
-- Link sent instances back to their library template, and capture signature.

ALTER TABLE booking_intake_forms
  ADD COLUMN IF NOT EXISTS library_form_id  UUID REFERENCES provider_form_library(id),
  ADD COLUMN IF NOT EXISTS requires_signature BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS client_signature  TEXT DEFAULT NULL;
