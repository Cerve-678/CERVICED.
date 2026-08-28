-- The booking confirmation email stops depending on the app staying open.
--
-- It used to be sent by the client: BookingContext built the HTML on the
-- device and posted it after claiming the slot. Two failure modes came free
-- with that — the app closing (or losing signal) mid-request meant the
-- booking existed and the confirmation silently never happened, and the
-- phone decided the wording. This moves it to where every other notification
-- in this app already lives: the database owns it.
--
-- Mirrors send_push_on_notification_insert() deliberately, including reading
-- the service_role key from vault and skipping quietly when it is absent — a
-- booking must never fail because an email could not be queued.

alter table public.bookings
  add column if not exists confirmation_email_queued_at timestamptz,
  add column if not exists confirmation_email_error text;

comment on column public.bookings.confirmation_email_queued_at is
  'Set by queue_booking_confirmation_email() the moment the confirmation is handed to pg_net. Non-null means "we tried exactly once"; it is the idempotency marker that stops a later UPDATE re-sending.';
comment on column public.bookings.confirmation_email_error is
  'Set by the send-booking-confirmation edge function when Resend rejects the send, so "did this booking''s confirmation actually go out" is answerable from the data rather than only from logs.';

-- Backfill BEFORE the trigger exists. Without this, the next routine UPDATE
-- to any of the 66 existing rows (marking one completed, a reschedule) would
-- look like a brand-new booking and email people about appointments that
-- happened weeks ago.
update public.bookings
   set confirmation_email_queued_at = coalesce(created_at, now())
 where confirmation_email_queued_at is null;

create or replace function public.queue_booking_confirmation_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key text;
begin
  -- Nothing to send to.
  if new.customer_email is null or new.customer_email = '' then
    return new;
  end if;

  -- Already attempted. This is what makes it at-most-once per booking: the
  -- stamp is written in this same transaction, before the request goes out.
  if new.confirmation_email_queued_at is not null then
    return new;
  end if;

  -- on_hold is a slot reservation during checkout, not a booking yet, and a
  -- booking that arrives already cancelled/declined has nothing to confirm.
  if new.status is null or new.status in ('on_hold', 'cancelled', 'declined', 'rejected') then
    return new;
  end if;

  select decrypted_secret into v_key
    from vault.decrypted_secrets
   where name = 'service_role_key'
   limit 1;

  -- Key not configured — skip quietly, exactly as the push trigger does. The
  -- booking write must never fail because of an email.
  if v_key is null or v_key = '' or v_key like '<%' then
    return new;
  end if;

  new.confirmation_email_queued_at := now();

  perform net.http_post(
    url     := 'https://ztrfpfvvejzaysrelmfm.supabase.co/functions/v1/send-booking-confirmation',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object('bookingId', new.id),
    -- Same 15s as the push trigger: cold starts plus the Resend round trip
    -- were observed dropping requests at 5s.
    timeout_milliseconds := 15000
  );

  return new;
end;
$function$;

-- BEFORE, so the stamp lands in the same write rather than needing a second
-- UPDATE (which would re-enter this trigger). Covers both a booking inserted
-- straight to a real status and one promoted out of on_hold after checkout.
drop trigger if exists queue_booking_confirmation_email_trigger on public.bookings;
create trigger queue_booking_confirmation_email_trigger
  before insert or update of status on public.bookings
  for each row
  execute function public.queue_booking_confirmation_email();

revoke all on function public.queue_booking_confirmation_email() from anon, authenticated;
