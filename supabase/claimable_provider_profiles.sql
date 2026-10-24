-- ============================================================
-- CERVICED — Claimable (scraped) Provider Profiles
-- Run this entire script in the Supabase SQL Editor.
--
-- Lets a provider row exist with no owner yet (source = 'scraped',
-- is_claimed = FALSE), created by a batch import pipeline.
--
-- SUPERSEDED IN PART 2026-10-19 by
-- supabase/migrations/20261024100000_listing_claims_checked_by_instagram.sql.
-- The email-code claim this file used to define (the claim_token columns
-- and claim_provider_profile()) was retired: providers_unclaimed_read made
-- the code readable by anon. Those pieces are removed here so re-running
-- this file can't bring them back. Claims now go through
-- provider_claim_requests, checked against the listing's Instagram bio.
--
-- IMPORTANT — scope of this migration:
--   Only the schema ships here. The
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

-- Existing RLS on `providers` only grants public SELECT via
-- providers_public_read (has_gone_live = true AND is_active = true) — every
-- unclaimed/scraped row is has_gone_live = false by construction, so without
-- this policy no client session can ever read one, regardless of what
-- app-side queries ask for (searchUnclaimedProviders, getUnclaimedProviderDetail,
-- getDiscoverUnclaimedProviders in databaseService.ts all silently return
-- zero rows). Narrowly scoped to is_claimed = false only — additive
-- alongside providers_public_read (multiple PERMISSIVE policies OR
-- together), so it can never widen access to a claimed provider's row.
DROP POLICY IF EXISTS providers_unclaimed_read ON public.providers;
CREATE POLICY providers_unclaimed_read
  ON public.providers
  FOR SELECT
  TO public
  USING (is_claimed = false);

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

-- ============================================================
-- DONE — claimable provider profile schema created.
-- Scraping pipeline and outreach email are separate follow-up pieces.
-- ============================================================
