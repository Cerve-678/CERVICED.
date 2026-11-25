-- A request that ends without being accepted gets an email.
--
-- 20261125100000 sends "Request sent" while a booking is a request, says
-- "We'll email you again when it's accepted", and sends "Booking confirmed"
-- when it is. A request the provider declines, or that expires unanswered,
-- got no email at all. The app sends a notification, but a client who booked
-- on the website has only email, so they never found out.
--
-- This asks send-booking-confirmation for one more email as a request goes
-- from 'pending' to 'cancelled' by anyone but the client (the same test
-- stamp_booking_cancellation() uses for declined_at; that trigger runs after
-- this one, so the column isn't set yet here). The function re-checks
-- declined_at once the write has landed, says "declined" when the provider
-- cancelled it and "expired" when the system did, and says what became of
-- the money (hold released, or a refund for an older charged request).
--
-- Sent once, from here. The confirmation stamps and their retry job are left
-- alone. A client withdrawing their own request gets nothing, as before.
--
-- Redefined from live (20261125100000, applied 2026-11-25) with an md5 guard.

BEGIN;

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.queue_booking_confirmation_email'::regproc))
     <> '39f0893d89b9bb4fe7fd99dfa85781fb' THEN
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

  if tg_op = 'UPDATE' then
    -- A request declined by the provider or expired unanswered: tell the
    -- client. Not when the client withdrew it themselves.
    if old.status = 'pending' and new.status = 'cancelled'
       and (auth.uid() is null or auth.uid() is distinct from new.user_id) then
      perform public.request_booking_confirmation_email(new.id);
      return new;
    end if;

    -- Accepting is the one move from 'pending' to 'confirmed'; anything else
    -- leaving 'pending' (cancelled, declined, expired) is never emailed.
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
