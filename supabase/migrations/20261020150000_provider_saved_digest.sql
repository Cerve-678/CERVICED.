-- "N people saved you today" — a daily count for providers.
--
-- Frontier at authoring: 20261020140000 (verified live 2026-10-20).
--
-- Decided with the user 2026-10-20 (FUTURE_LOGIC "Link-only pros still see
-- full-service features", item 1):
--   - a count, never names: who saved a provider stays private;
--   - at most one a day, so a busy day can't become a stream of pings;
--   - every provider, not just link-only;
--   - on by default, with a switch (providerSaves) that mutes the push.
--     The row is still written, like every other provider switch: the
--     settings screen promises that anything switched off still shows in
--     the notifications list. The switch lives in send-push-notification's
--     PROVIDER_PREF_KEY_BY_TYPE, not here.
--
-- What this adds:
--   1. notification type provider_saved. The CHECK is rebuilt from the live
--      constraint (read 2026-10-20) plus the new value.
--   2. provider_saver_digest_counted: which clients have already been
--      counted for which provider, so a client who un-saves and saves again
--      isn't counted twice. Private: RLS on, no policies, no grants. Only
--      the SECURITY DEFINER digest reads it. Every existing save is
--      backfilled, so nobody is counted for a save made before this existed.
--   3. process_provider_saved_digest(): one set-based pass over the last
--      24 hours of saves, one notification per provider, returns how many
--      went out.
--   4. a daily cron at 18:00 UTC (7pm UK summer time, 6pm winter).
--   5. bookmarks_created_at_idx, so the 24-hour window doesn't scan the table.

BEGIN;

-- ── 1. type ────────────────────────────────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'cancel_window_closing', 'booking_pending', 'booking_confirmed', 'booking_declined',
    'booking_cancelled', 'booking_reminder', 'booking_in_progress', 'booking_not_started',
    'no_show', 'payment_success', 'new_provider', 'reschedule_request',
    'reschedule_provider_response', 'reschedule_confirmed', 'reschedule_declined',
    'reschedule_expired', 'review_request', 'review_received', 'promotion',
    'intake_form_reminder', 'intake_form_received', 'intake_form_completed',
    'info_pack_received', 'provider_message', 'announcement', 'balance_reminder',
    'waitlist_slot_available', 'new_message', 'address_released', 'birthday_greeting',
    'post_appt_check_in', 'rebooking_nudge', 'daily_recap', 'schedule_fully_booked',
    'pending_booking_reminder', 'provider_no_show', 'no_show_disputed', 'points_earned',
    'cancellation_settled', 'fee_charged', 'fee_disputed', 'fee_dispute_resolved',
    'refund_requested', 'refund_request_updated', 'maintenance_due', 'aftercare_available',
    'fee_payment_requested', 'fee_paid_by_client', 'fee_payment_lapsed',
    'provider_saved'
  ]));

-- ── 2. who has been counted ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_saver_digest_counted (
  provider_id uuid        NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES public.users(id)     ON DELETE CASCADE,
  counted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, user_id)
);

ALTER TABLE public.provider_saver_digest_counted ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_saver_digest_counted FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.provider_saver_digest_counted IS
  'Clients already counted in a provider''s "N people saved you today" digest. Private: read only by process_provider_saved_digest().';

INSERT INTO public.provider_saver_digest_counted (provider_id, user_id, counted_at)
SELECT b.provider_id, b.user_id, COALESCE(b.created_at, now())
  FROM public.bookmarks b
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS bookmarks_created_at_idx ON public.bookmarks (created_at);

-- ── 3. the digest ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_provider_saved_digest()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sent integer;
begin
  with fresh as (
    select distinct b.provider_id, b.user_id
      from public.bookmarks b
      join public.providers p on p.id = b.provider_id
     where b.created_at > now() - interval '24 hours'
       and b.user_id <> p.user_id
       and p.is_active = true
       and p.has_gone_live = true
       and not exists (
         select 1 from public.provider_saver_digest_counted c
          where c.provider_id = b.provider_id and c.user_id = b.user_id
       )
       -- A second run on the same day (a manual call, a retried job) must
       -- not send a second digest.
       and not exists (
         select 1 from public.notifications n
          where n.user_id = p.user_id
            and n.provider_id = p.id
            and n.type = 'provider_saved'
            and n.created_at > now() - interval '20 hours'
       )
  ), counted as (
    insert into public.provider_saver_digest_counted (provider_id, user_id)
    select provider_id, user_id from fresh
    on conflict do nothing
    returning provider_id
  ), per_provider as (
    select provider_id, count(*)::int as n
      from counted
     group by provider_id
  )
  insert into public.notifications
    (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role, metadata)
  select
    p.user_id,
    'provider_saved',
    case when pp.n = 1 then '1 person saved you today'
         else pp.n || ' people saved you today' end,
    'They can find you again in Your Providers.',
    'low', true, pp.provider_id, 'provider',
    jsonb_build_object('kind', 'saved_digest', 'count', pp.n)
  from per_provider pp
  join public.providers p on p.id = pp.provider_id;

  get diagnostics v_sent = row_count;
  return v_sent;
end;
$function$;

REVOKE ALL ON FUNCTION public.process_provider_saved_digest() FROM PUBLIC, anon, authenticated;

-- ── 4. daily ───────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'provider-saved-digest',
  '0 18 * * *',
  'SELECT public.process_provider_saved_digest();'
);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261020150000', 'provider_saved_digest')
ON CONFLICT (version) DO NOTHING;

COMMIT;
