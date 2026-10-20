-- Link-only Dashboard, design B: the three tiles that need counting across
-- other people's rows, which a provider can't read directly.
--
--   1. "Said they booked" — distinct clients who answered "Yes" to "Did you
--      book with X?" (client_external_bookings) in the last 7 UK days, and
--      the 7 before that for the trend. Only a count leaves the database:
--      never a name, date or service.
--   2. New saves this week — distinct clients who bookmarked the provider in
--      the last 7 UK days.
--   3. Most-saved photo — the provider's own portfolio item that appears in
--      the most clients' users.saved_portfolio lists. That list has no
--      timestamps, so this is an all-time count.
--
-- Read-only, scoped to the caller's own provider row (same lookup as
-- send_announcement_to_my_savers). Redefines nothing.
--
-- Numbered 20261019234000: above the applied frontier (20261019233000) and
-- below the two written-but-unapplied migrations on other branches
-- (20261019235500 listing claims, 20261020120000 returning-client points), so
-- applying this one first never pushes either of them below the frontier.

create index if not exists client_external_bookings_provider_created_idx
  on public.client_external_bookings (provider_id, created_at);

create index if not exists bookmarks_provider_created_idx
  on public.bookmarks (provider_id, created_at);

-- Lets the ?| filter below skip users who saved none of the provider's photos.
create index if not exists users_saved_portfolio_gin
  on public.users using gin (saved_portfolio);

create or replace function public.get_my_link_only_dashboard_extras()
 returns table (
   said_booked_week integer,
   said_booked_last_week integer,
   new_savers_week integer,
   top_photo_id uuid,
   top_photo_url text,
   top_photo_label text,
   top_photo_saves integer
 )
 language sql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  with me as (
    select p.id
    from public.providers p
    where p.user_id = auth.uid()
    order by p.is_active desc, p.created_at asc
    limit 1
  ),
  today as (
    select (now() at time zone 'Europe/London')::date as d
  ),
  booked as (
    select
      count(distinct e.client_id) filter (
        where (e.created_at at time zone 'Europe/London')::date > t.d - 7
      )::int as this_week,
      count(distinct e.client_id) filter (
        where (e.created_at at time zone 'Europe/London')::date <= t.d - 7
      )::int as last_week
    from public.client_external_bookings e
    cross join me
    cross join today t
    where e.provider_id = me.id
      and e.client_id <> auth.uid()
      and e.created_at >= ((t.d - 13)::timestamp at time zone 'Europe/London')
  ),
  savers as (
    select count(distinct b.user_id)::int as this_week
    from public.bookmarks b
    cross join me
    cross join today t
    where b.provider_id = me.id
      and b.user_id <> auth.uid()
      and b.created_at >= ((t.d - 6)::timestamp at time zone 'Europe/London')
  ),
  mine as (
    select pi.id::text as id
    from public.portfolio_items pi
    cross join me
    where pi.provider_id = me.id
  ),
  saves as (
    select elem as item_id, count(*)::int as n
    from public.users u
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(u.saved_portfolio) = 'array' then u.saved_portfolio else '[]'::jsonb end
    ) as elem
    where u.saved_portfolio ?| (select coalesce(array_agg(mine.id), '{}'::text[]) from mine)
      and u.id <> auth.uid()
      and elem in (select mine.id from mine)
    group by elem
  ),
  top as (
    select
      pi.id,
      pi.image_url,
      coalesce(nullif(btrim(pi.caption), ''), nullif(btrim(pi.category), '')) as label,
      s.n
    from saves s
    join public.portfolio_items pi on pi.id::text = s.item_id
    order by s.n desc, pi.id
    limit 1
  )
  select b.this_week, b.last_week, sv.this_week, tp.id, tp.image_url, tp.label, tp.n
  from booked b
  cross join savers sv
  left join top tp on true
  where exists (select 1 from me);
$function$;

revoke execute on function public.get_my_link_only_dashboard_extras() from public, anon;
grant execute on function public.get_my_link_only_dashboard_extras() to authenticated;
