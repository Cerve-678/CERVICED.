-- ============================================================
-- CERVICED — Interest-based promotion targeting
-- Run this in the Supabase SQL editor AFTER client_automation_jobs.sql.
-- Safe to re-run.
--
-- Problem: promotion notifications only ever reached people who already
-- had a direct relationship with THIS provider (booked them before, or
-- bookmarked them) — see sendPromotionNotificationsToClients() in
-- src/services/databaseService.ts and process_scheduled_promotion_notifications()
-- in client_automation_jobs.sql. provider_follows (a client explicitly
-- asking to hear from a provider) was never consulted at all.
--
-- Fix: get_promotion_audience(promo_id) targets this ONE provider's own
-- audience — bookmarked, followed, or previously booked (completed/
-- confirmed) THIS provider. Promotions stay per-provider: a promo never
-- reaches clients of other providers, even ones into the same category.
-- Both the in-app "Notify Clients" sender and the scheduled cron job now
-- call this one function, so the two paths can't drift apart again.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- STEP 1: user_interactions — referenced by trackUserInteraction()
-- (src/services/databaseService.ts) since it was added, but never had a
-- tracked migration. Without this table the insert has been failing
-- silently (analytics is wrapped in a swallow-all try/catch by design),
-- so the 'view' interactions ProviderProfileScreen already logs on every
-- profile visit may not have been persisted at all until now.
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_interactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type              TEXT NOT NULL CHECK (type IN ('view', 'search', 'favorite', 'book', 'offer_view')),
  provider_id       UUID REFERENCES public.providers(id) ON DELETE CASCADE,
  service_category  TEXT,
  duration_seconds  INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_interactions_user_id  ON public.user_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_interactions_category ON public.user_interactions(service_category);
CREATE INDEX IF NOT EXISTS idx_user_interactions_created  ON public.user_interactions(created_at);

ALTER TABLE public.user_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own interactions" ON public.user_interactions;
CREATE POLICY "Users manage their own interactions"
  ON public.user_interactions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ───────────────────────────────────────────────────────────
-- STEP 2: promotions columns referenced by app code and by
-- process_scheduled_promotion_notifications() (client_automation_jobs.sql)
-- with no tracked migration creating them — defensive, no-op if already
-- present on the live project.
-- ───────────────────────────────────────────────────────────
ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS service_ids UUID[],
  ADD COLUMN IF NOT EXISTS promo_code TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_notify_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notify_sent_at TIMESTAMPTZ;

-- ───────────────────────────────────────────────────────────
-- STEP 3: get_promotion_audience()
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_promotion_audience(p_promotion_id UUID)
RETURNS TABLE(user_id UUID) AS $$
DECLARE
  promo RECORD;
BEGIN
  SELECT id, provider_id
    INTO promo
    FROM public.promotions
   WHERE id = p_promotion_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
    -- Provider-level interest only — bookmarked, followed, or previously
    -- booked THIS provider. Never crosses into other providers' clients.
    SELECT bm.user_id FROM public.bookmarks bm WHERE bm.provider_id = promo.provider_id
    UNION
    SELECT pf.user_id FROM public.provider_follows pf WHERE pf.provider_id = promo.provider_id
    UNION
    SELECT bk.user_id FROM public.bookings bk
     WHERE bk.provider_id = promo.provider_id
       AND bk.status IN ('completed', 'confirmed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ───────────────────────────────────────────────────────────
-- STEP 4: process_scheduled_promotion_notifications() — supersedes the
-- version in client_automation_jobs.sql STEP 3 (CREATE OR REPLACE; safe
-- regardless of which file runs last since this is the only place the
-- interest-aware audience logic lives).
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_scheduled_promotion_notifications()
RETURNS VOID AS $$
DECLARE
  promo   RECORD;
  v_badge TEXT;
BEGIN
  FOR promo IN
    SELECT pr.*, p.display_name
      FROM public.promotions pr
      JOIN public.providers p ON p.id = pr.provider_id
     WHERE pr.scheduled_notify_at IS NOT NULL
       AND pr.notify_sent_at IS NULL
       AND pr.scheduled_notify_at <= NOW()
       AND pr.is_active = TRUE
  LOOP
    -- Claim before sending — skip if the app already sent it meanwhile
    UPDATE public.promotions
       SET notify_sent_at = NOW()
     WHERE id = promo.id AND notify_sent_at IS NULL;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_badge := COALESCE(
      promo.discount_text,
      CASE
        WHEN promo.discount_percent IS NOT NULL THEN promo.discount_percent || '% OFF'
        WHEN promo.discount_amount  IS NOT NULL THEN '£' || promo.discount_amount || ' OFF'
        ELSE 'Special Offer'
      END
    );

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, metadata)
    SELECT
      aud.user_id,
      'promotion',
      v_badge || ' — ' || COALESCE(promo.display_name, 'Your provider'),
      promo.title,
      'medium',
      FALSE,
      promo.provider_id,
      jsonb_build_object('promo_id', promo.id)
    FROM public.get_promotion_audience(promo.id) aud;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
