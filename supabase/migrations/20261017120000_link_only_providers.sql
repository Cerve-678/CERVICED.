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
-- 7. get_my_provider_saver_count() + send_announcement_to_my_savers() — the
--    clients who saved (bookmarked) the calling provider. bookmarks RLS is
--    own-rows-only, so this has to be server-side; the audience is resolved
--    in the database and never sent to the provider's device.
-- 8. A provider can't switch to link-only while CERVICED bookings of theirs
--    are still pending or upcoming.
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
  check (booking_mode <> 'external' or external_booking_url ~* '^https?://[^[:space:]]+\.[^[:space:]]+');

-- ── 2. go-live gate ────────────────────────────────────────────────────────
create or replace function public.check_and_set_provider_live(p_provider_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_mode text;
  v_live boolean;
begin
  select booking_mode into v_mode from public.providers where id = p_provider_id;

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
  -- About only gates link-only providers. Re-running the CERVICED gate on a
  -- full provider's About edit could unlist one published under older rules.
  when ((new.booking_mode = 'external' and new.about_text is distinct from old.about_text)
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
    and booking_date between current_date - 365 and current_date + 730
    and exists (
      select 1 from public.providers p
      where p.id = provider_id
        and p.booking_mode = 'external'
        and p.has_gone_live = true
        and p.is_active = true
    )
    and (
      select count(*) from public.client_external_bookings mine
      where mine.client_id = auth.uid()
    ) < 500
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

-- One row per viewer, provider, day and kind: each person counts once a day
-- per counter, so re-renders, re-sorts and a determined tapper can't inflate
-- anyone's numbers. Rows older than 2 days serve no purpose and can be
-- pruned (left to a later cleanup job; at most ~200 rows per viewer per day).
create table if not exists public.provider_stat_viewers (
  viewer_id   uuid not null references auth.users(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  day         date not null,
  kind        text not null,
  primary key (viewer_id, provider_id, day, kind)
);
alter table public.provider_stat_viewers enable row level security;
revoke all on public.provider_stat_viewers from anon, authenticated;

-- Counts one event for each live provider in p_provider_ids (a search page
-- passes all its results at once) — at most once per viewer per provider per
-- day per kind. The caller's own provider is skipped so a professional can't
-- inflate their own numbers by browsing themselves.
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

  with first_today as (
    insert into public.provider_stat_viewers (viewer_id, provider_id, day, kind)
    select v_uid, p.id, v_day, p_kind
    from public.providers p
    where p.id = any (p_provider_ids)
      and p.has_gone_live = true
      and p.is_active = true
      and p.user_id is distinct from v_uid
    order by p.id
    on conflict do nothing
    returning provider_id
  )
  insert into public.provider_daily_stats as s
    (provider_id, day, profile_views, book_taps, search_appearances, instagram_taps)
  select f.provider_id, v_day,
         (p_kind = 'profile_view')::int,
         (p_kind = 'book_tap')::int,
         (p_kind = 'search_appearance')::int,
         (p_kind = 'instagram_tap')::int
  from first_today f
  -- A fixed order, so two searches touching the same providers can't
  -- deadlock on each other's rows.
  order by f.provider_id
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
create or replace function public.get_my_provider_saver_count()
 returns integer
 language sql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select count(distinct b.user_id)::int
  from public.bookmarks b
  join public.providers p on p.id = b.provider_id
  where p.user_id = auth.uid()
    and b.user_id <> auth.uid();
$function$;

-- A link-only provider's announcement, to the clients who saved them. The
-- audience never leaves the database; send_provider_client_notifications
-- re-checks every recipient's relationship to the caller.
create or replace function public.send_announcement_to_my_savers(p_title text, p_message text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_provider record;
  v_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if btrim(coalesce(p_title, '')) = '' or btrim(coalesce(p_message, '')) = '' then
    raise exception 'An announcement needs a title and a message.' using errcode = 'P0001';
  end if;
  if char_length(p_title) > 60 or char_length(p_message) > 400 then
    raise exception 'That announcement is too long.' using errcode = 'P0001';
  end if;

  select id, display_name, booking_mode, has_gone_live into v_provider
  from public.providers
  where user_id = auth.uid()
  order by is_active desc, created_at asc
  limit 1;
  if not found then
    raise exception 'Provider profile not found' using errcode = 'P0001';
  end if;
  if v_provider.booking_mode <> 'external' then
    raise exception 'Announcements to savers are for link-only professionals.' using errcode = 'P0001';
  end if;
  if not v_provider.has_gone_live then
    raise exception 'Go live first — clients can only save you once you are.' using errcode = 'P0001';
  end if;

  select array_agg(distinct b.user_id) into v_ids
  from public.bookmarks b
  where b.provider_id = v_provider.id
    and b.user_id <> auth.uid();
  if v_ids is null then
    return 0;
  end if;

  return public.send_provider_client_notifications(
    v_ids,
    'announcement',
    coalesce(nullif(btrim(v_provider.display_name), ''), 'Your provider') || ' — ' || btrim(p_title),
    btrim(p_message)
  );
end;
$function$;

revoke execute on function public.get_my_provider_saver_count() from public, anon;
grant execute on function public.get_my_provider_saver_count() to authenticated;
revoke execute on function public.send_announcement_to_my_savers(text, text) from public, anon;
grant execute on function public.send_announcement_to_my_savers(text, text) to authenticated;

-- ── 8. no switch to link-only with CERVICED bookings still to come ─────────
create or replace function public.guard_booking_mode_switch()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.booking_mode = 'external' and old.booking_mode = 'cerviced' and exists (
    select 1 from public.bookings b
    where b.provider_id = new.id
      and b.status in ('pending', 'confirmed', 'on_hold', 'in_progress')
      and b.booking_date >= current_date
  ) then
    raise exception 'You still have upcoming bookings through CERVICED. Finish or cancel them before switching to your own booking link.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_booking_mode_switch on public.providers;
create trigger guard_booking_mode_switch
  before update of booking_mode on public.providers
  for each row
  when (new.booking_mode is distinct from old.booking_mode)
  execute function public.guard_booking_mode_switch();

revoke execute on function public.guard_booking_mode_switch() from public, anon, authenticated;
