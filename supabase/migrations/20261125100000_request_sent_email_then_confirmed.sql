-- A request gets a "Request sent" email, and "Booking confirmed" only once the
-- provider accepts it.
--
-- Until now the one confirmation email went out the moment a booking left
-- on_hold, whatever it became. A request (a provider who reviews every
-- booking, or an out-of-hours request) is 'pending' at that point, so the
-- client was told "Booking confirmed" for a booking that wasn't, and heard
-- nothing by email when it really was accepted. A client who booked on the
-- website has no app notifications, so the email is all they get.
--
-- send-booking-confirmation now reads the booking's status and sends the
-- request wording while it is 'pending'. This makes the trigger send again
-- when a request is accepted: going from 'pending' to 'confirmed' clears the
-- email stamps, so the normal path (and retry_unsent_booking_confirmations)
-- treats it as a booking whose confirmation hasn't gone out yet.
--
-- A declined or expired request is cancelled, which this never emails, as
-- before.
--
-- Redefined from live (read 2026-11-25) with an md5 guard. No request was
-- pending when this was written, so nobody gets a second "Booking confirmed"
-- for a request already told it was confirmed.

BEGIN;

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.queue_booking_confirmation_email'::regproc))
     <> '301271b3f8a50820690f43e198e6dcee' THEN
    RAISE EXCEPTION 'queue_booking_confirmation_email changed since 2026-11-25; re-read it before applying';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.queue_booking_confirmation_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.customer_email is null or new.customer_email = '' then
    return new;
  end if;

  -- A request accepted: its "Request sent" email has gone, and now it needs
  -- "Booking confirmed". Clearing the stamps sends it below, and lets the
  -- retry job pick it up if that first attempt never lands.
  -- Accepting is the one move from 'pending' to 'confirmed'; anything else
  -- leaving 'pending' (cancelled, declined, expired) is never emailed.
  if tg_op = 'UPDATE' then
    if old.status = 'pending' and new.status = 'confirmed' then
      new.confirmation_email_queued_at := null;
      new.confirmation_email_sent_at := null;
      new.confirmation_email_attempts := 0;
      new.confirmation_email_error := null;
    end if;
  end if;

  if new.confirmation_email_queued_at is not null then
    return new;
  end if;

  if new.status is null or new.status in ('on_hold', 'cancelled', 'declined', 'rejected') then
    return new;
  end if;

  if not public.request_booking_confirmation_email(new.id) then
    return new;
  end if;

  new.confirmation_email_queued_at := now();
  new.confirmation_email_attempts := 1;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.queue_booking_confirmation_email() FROM PUBLIC, anon, authenticated;

COMMIT;
