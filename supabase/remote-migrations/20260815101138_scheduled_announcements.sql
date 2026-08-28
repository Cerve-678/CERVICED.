-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260815101138
-- Remote name: scheduled_announcements
-- Do not edit this recovery archive; create a new tracked migration for changes.

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
-- ============================================================

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

CREATE OR REPLACE FUNCTION public.queue_scheduled_announcement(
  p_title TEXT,
  p_body TEXT,
  p_recipient_ids UUID[],
  p_scheduled_for TIMESTAMPTZ
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_provider_id UUID;
  v_id UUID;
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

  INSERT INTO public.scheduled_announcements (provider_id, title, body, recipient_ids, scheduled_for)
  VALUES (v_provider_id, p_title, p_body, p_recipient_ids, p_scheduled_for)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.queue_scheduled_announcement(TEXT, TEXT, UUID[], TIMESTAMPTZ) TO authenticated;

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

GRANT EXECUTE ON FUNCTION public.cancel_scheduled_announcement(UUID) TO authenticated;

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

SELECT cron.schedule(
  'process-scheduled-announcements',
  '*/5 * * * *',
  $$ SELECT public.process_scheduled_announcements(); $$
);
