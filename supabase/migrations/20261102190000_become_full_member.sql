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
--    The free months start the day they go live again (product owner,
--    2026-11-02), so two stamps: full_member_since when they switch, and
--    full_member_free_from the first time they're live after it. Whatever
--    billing comes later reads those.

alter table public.providers
  add column if not exists full_member_since timestamptz,
  add column if not exists full_member_free_from timestamptz;

comment on column public.providers.full_member_since is
  'When a link-only provider switched to CERVICED bookings via become_full_member(). Null for providers who started on CERVICED bookings.';
comment on column public.providers.full_member_free_from is
  'The first time a full member (full_member_since set) went live after switching. Their free months count from here. Set once by stamp_full_member_free_from.';

-- BEFORE, so the stamp rides on the gate's own UPDATE instead of a second one.
create or replace function public.stamp_full_member_free_from()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  new.full_member_free_from := now();
  return new;
end;
$function$;

revoke execute on function public.stamp_full_member_free_from() from public, anon, authenticated;

drop trigger if exists stamp_full_member_free_from on public.providers;
create trigger stamp_full_member_free_from
  before update of has_gone_live on public.providers
  for each row
  when (new.has_gone_live and not coalesce(old.has_gone_live, false)
        and new.full_member_since is not null
        and new.full_member_free_from is null)
  execute function public.stamp_full_member_free_from();

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

  -- Already passing the full gate (rare: everything set up while link-only)
  -- means still live, so the trigger above never sees a go-live. Start the
  -- free months now.
  update public.providers
  set full_member_free_from = now()
  where id = v_provider_id and has_gone_live and full_member_free_from is null;

  update public.users
  set external_booking_url = null
  where id = v_uid;
end;
$function$;

revoke all on function public.become_full_member() from public, anon;
grant execute on function public.become_full_member() to authenticated;
