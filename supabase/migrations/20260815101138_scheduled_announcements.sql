-- ============================================================
-- CERVICED — Scheduled Announcements
-- Lets a provider queue an announcement (ProviderClienteleScreen's
-- "Announce" sheet) to send at a future date/time instead of immediately.
-- Mirrors the proven scheduled_notify_at/notify_sent_at claim-and-send
-- pattern already live for promotions (see
-- supabase/client_automation_jobs.sql STEP 3 /
-- process_scheduled_promotion_notifications) rather than inventing a new
-- mechanism — announcements just aren't a column on an existing row (they
-- have no promotions-table equivalent), so they get their own small table.
--
-- Run this in the Supabase SQL editor. Self-contained, safe to re-run.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- STEP 1: scheduled_announcements table
--   One row per queued announcement. recipient_ids is resolved and frozen
--   at schedule time (from the same audience filter AnnouncementSheet
--   already computes client-side) rather than re-evaluated at send time —
--   so a client who churns between scheduling and sending still gets
--   the announcement they were promised, and the count shown to the
--   provider when they scheduled it matches what actually goes out.
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scheduled_announcements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  recipient_ids   UUID[] NOT NULL,
  scheduled_for   TIMESTAMPTZ NOT NULL,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_announcements_pending
  ON public.scheduled_announcements (scheduled_for)
  WHERE sent_at IS NULL;

ALTER TABLE public.scheduled_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scheduled_announcements_provider_select ON public.scheduled_announcements;
CREATE POLICY scheduled_announcements_provider_select ON public.scheduled_announcements
  FOR SELECT
  USING (provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid()));

-- No client-side INSERT/UPDATE/DELETE policy — queueing and cancelling go
-- through the RPCs below (SECURITY DEFINER), matching this repo's standing
-- rule that bookings/notifications-adjacent tables are RPC-only, not
-- direct .from() writes.

-- ───────────────────────────────────────────────────────────
-- STEP 2: queue_scheduled_announcement()
--   Called by the app instead of sendAnnouncement() when the provider
--   picks a future date/time. Re-derives provider_id server-side from
--   auth.uid() rather than trusting a client-supplied id.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.queue_scheduled_announcement(
  p_title TEXT,
  p_body TEXT,
  p_recipient_ids UUID[],
  p_scheduled_for TIMESTAMPTZ
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  v_provider_id UUID;
  v_id UUID;
  v_invalid_recipient UUID;
BEGIN
  SELECT id INTO v_provider_id FROM public.providers WHERE user_id = auth.uid();
  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'No provider profile';
  END IF;
  IF p_scheduled_for <= NOW() THEN
    RAISE EXCEPTION 'scheduled_for must be in the future';
  END IF;
  IF array_length(p_recipient_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'recipient_ids must not be empty';
  END IF;

  -- Same ownership check as send_provider_client_notifications (2026-08-15
  -- harden_notification_delivery_authority) — a queued announcement must not
  -- bypass the relationship boundary that immediate sends now enforce.
  SELECT recipient.user_id
    INTO v_invalid_recipient
  FROM unnest(p_recipient_ids) AS recipient(user_id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.bookings AS booking
    WHERE booking.provider_id = v_provider_id AND booking.user_id = recipient.user_id
    UNION ALL
    SELECT 1 FROM public.bookmarks AS bookmark
    WHERE bookmark.provider_id = v_provider_id AND bookmark.user_id = recipient.user_id
    UNION ALL
    SELECT 1 FROM public.provider_follows AS follow
    WHERE follow.provider_id = v_provider_id AND follow.user_id = recipient.user_id
    UNION ALL
    SELECT 1 FROM public.provider_waitlist AS waitlist
    WHERE waitlist.provider_id = v_provider_id AND waitlist.user_id = recipient.user_id
  )
  LIMIT 1;

  IF v_invalid_recipient IS NOT NULL THEN
    RAISE EXCEPTION 'Recipient is not related to this provider';
  END IF;

  INSERT INTO public.scheduled_announcements (provider_id, title, body, recipient_ids, scheduled_for)
  VALUES (v_provider_id, p_title, p_body, p_recipient_ids, p_scheduled_for)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_scheduled_announcement(TEXT, TEXT, UUID[], TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_scheduled_announcement(TEXT, TEXT, UUID[], TIMESTAMPTZ) TO authenticated;

-- ───────────────────────────────────────────────────────────
-- STEP 3: cancel_scheduled_announcement()
--   Lets a provider pull back a queued announcement before it sends.
--   Scoped to the caller's own provider_id and to still-unsent rows —
--   returns FALSE (not an error) if it already went out, so the app can
--   show "already sent" instead of a generic failure.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_scheduled_announcement(p_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted UUID;
BEGIN
  DELETE FROM public.scheduled_announcements
   WHERE id = p_id
     AND sent_at IS NULL
     AND provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  RETURNING id INTO v_deleted;

  RETURN v_deleted IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_scheduled_announcement(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_scheduled_announcement(UUID) TO authenticated;

-- ───────────────────────────────────────────────────────────
-- STEP 4: process_scheduled_announcements()
--   Runs every 5 minutes. Sends any announcement whose scheduled_for has
--   passed. Claims sent_at up-front (same race-guard shape as
--   process_scheduled_promotion_notifications) so a second cron tick
--   can't double-send if the first run is still inserting notifications.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_scheduled_announcements()
RETURNS VOID AS $$
DECLARE
  a RECORD;
  v_provider_name TEXT;
BEGIN
  FOR a IN
    SELECT *
      FROM public.scheduled_announcements
     WHERE sent_at IS NULL
       AND scheduled_for <= NOW()
  LOOP
    UPDATE public.scheduled_announcements
       SET sent_at = NOW()
     WHERE id = a.id AND sent_at IS NULL;
    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT display_name INTO v_provider_name FROM public.providers WHERE id = a.provider_id;

    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role)
    SELECT
      uid,
      'announcement',
      COALESCE(v_provider_name, 'Your provider') || ' — ' || a.title,
      a.body,
      'medium',
      FALSE,
      a.provider_id,
      'client'
    FROM unnest(a.recipient_ids) AS uid;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ───────────────────────────────────────────────────────────
-- STEP 5: Schedule the cron job
--   cron.schedule() upserts by job_name — safe to re-run.
-- ───────────────────────────────────────────────────────────
SELECT cron.schedule(
  'process-scheduled-announcements',
  '*/5 * * * *',
  $$ SELECT public.process_scheduled_announcements(); $$
);

-- ───────────────────────────────────────────────────────────
-- VERIFY:
--   SELECT jobname, schedule, active FROM cron.job
--    WHERE jobname = 'process-scheduled-announcements';
-- ───────────────────────────────────────────────────────────
