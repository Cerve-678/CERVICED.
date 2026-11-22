-- Forms: a deadline the client fills the form in by (user request 2026-11-18).
--
-- A provider sets it on the saved form as "this many hours before the
-- appointment" (provider_form_library.deadline_hours, NULL = no deadline).
-- Every sent copy then carries the real time it's due
-- (booking_intake_forms.due_at), worked out from that booking's start in UK
-- time.
--
-- due_at is stamped by a BEFORE INSERT trigger rather than by each sender, so
-- all three ways a form is sent get it without being rewritten: the app's
-- sendLibraryFormToClient, handle_auto_send_intake_form and
-- apply_hold_claimed_side_effects. No existing function changes.
--
-- Nothing in here moves money or changes who can read a row: the new columns
-- sit on tables whose RLS already covers them (owner-only library; the
-- booking's provider and client on the sent copy).

BEGIN;

ALTER TABLE public.provider_form_library
  ADD COLUMN IF NOT EXISTS deadline_hours integer;

ALTER TABLE public.provider_form_library
  DROP CONSTRAINT IF EXISTS provider_form_library_deadline_hours_check;
ALTER TABLE public.provider_form_library
  ADD CONSTRAINT provider_form_library_deadline_hours_check
  CHECK (deadline_hours IS NULL OR (deadline_hours >= 0 AND deadline_hours <= 336));

ALTER TABLE public.booking_intake_forms
  ADD COLUMN IF NOT EXISTS due_at timestamptz;

CREATE OR REPLACE FUNCTION public.stamp_intake_form_due_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_hours integer;
  v_start timestamptz;
BEGIN
  IF NEW.due_at IS NOT NULL OR NEW.library_form_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT deadline_hours INTO v_hours
    FROM public.provider_form_library
   WHERE id = NEW.library_form_id;
  IF v_hours IS NULL THEN
    RETURN NEW;
  END IF;

  -- Booking times are UK wall-clock times.
  SELECT (b.booking_date + b.booking_time) AT TIME ZONE 'Europe/London'
    INTO v_start
    FROM public.bookings b
   WHERE b.id = NEW.booking_id;
  IF v_start IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.due_at := v_start - make_interval(hours => v_hours);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.stamp_intake_form_due_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS stamp_intake_form_due_at ON public.booking_intake_forms;
CREATE TRIGGER stamp_intake_form_due_at
  BEFORE INSERT ON public.booking_intake_forms
  FOR EACH ROW EXECUTE FUNCTION public.stamp_intake_form_due_at();

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261118130000', 'form_deadline')
ON CONFLICT (version) DO NOTHING;

COMMIT;
