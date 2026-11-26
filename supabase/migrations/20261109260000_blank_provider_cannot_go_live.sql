-- A blank provider (Admin → Start a provider now) can't go live until an
-- admin has added its owner's details.
--
-- Until then its sign-in is a made-up address at pending.cerviced.co, so every
-- provider email (bookings, reminders) would be lost, and nobody but the admin
-- can sign in to it. The flag is auth.users.raw_app_meta_data.details_pending,
-- which only the service role can write (admin-create-account sets it on
-- start_blank_provider and clears it in add_details, which then calls this
-- function again so a profile that is otherwise ready goes live straight away).
--
-- Redefines check_and_set_provider_live from its live definition (md5
-- 2b0dd313d7e7be669dc1f743ed394e6d, checked below); the only change is the
-- v_pending lookup and the "not v_pending" term in both branches.
--
-- Numbered above live max 20261109240000 and above the unapplied
-- 20261109250000_release_time on feat/release-time (which doesn't touch this
-- function).

BEGIN;

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.check_and_set_provider_live(uuid)'::regprocedure))
     <> '2b0dd313d7e7be669dc1f743ed394e6d' THEN
    RAISE EXCEPTION 'check_and_set_provider_live changed since this migration was written; re-read it and redo the change';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.check_and_set_provider_live(p_provider_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_mode text;
  v_live boolean;
  v_pending boolean;
begin
  select booking_mode into v_mode from public.providers where id = p_provider_id;

  -- An admin-made blank account whose owner's details aren't in yet.
  select coalesce((au.raw_app_meta_data ->> 'details_pending')::boolean, false)
    into v_pending
  from public.providers p
  join auth.users au on au.id = p.user_id
  where p.id = p_provider_id;
  v_pending := coalesce(v_pending, false);

  if v_mode = 'external' then
    select
      btrim(coalesce(p.logo_url, '')) <> ''
      and btrim(coalesce(p.about_text, '')) <> ''
      and exists (
        select 1 from public.provider_availability a
        where a.provider_id = p_provider_id and a.is_closed = false
      )
      and exists (
        select 1 from public.portfolio_items pi
        where pi.provider_id = p_provider_id
      )
      and not v_pending
    into v_live
    from public.providers p
    where p.id = p_provider_id;

    -- Only write when it changes: the portfolio trigger runs this once per
    -- uploaded photo, and an unchanged UPDATE still rewrites the row.
    update public.providers
    set has_gone_live = v_live
    where id = p_provider_id and has_gone_live is distinct from v_live;
    return;
  end if;

  UPDATE public.providers p
  SET has_gone_live = (
    EXISTS (
      SELECT 1 FROM public.provider_availability a
      WHERE a.provider_id = p_provider_id AND a.is_closed = FALSE
    )
    AND EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.provider_id = p_provider_id
    )
    AND EXISTS (
      SELECT 1 FROM public.provider_private_details d
      WHERE d.provider_id = p_provider_id
        AND btrim(COALESCE(d.full_address, '')) <> ''
        AND d.latitude IS NOT NULL
        AND d.longitude IS NOT NULL
    )
    AND p.booking_policies ->> 'cancelNotice' IS NOT NULL
    AND COALESCE(
      p.booking_policies ->> 'depositMode' IN ('full_only', 'client_choice', 'deposit_required')
      OR p.booking_policies ->> 'depositRequired' = 'false'
      OR p.booking_policies ->> 'depositOnly' = 'true'
      OR p.booking_policies ->> 'depositRequired' = 'true',
      FALSE
    )
    AND btrim(COALESCE(p.logo_url, '')) <> ''
    AND NOT v_pending
  )
  WHERE p.id = p_provider_id;
END;
$function$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261109260000', 'blank_provider_cannot_go_live')
ON CONFLICT (version) DO NOTHING;

COMMIT;
