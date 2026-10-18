-- Link-only providers: professionals who take bookings on their own page
-- (Fresha, Treatwell, Acuity, ...) and use CERVICED to be found.
-- Product rules: docs/vault/Link-Only Providers.md.
--
-- 1. providers.booking_mode — a real column, never inferred from whether
--    external_booking_url happens to be filled in (full providers can list a
--    website link too). 'cerviced' = CERVICED takes the booking; 'external' =
--    the Book button opens the provider's own page.
-- 2. check_and_set_provider_live() branches on it. Link-only providers go live
--    on logo + About + opening hours + at least one portfolio photo. The
--    CERVICED branch is reproduced verbatim from the live definition.
-- 3. Triggers so the external gate re-runs when About, the mode, or the
--    portfolio changes (logo and hours already have triggers).
-- 4. bookings refuses a row for a link-only provider — the app never offers
--    the flow, and the DB makes sure of it.
-- 5. client_external_bookings — a client's own note of a booking they made on
--    the provider's site ("Did you book?"). CERVICED does not handle these;
--    only the client can see their rows.
-- 6. provider_daily_stats + two RPCs — per-day counters for the link-only
--    Analytics screen (Book taps, profile views, search appearances,
--    Instagram taps). One row per provider per day, never one per event.
-- 7. get_my_provider_saver_ids() — the clients who saved (bookmarked) the
--    calling provider. bookmarks RLS is own-rows-only, so a provider can't
--    read this directly; link-only Announcements go to exactly this audience
--    (send_provider_client_notifications already accepts a bookmark
--    relationship) and Analytics shows its count.
--
-- Frontier at authoring: 20261011102423.

-- ── 1. booking_mode ────────────────────────────────────────────────────────
alter table public.providers
  add column if not exists booking_mode text not null default 'cerviced';

alter table public.providers
  drop constraint if exists providers_booking_mode_check;
alter table public.providers
  add constraint providers_booking_mode_check
  check (booking_mode in ('cerviced', 'external'));

-- An external provider without a link would show a Book button to nowhere.
alter table public.providers
  drop constraint if exists providers_external_mode_needs_link;
alter table public.providers
  add constraint providers_external_mode_needs_link
  check (booking_mode <> 'external' or btrim(coalesce(external_booking_url, '')) <> '');

-- ── 2. go-live gate ────────────────────────────────────────────────────────
create or replace function public.check_and_set_provider_live(p_provider_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_mode text;
begin
  select booking_mode into v_mode from public.providers where id = p_provider_id;

  if v_mode = 'external' then
    update public.providers p
    set has_gone_live = (
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
    )
    where p.id = p_provider_id;
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
  )
  WHERE p.id = p_provider_id;
END;
$function$;

-- ── 3. re-run the gate when its new inputs change ─────────────────────────
create or replace function public.handle_provider_about_or_mode_change()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.check_and_set_provider_live(new.id);
  return new;
end;
$function$;

drop trigger if exists on_provider_about_or_mode_change on public.providers;
create trigger on_provider_about_or_mode_change
  after update of about_text, booking_mode on public.providers
  for each row
  when (new.about_text is distinct from old.about_text
        or new.booking_mode is distinct from old.booking_mode)
  execute function public.handle_provider_about_or_mode_change();

-- Portfolio only gates link-only providers, so skip the recheck for the rest
-- rather than re-evaluating a full provider's gate on every photo upload.
create or replace function public.handle_portfolio_change_for_go_live()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_provider_id uuid := coalesce(new.provider_id, old.provider_id);
begin
  if exists (
    select 1 from public.providers
    where id = v_provider_id and booking_mode = 'external'
  ) then
    perform public.check_and_set_provider_live(v_provider_id);
  end if;
  return null;
end;
$function$;

drop trigger if exists on_portfolio_change_for_go_live on public.portfolio_items;
create trigger on_portfolio_change_for_go_live
  after insert or delete on public.portfolio_items
  for each row
  execute function public.handle_portfolio_change_for_go_live();

-- ── 4. no CERVICED bookings for a link-only provider ──────────────────────
create or replace function public.refuse_booking_for_external_provider()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if exists (
    select 1 from public.providers
    where id = new.provider_id and booking_mode = 'external'
  ) then
    raise exception 'This professional takes bookings on their own booking page.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

drop trigger if exists refuse_booking_for_external_provider on public.bookings;
create trigger refuse_booking_for_external_provider
  before insert on public.bookings
  for each row
  execute function public.refuse_booking_for_external_provider();

-- ── 5. client_external_bookings ───────────────────────────────────────────
create table if not exists public.client_external_bookings (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider_id   uuid not null references public.providers(id) on delete cascade,
  booking_date  date not null,
  start_time    time not null,
  service_label text not null check (char_length(btrim(service_label)) between 1 and 80),
  created_at    timestamptz not null default now()
);

create index if not exists client_external_bookings_client_date_idx
  on public.client_external_bookings (client_id, booking_date);

alter table public.client_external_bookings enable row level security;

drop policy if exists client_external_bookings_select_own on public.client_external_bookings;
create policy client_external_bookings_select_own
  on public.client_external_bookings for select to authenticated
  using (client_id = auth.uid());

-- Only for a live link-only provider: this is the "Did you book?" entry,
-- not a general-purpose diary.
drop policy if exists client_external_bookings_insert_own on public.client_external_bookings;
create policy client_external_bookings_insert_own
  on public.client_external_bookings for insert to authenticated
  with check (
    client_id = auth.uid()
    and exists (
      select 1 from public.providers p
      where p.id = provider_id
        and p.booking_mode = 'external'
        and p.has_gone_live = true
        and p.is_active = true
    )
  );

-- Remove only. No UPDATE policy: entries can't be edited (product decision).
drop policy if exists client_external_bookings_delete_own on public.client_external_bookings;
create policy client_external_bookings_delete_own
  on public.client_external_bookings for delete to authenticated
  using (client_id = auth.uid());

revoke all on public.client_external_bookings from anon;
grant select, insert, delete on public.client_external_bookings to authenticated;

-- ── 6. provider_daily_stats ───────────────────────────────────────────────
create table if not exists public.provider_daily_stats (
  provider_id        uuid not null references public.providers(id) on delete cascade,
  day                date not null,
  profile_views      integer not null default 0,
  book_taps          integer not null default 0,
  search_appearances integer not null default 0,
  instagram_taps     integer not null default 0,
  primary key (provider_id, day)
);

-- No policies: reads and writes go through the two functions below only.
alter table public.provider_daily_stats enable row level security;
revoke all on public.provider_daily_stats from anon, authenticated;

-- Counts one event for each live provider in p_provider_ids (a search page
-- passes all its results at once). The caller's own provider is skipped so a
-- professional can't inflate their own numbers by browsing themselves.
create or replace function public.record_provider_stat(p_provider_ids uuid[], p_kind text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'Europe/London')::date;
begin
  if v_uid is null then
    return;
  end if;
  if p_kind not in ('profile_view', 'book_tap', 'search_appearance', 'instagram_tap') then
    raise exception 'Unknown stat kind: %', p_kind using errcode = '22023';
  end if;
  if p_provider_ids is null or cardinality(p_provider_ids) = 0 then
    return;
  end if;
  if cardinality(p_provider_ids) > 200 then
    raise exception 'Too many providers in one stat call' using errcode = '22023';
  end if;

  insert into public.provider_daily_stats as s
    (provider_id, day, profile_views, book_taps, search_appearances, instagram_taps)
  select p.id, v_day,
         (p_kind = 'profile_view')::int,
         (p_kind = 'book_tap')::int,
         (p_kind = 'search_appearance')::int,
         (p_kind = 'instagram_tap')::int
  from public.providers p
  where p.id = any (p_provider_ids)
    and p.has_gone_live = true
    and p.is_active = true
    and p.user_id <> v_uid
  on conflict (provider_id, day) do update set
    profile_views      = s.profile_views      + excluded.profile_views,
    book_taps          = s.book_taps          + excluded.book_taps,
    search_appearances = s.search_appearances + excluded.search_appearances,
    instagram_taps     = s.instagram_taps     + excluded.instagram_taps;
end;
$function$;

-- The calling provider's own counters for the last p_days days (UK dates),
-- one row per day that has any activity.
create or replace function public.get_my_provider_daily_stats(p_days integer)
 returns table (
   day date,
   profile_views integer,
   book_taps integer,
   search_appearances integer,
   instagram_taps integer
 )
 language sql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select s.day, s.profile_views, s.book_taps, s.search_appearances, s.instagram_taps
  from public.provider_daily_stats s
  join public.providers p on p.id = s.provider_id
  where p.user_id = auth.uid()
    and s.day > (now() at time zone 'Europe/London')::date - least(greatest(coalesce(p_days, 7), 1), 3650)
  order by s.day;
$function$;

revoke execute on function public.record_provider_stat(uuid[], text) from public, anon;
grant execute on function public.record_provider_stat(uuid[], text) to authenticated;
revoke execute on function public.get_my_provider_daily_stats(integer) from public, anon;
grant execute on function public.get_my_provider_daily_stats(integer) to authenticated;

-- Trigger functions are never called directly.
revoke execute on function public.handle_provider_about_or_mode_change() from public, anon, authenticated;
revoke execute on function public.handle_portfolio_change_for_go_live() from public, anon, authenticated;
revoke execute on function public.refuse_booking_for_external_provider() from public, anon, authenticated;

-- ── 7. who saved me ───────────────────────────────────────────────────────
create or replace function public.get_my_provider_saver_ids()
 returns setof uuid
 language sql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select distinct b.user_id
  from public.bookmarks b
  join public.providers p on p.id = b.provider_id
  where p.user_id = auth.uid()
    and b.user_id <> auth.uid()
  limit 5000;
$function$;

revoke execute on function public.get_my_provider_saver_ids() from public, anon;
grant execute on function public.get_my_provider_saver_ids() to authenticated;
