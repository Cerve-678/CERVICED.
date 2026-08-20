-- ============================================================
-- CERVICED — A provider's own Terms & Conditions, readable by a client
-- BEFORE they book.
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- CONTEXT
-- A provider authors their own T&Cs as a form (ProviderIntakeFormScreen's
-- "Terms & Conditions" template) rather than as free text, because a form is
-- the only shape in this app that can capture a client actually agreeing to
-- something. But `provider_form_library` is owner-only —
-- "provider_form_library_all" restricts every operation to
-- provider_id IN (SELECT id FROM providers WHERE user_id = auth.uid()) — so a
-- client could not read a single byte of it.
--
-- The booking sheet needs to show those terms as a read-only pop-up at the
-- point of booking. That must NOT be done by loosening the table's RLS: the
-- library also holds medical-history and patch-test forms whose questions are
-- nobody else's business. Instead, one narrow SECURITY DEFINER function
-- returns only the terms form's title and body text, and only for a provider
-- who is actually live.
--
-- 1. Mark which library form IS the provider's terms ────────────────────────
ALTER TABLE public.provider_form_library
  ADD COLUMN IF NOT EXISTS is_terms BOOLEAN NOT NULL DEFAULT FALSE;

-- At most one per provider — the booking sheet shows "the" terms, so two would
-- make which one a client sees arbitrary.
CREATE UNIQUE INDEX IF NOT EXISTS provider_form_library_one_terms_per_provider
  ON public.provider_form_library (provider_id)
  WHERE is_terms;

-- 2. Client-readable accessor ──────────────────────────────────────────────
-- Returns the policy-question text of this provider's terms form, nothing
-- else: no other form, no other question type, no service names, no
-- auto-send/signature configuration, and no rows at all for a provider who
-- isn't live (has_gone_live/is_active), matching every other client-facing
-- provider read in the app.
CREATE OR REPLACE FUNCTION public.get_provider_terms(p_provider_id UUID)
RETURNS TABLE (title TEXT, body TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lf.title,
    -- The template writes exactly one 'policy' question; if a provider added
    -- more, concatenate them in order rather than silently showing the first.
    (
      SELECT string_agg(q ->> 'body', E'\n\n' ORDER BY ord)
      FROM jsonb_array_elements(lf.questions) WITH ORDINALITY AS t(q, ord)
      WHERE q ->> 'type' = 'policy'
        AND coalesce(btrim(q ->> 'body'), '') <> ''
    ) AS body
  FROM public.provider_form_library lf
  JOIN public.providers p ON p.id = lf.provider_id
  WHERE lf.provider_id = p_provider_id
    AND lf.is_terms
    AND p.has_gone_live
    AND p.is_active
  LIMIT 1;
$$;

-- Signed-in clients only. anon is deliberately NOT granted — see the
-- anon-EXECUTE hardening pass of 2026-08-20; nothing in the booking flow runs
-- unauthenticated.
REVOKE ALL ON FUNCTION public.get_provider_terms(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_provider_terms(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_provider_terms(UUID) TO authenticated;
