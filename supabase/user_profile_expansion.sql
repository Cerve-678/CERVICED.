-- Phase 5.1 — User profile personalisation columns
-- Run after the base schema is in place.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS gender TEXT
    CHECK (gender IN ('female','male','non-binary','prefer-not-to-say')),
  ADD COLUMN IF NOT EXISTS has_kids BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS birth_year SMALLINT;

CREATE INDEX IF NOT EXISTS idx_users_gender   ON public.users(gender);
CREATE INDEX IF NOT EXISTS idx_users_has_kids ON public.users(has_kids);
