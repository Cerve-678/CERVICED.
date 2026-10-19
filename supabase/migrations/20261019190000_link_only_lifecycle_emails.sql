-- Link-only lifecycle emails: "you're live" and the go-live reminder.
--
-- Frontier at authoring: 20261019170000 (max(version) in
-- supabase_migrations.schema_migrations, read live 2026-10-19).
-- NOT APPLIED. Written for the user to approve and apply; the edge function
-- send-link-only-email must be deployed first, or the first requests 404.
--
-- What this adds:
--   1. users.link_only_live_email_sent_at / link_only_reminder_sent_at — the
--      at-most-once markers. On users, not providers: the reminder is mostly
--      for accounts whose providers row doesn't exist yet (it's created on the
--      first Edit Profile save), and a link-only profile can go live, come
--      down (last photo deleted) and go live again — the marker stops a
--      second "you're live".
--   2. request_link_only_email(user, kind) — posts { userId, kind } to the
--      edge function with the vault service key, the same way
--      request_booking_confirmation_email() does. Returns false, and sends
--      nothing, when the key isn't there.
--   3. handle_provider_gone_live() — the live body (read 2026-10-19) plus:
--      a link-only profile going live for the first time requests 'live';
--      and the bookmarked-client notice no longer says "accepting bookings.
--      Tap to check their services" for a link-only profile, which has no
--      services list and takes no bookings here.
--   4. send_link_only_go_live_reminders() + a daily cron at 11:10 — one
--      reminder per account, 3 to 30 days after sign-up, while not live.
--      At most 50 a run.
--
-- Full providers are untouched: no gone-live email for them (not decided).

BEGIN;

-- ── 1. markers ─────────────────────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS link_only_live_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS link_only_reminder_sent_at   timestamptz;

-- A profile that was already live before this existed doesn't get a
-- "you're live" for something that happened earlier.
UPDATE public.users u
   SET link_only_live_email_sent_at = now()
  FROM public.providers p
 WHERE p.user_id = u.id
   AND p.booking_mode = 'external'
   AND p.has_gone_live = true
   AND u.link_only_live_email_sent_at IS NULL;

-- ── 2. request ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_link_only_email(p_user_id uuid, p_kind text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_key text;
begin
  if p_kind not in ('live', 'reminder') then
    return false;
  end if;

  select decrypted_secret into v_key
    from vault.decrypted_secrets
   where name = 'service_role_key'
   limit 1;

  if v_key is null or v_key = '' or v_key like '<%' then
    return false;
  end if;

  perform net.http_post(
    url     := 'https://ztrfpfvvejzaysrelmfm.supabase.co/functions/v1/send-link-only-email',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object('userId', p_user_id, 'kind', p_kind),
    timeout_milliseconds := 15000
  );
  return true;
end;
$function$;

REVOKE ALL ON FUNCTION public.request_link_only_email(uuid, text) FROM PUBLIC, anon, authenticated;

-- ── 3. gone-live trigger ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_provider_gone_live()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  BEGIN
    IF NEW.has_gone_live = TRUE AND (OLD.has_gone_live IS DISTINCT FROM TRUE) THEN
      INSERT INTO public.notifications
        (user_id, type, title, message, priority, is_actionable, provider_id, recipient_role)
      SELECT
        bm.user_id,
        'new_provider',
        COALESCE(NEW.display_name, 'A provider') || ' is now live!',
        -- Added: a link-only profile has no services and takes no bookings here.
        CASE WHEN NEW.booking_mode = 'external'
          THEN 'A provider you bookmarked is now on CERVICED. Tap to see their profile.'
          ELSE 'A provider you bookmarked is now accepting bookings. Tap to check their services.'
        END,
        'medium', TRUE, NEW.id, 'client'
      FROM public.bookmarks bm
      WHERE bm.provider_id = NEW.id;

      -- Added: the link-only "you're live" email, once per account.
      IF NEW.booking_mode = 'external'
         AND EXISTS (
           SELECT 1 FROM public.users u
            WHERE u.id = NEW.user_id AND u.link_only_live_email_sent_at IS NULL
         )
         AND public.request_link_only_email(NEW.user_id, 'live') THEN
        UPDATE public.users
           SET link_only_live_email_sent_at = now()
         WHERE id = NEW.user_id;
      END IF;
    END IF;
    RETURN NEW;
  END;
  $function$;

-- ── 4. daily reminder ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.send_link_only_go_live_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r record;
begin
  for r in
    select u.id
      from public.users u
      left join public.providers p on p.user_id = u.id
     where u.link_only_reminder_sent_at is null
       and u.deletion_requested_at is null
       and u.created_at <  now() - interval '3 days'
       and u.created_at >= now() - interval '30 days'
       -- Link-only: the providers row decides once it exists, else the link
       -- saved at sign-up (same rule as the edge functions).
       and (
         p.booking_mode = 'external'
         or (p.id is null and coalesce(btrim(u.external_booking_url), '') <> '')
       )
       and coalesce(p.has_gone_live, false) = false
     order by u.created_at
     limit 50
  loop
    if public.request_link_only_email(r.id, 'reminder') then
      update public.users
         set link_only_reminder_sent_at = now()
       where id = r.id;
    end if;
  end loop;
end;
$function$;

REVOKE ALL ON FUNCTION public.send_link_only_go_live_reminders() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'link-only-go-live-reminders',
  '10 11 * * *',
  'SELECT public.send_link_only_go_live_reminders();'
);

COMMIT;
