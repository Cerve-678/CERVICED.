-- A booking confirmation that never arrives must be visible, and retried.
--
-- The failure this closes (2026-09-25): send-booking-confirmation answered
-- every request with 403 because its own copy of the service-role key no
-- longer matched vault's. The trigger had already stamped
-- confirmation_email_queued_at, and confirmation_email_error is only written
-- when Resend rejects a send, so nothing recorded anything. Bookings were
-- made, no email went out, and no row said so.
--
-- After this, three separate facts are recorded, so "did it go out" is
-- answerable from the data:
--   confirmation_email_sent_at   written by the edge function once Resend
--                                accepted the send (the only party that knows)
--   confirmation_email_attempts  how many times we handed it to the function
--   confirmation_email_error     why the last attempt failed, if it did
-- and a cron job retries a request that was made but never confirmed.
--
-- Rows that existed before this migration have attempts = NULL, which means
-- "predates delivery tracking" and is never retried. That is deliberate and it
-- is why there is no backfill UPDATE: an UPDATE would fire every BEFORE UPDATE
-- trigger on bookings, and the retry job must not email people about
-- appointments from weeks ago.

alter table public.bookings
  add column if not exists confirmation_email_sent_at timestamptz,
  add column if not exists confirmation_email_attempts smallint;

comment on column public.bookings.confirmation_email_queued_at is
  'When the confirmation was LAST handed to pg_net (first attempt, then each retry). Non-null stops queue_booking_confirmation_email() re-sending on a later UPDATE. It does not mean the email was sent — see confirmation_email_sent_at.';
comment on column public.bookings.confirmation_email_sent_at is
  'Set by the send-booking-confirmation edge function when Resend accepted the send. NULL with confirmation_email_attempts >= 3 means we gave up.';
comment on column public.bookings.confirmation_email_attempts is
  'Times the confirmation was handed to the edge function (1 = the trigger, 2-3 = retries). NULL = the booking predates delivery tracking and is never retried.';
comment on column public.bookings.confirmation_email_error is
  'Why the last attempt failed: Resend''s rejection text, or a note that the function never confirmed a send. Cleared when a later attempt succeeds.';

-- ── One place that makes the request ────────────────────────────────────
-- The trigger and the retry job both call this, so they cannot drift apart on
-- the URL, the key lookup or the timeout. Returns false when the vault key is
-- not configured (skip quietly, exactly as the push trigger does: a booking
-- write must never fail because of an email).
create or replace function public.request_booking_confirmation_email(p_booking_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key text;
begin
  select decrypted_secret into v_key
    from vault.decrypted_secrets
   where name = 'service_role_key'
   limit 1;

  if v_key is null or v_key = '' or v_key like '<%' then
    return false;
  end if;

  perform net.http_post(
    url     := 'https://ztrfpfvvejzaysrelmfm.supabase.co/functions/v1/send-booking-confirmation',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object('bookingId', p_booking_id),
    -- Same 15s as the push trigger: cold starts plus the Resend round trip
    -- were observed dropping requests at 5s.
    timeout_milliseconds := 15000
  );
  return true;
end;
$function$;

revoke all on function public.request_booking_confirmation_email(uuid) from public, anon, authenticated;

-- ── The trigger, now through the helper and counting its attempt ─────────
create or replace function public.queue_booking_confirmation_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Nothing to send to.
  if new.customer_email is null or new.customer_email = '' then
    return new;
  end if;

  -- Already attempted. This is what makes the FIRST send at-most-once: the
  -- stamp is written in this same transaction, before the request goes out.
  -- Later attempts belong to retry_unsent_booking_confirmations().
  if new.confirmation_email_queued_at is not null then
    return new;
  end if;

  -- on_hold is a slot reservation during checkout, not a booking yet, and a
  -- booking that arrives already cancelled/declined has nothing to confirm.
  if new.status is null or new.status in ('on_hold', 'cancelled', 'declined', 'rejected') then
    return new;
  end if;

  -- Key not configured: skip quietly, the booking write must not fail.
  if not public.request_booking_confirmation_email(new.id) then
    return new;
  end if;

  new.confirmation_email_queued_at := now();
  new.confirmation_email_attempts := 1;
  return new;
end;
$function$;

-- ── The retry ────────────────────────────────────────────────────────────
-- Picks up a confirmation that was requested but never confirmed as sent:
-- the function refused it (as on 2026-09-25), timed out, crashed, or Resend
-- rejected it. Bounded on every axis: 50 rows a run, 3 attempts a booking,
-- backed off 5 then 10 minutes, nothing older than 2 days, nothing for an
-- appointment already past, nothing for a booking that is no longer live.
--
-- FOR UPDATE SKIP LOCKED so an overlapping run cannot double-send.
create or replace function public.retry_unsent_booking_confirmations()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_retried integer := 0;
begin
  -- Give-up is recorded, not just implied by a counter reaching 3.
  update public.bookings b
     set confirmation_email_error = 'The confirmation email was requested 3 times and never confirmed as sent.'
   where b.id in (
     select id from public.bookings
      where confirmation_email_sent_at is null
        and confirmation_email_attempts >= 3
        and confirmation_email_error is null
        and confirmation_email_queued_at < now() - interval '15 minutes'
      limit 50
   );

  with due as (
    select id
      from public.bookings
     where confirmation_email_sent_at is null
       and confirmation_email_attempts between 1 and 2
       and confirmation_email_queued_at < now() - (confirmation_email_attempts * interval '5 minutes')
       and confirmation_email_queued_at > now() - interval '2 days'
       and status not in ('on_hold', 'cancelled', 'declined', 'rejected')
       and coalesce(customer_email, '') <> ''
       and booking_date::date >= current_date
     order by confirmation_email_queued_at
     limit 50
       for update skip locked
  ),
  requested as (
    select d.id, public.request_booking_confirmation_email(d.id) as ok
      from due d
  )
  update public.bookings b
     set confirmation_email_attempts = b.confirmation_email_attempts + 1,
         confirmation_email_queued_at = now()
    from requested r
   where b.id = r.id
     and r.ok;

  get diagnostics v_retried = row_count;
  return v_retried;
end;
$function$;

revoke all on function public.retry_unsent_booking_confirmations() from public, anon, authenticated;

-- Small on purpose: only rows still awaiting a confirmation are in it.
create index if not exists bookings_confirmation_email_retry_idx
  on public.bookings (confirmation_email_queued_at)
  where confirmation_email_sent_at is null
    and confirmation_email_attempts between 1 and 2;

-- Every 5 minutes, matching the smallest backoff step. Idempotent: re-running
-- this file replaces the job rather than doubling it.
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'retry-unsent-booking-confirmations';
end $$;

select cron.schedule(
  'retry-unsent-booking-confirmations',
  '*/5 * * * *',
  $$select public.retry_unsent_booking_confirmations();$$
);
