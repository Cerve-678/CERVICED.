-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260809231144
-- Remote name: fix_provider_notification_recipient_roles
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- Provider daily recaps were written without recipient_role, which made the
-- table's legacy DEFAULT ('client') file them into the client hat.  The app
-- correctly filters by recipient_role, so those rows were invisible after a
-- user switched to provider mode.

BEGIN

-- Repair existing recaps for provider-owned accounts.  The type is uniquely
-- provider-facing, and this join makes the change safe for dual-hat users.
UPDATE public.notifications AS n
SET recipient_role = 'provider'
FROM public.providers AS p
WHERE n.type = 'daily_recap'
  AND n.user_id = p.user_id
  AND n.recipient_role <> 'provider'

CREATE OR REPLACE FUNCTION public.process_provider_daily_recap()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      p.id      AS provider_id,
      p.user_id AS provider_user_id,
      COUNT(*)  AS booking_count,
      MIN(b.booking_time) AS first_time
    FROM public.providers p
    JOIN public.bookings b ON b.provider_id = p.id
    WHERE b.booking_date = CURRENT_DATE
      AND b.status IN ('pending', 'confirmed')
      AND COALESCE((p.automation_settings->>'newBookingRecap')::BOOLEAN, TRUE) = TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM public.notifications n
        WHERE n.user_id = p.user_id
          AND n.metadata->>'kind' = 'daily_recap'
          AND n.created_at::DATE = CURRENT_DATE
      )
    GROUP BY p.id, p.user_id
  LOOP
    INSERT INTO public.notifications
      (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role, metadata)
    VALUES (
      r.provider_user_id,
      'daily_recap',
      'Today''s Schedule',
      'You have ' || r.booking_count || ' appointment' ||
        CASE WHEN r.booking_count = 1 THEN '' ELSE 's' END ||
        ' today, starting at ' || TO_CHAR(r.first_time, 'HH12:MI AM') || '.',
      'medium',
      TRUE,
      r.provider_id,
      'provider',
      jsonb_build_object('kind', 'daily_recap')
    );
  END LOOP;
END;
$$

COMMIT
