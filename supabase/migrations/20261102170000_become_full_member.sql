-- A link-only provider (booking_mode 'external') becomes a full member: CERVICED
-- takes their bookings from now on. Product decisions (2026-11-02):
--
--  - It happens at once and is one way. There is no switch back in the app.
--  - Their booking link goes, from both places it lives: providers (the Book
--    button) and users (the sign-up answer that send-account-email and
--    send-link-only-email read to decide whether someone is link-only).
--  - They come off Search until they pass the full go-live gate. Nothing here
--    does that by hand: the booking_mode change fires
--    on_provider_about_or_mode_change, which re-runs check_and_set_provider_live
--    on the CERVICED branch (hours, a service, private address, policies, logo).
--  - The app shows £25.99 a month with two months free, but nothing is charged.
--    full_member_since records the switch so whatever billing comes later
--    knows when it happened.

alter table public.providers
  add column if not exists full_member_since timestamptz;

comment on column public.providers.full_member_since is
  'When a link-only provider switched to CERVICED bookings via become_full_member(). Null for providers who started on CERVICED bookings.';

create or replace function public.become_full_member()
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_provider_id uuid;
  v_mode text;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;

  -- The same row getProviderOwnershipForUserId() resolves for this account.
  select id, booking_mode into v_provider_id, v_mode
  from public.providers
  where user_id = v_uid
  order by is_active desc, created_at asc
  limit 1
  for update;

  if v_provider_id is null then
    raise exception 'Save your profile first.' using errcode = 'P0001';
  end if;
  if v_mode <> 'external' then
    raise exception 'You already take bookings through CERVICED.' using errcode = 'P0001';
  end if;

  update public.providers
  set booking_mode = 'cerviced',
      external_booking_url = null,
      full_member_since = now()
  where id = v_provider_id;

  update public.users
  set external_booking_url = null
  where id = v_uid;
end;
$function$;

revoke all on function public.become_full_member() from public, anon;
grant execute on function public.become_full_member() to authenticated;
