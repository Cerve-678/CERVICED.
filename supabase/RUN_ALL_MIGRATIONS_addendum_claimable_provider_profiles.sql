-- ============================================================
-- ADDENDUM for RUN_ALL_MIGRATIONS.sql — not auto-applied there.
--
-- This is the exact block that would be appended to the end of
-- RUN_ALL_MIGRATIONS.sql (right after the "DONE — Info packs attach to
-- bookings; daily recap scheduled" section) to fold this migration into
-- the one-shot consolidated script. Paste it in yourself when ready —
-- content is otherwise identical to supabase/claimable_provider_profiles.sql,
-- which remains the standalone, independently-runnable source of truth.
-- ============================================================


-- ════════════════════════════════════════════════════
-- claimable_provider_profiles.sql
-- ════════════════════════════════════════════════════
-- ============================================================
-- CERVICED — Claimable (scraped) Provider Profiles
-- Run this entire script in the Supabase SQL Editor.
--
-- Lets a provider row exist with no owner yet (source = 'scraped',
-- is_claimed = FALSE), created by a batch import pipeline, and adds a
-- SECURITY DEFINER RPC that lets the real business owner attach their
-- new auth account to that row via a one-time claim token.
--
-- IMPORTANT — scope of this migration:
--   Only the schema + claim_provider_profile() RPC ship here. The
--   scraping pipeline (Edge Functions) and outreach email are separate,
--   later pieces — this file alone does not scrape or email anyone.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ───────────────────────────────────────────────────────────
-- STEP 1: providers — allow unowned rows, track provenance + claim state
-- ───────────────────────────────────────────────────────────

-- Unclaimed scraped listings have no auth account yet.
ALTER TABLE public.providers ALTER COLUMN user_id DROP NOT NULL;
-- providers_user_id_key (UNIQUE) already tolerates any number of NULLs —
-- no change needed there.

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS is_claimed            BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS source                TEXT NOT NULL DEFAULT 'self_signup',
  ADD COLUMN IF NOT EXISTS source_site           TEXT,
  ADD COLUMN IF NOT EXISTS source_url            TEXT,
  ADD COLUMN IF NOT EXISTS scraped_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claim_token           TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS claim_token_expires_at TIMESTAMPTZ,
  -- Which columns came from scraping and haven't been confirmed by the
  -- owner yet — the claim UI uses this to flag fields as "please verify"
  -- instead of presenting scraped data as already-trustworthy.
  ADD COLUMN IF NOT EXISTS scraped_fields        TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.providers DROP CONSTRAINT IF EXISTS providers_source_check;
ALTER TABLE public.providers
  ADD CONSTRAINT providers_source_check CHECK (source IN ('self_signup', 'scraped'));

-- A claimed row must have an owner, and an unclaimed row must not —
-- keeps the two concepts from drifting apart under a bad update.
ALTER TABLE public.providers DROP CONSTRAINT IF EXISTS providers_claim_state_check;
ALTER TABLE public.providers
  ADD CONSTRAINT providers_claim_state_check CHECK (
    (is_claimed = TRUE  AND user_id IS NOT NULL) OR
    (is_claimed = FALSE AND user_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_providers_is_claimed  ON public.providers(is_claimed);
CREATE INDEX IF NOT EXISTS idx_providers_claim_token ON public.providers(claim_token);

-- ───────────────────────────────────────────────────────────
-- STEP 2: provider_scrape_jobs / provider_scrape_sources
--   Batch-run tracking for the (separate, not-yet-built) scraping
--   pipeline — mirrors the job-table style already used in
--   automation_jobs.sql / client_automation_jobs.sql.
-- ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.provider_scrape_jobs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_site    TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
  total_sources  INT NOT NULL DEFAULT 0,
  processed      INT NOT NULL DEFAULT 0,
  created_count  INT NOT NULL DEFAULT 0,
  skipped_dupes  INT NOT NULL DEFAULT 0,
  failed_count   INT NOT NULL DEFAULT 0,
  started_at     TIMESTAMPTZ,
  finished_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.provider_scrape_sources (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID NOT NULL REFERENCES public.provider_scrape_jobs(id) ON DELETE CASCADE,
  source_url   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  error        TEXT,
  provider_id  UUID REFERENCES public.providers(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scrape_sources_job_status
  ON public.provider_scrape_sources(job_id, status);

-- Both tables are written only by Edge Functions using the service-role
-- key, which bypasses RLS entirely — enable RLS with no policies so no
-- anon/authenticated client can read or write job internals directly.
ALTER TABLE public.provider_scrape_jobs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_scrape_sources ENABLE ROW LEVEL SECURITY;

-- ───────────────────────────────────────────────────────────
-- STEP 3: provider_outreach_suppressions
--   Schema only, for the (also separate, not-yet-built and NOT
--   currently enabled) outreach step — every future send must check
--   this table first, and the unsubscribe link writes to it.
-- ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.provider_outreach_suppressions (
  email          TEXT PRIMARY KEY,
  suppressed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.provider_outreach_suppressions ENABLE ROW LEVEL SECURITY;

-- ───────────────────────────────────────────────────────────
-- STEP 4: claim_provider_profile(p_claim_token)
--   Lets the currently authenticated user attach their account to an
--   unclaimed provider row. SECURITY DEFINER because it must update a
--   providers row the caller does not yet own (providers_owner_all only
--   allows user_id = auth.uid(), which is by definition not yet true).
-- ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.claim_provider_profile(p_claim_token TEXT)
RETURNS UUID AS $$
DECLARE
  v_provider_id UUID;
  v_caller_id   UUID := auth.uid();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Must be signed in to claim a profile.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.providers WHERE user_id = v_caller_id) THEN
    RAISE EXCEPTION 'This account already has a provider profile.';
  END IF;

  SELECT id INTO v_provider_id
  FROM public.providers
  WHERE claim_token = p_claim_token
    AND is_claimed = FALSE
    AND claim_token_expires_at > NOW()
  FOR UPDATE;

  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'This claim link is invalid or has expired.';
  END IF;

  UPDATE public.providers
     SET user_id                = v_caller_id,
         is_claimed              = TRUE,
         claimed_at               = NOW(),
         claim_token              = NULL,
         claim_token_expires_at   = NULL
   WHERE id = v_provider_id;

  UPDATE public.users SET role = 'provider' WHERE id = v_caller_id;

  RETURN v_provider_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- DONE — claimable provider profile schema + claim RPC created.
-- Scraping pipeline and outreach email are separate follow-up pieces.
-- ============================================================
