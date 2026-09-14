-- The 90-day service-type cooldown predates plural service types, so it guards
-- a column that is no longer the only way to change a provider's type. Two
-- separate holes open the moment 20260908002113 adds service_categories, and
-- both are about trigger firing order rather than about either migration being
-- wrong on its own.
--
-- 1. THE GUARD IS BYPASSABLE.
--    Postgres fires BEFORE ROW triggers in alphabetical order by trigger name:
--      providers_service_category_cooldown      (p) -- the guard
--      trg_sync_provider_service_categories     (t) -- mirrors set -> headline
--    An UPDATE that touches only service_categories therefore reaches the guard
--    while new.service_category still equals old.service_category. The guard
--    sees no change, waves it through and re-pins the stamp from OLD — and only
--    afterwards does the sync trigger rewrite the headline from the new set.
--    Net effect: the headline moves, the stamp does not, and the cooldown can be
--    reset at will by writing the array instead of the scalar. Renaming a
--    trigger to reorder them would fix this by side effect and break again the
--    next time either is renamed; compare both columns instead.
--
-- 2. THE CASCADE IS SKIPPED.
--    `AFTER UPDATE OF service_category` fires on the columns NAMED in the
--    statement's SET list, not on whether the value actually changed. An UPDATE
--    that writes only service_categories never names service_category, so the
--    cascade does not fire at all — even though the sync trigger just changed
--    the headline. A HAIR -> NAILS provider would keep every portfolio photo
--    filed under Hair, which is the exact thing the cascade exists to prevent.
--
-- Both are fixed here rather than in 20260908002113 because that migration's
-- own definitions are correct in isolation; it is the combination that leaks.

-- ── 1. Guard on the set as well as the headline ─────────────────────────────
create or replace function public.enforce_service_category_change_cooldown()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  headline_changed boolean;
  set_changed      boolean;
begin
  headline_changed := new.service_category is distinct from old.service_category;
  set_changed      := coalesce(new.service_categories, '{}')
                        is distinct from coalesce(old.service_categories, '{}');

  -- Any change to the set counts, not only one that moves the headline. Adding
  -- a type is deliberately treated the same as switching one: the set decides
  -- which category listings a business appears in, which is what the 90 days
  -- are protecting. Being stricter than necessary here is safe; being laxer is
  -- the bypass described above.
  if headline_changed or set_changed then
    if old.service_category_changed_at is not null
       and old.service_category_changed_at > now() - interval '90 days' then
      -- P0001, for the reason 20260907000413 spells out: the app only shows a
      -- DB message to the user verbatim on P0001.
      raise exception
        'You changed your service type on %. You can change it again on %.',
        to_char(old.service_category_changed_at, 'DD Mon YYYY'),
        to_char(old.service_category_changed_at + interval '90 days', 'DD Mon YYYY');
    end if;
    new.service_category_changed_at := now();

    -- custom_service_type only ever existed to qualify OTHER, which is now
    -- retired in the app (see SERVICE_TYPE_OPTS). Keyed off the whole set, not
    -- just the headline, so a provider who keeps OTHER as a secondary type
    -- keeps their label.
    if not ('OTHER' = any (coalesce(new.service_categories,
                                    array[new.service_category]))) then
      new.custom_service_type := null;
    end if;
  else
    -- The stamp is the trigger's alone: a caller including it in an UPDATE
    -- payload (or clearing it) must never move the cooldown window.
    new.service_category_changed_at := old.service_category_changed_at;
  end if;
  return new;
end;
$$;

-- ── 2. Cascade on either column being written ───────────────────────────────
-- Widening the columns that arm the trigger is not enough on its own, and is
-- actively destructive without this: `after update of a, b` fires on the SET
-- list, so simply ADDING a secondary type would now run a cascade whose body
-- unconditionally DELETEs every provider_specialties row. A provider gaining a
-- type would silently lose the specialties of the type they already had.
--
-- So the body gains the check the narrow trigger got for free from its own
-- arming condition: do nothing unless the HEADLINE actually moved. The set
-- changing is what must arm it (that is hole 2); the headline changing is what
-- must make it act.
create or replace function public.cascade_service_category_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.service_category is not distinct from old.service_category then
    return null;
  end if;

  -- Portfolio photos are stamped with the provider's headline category at
  -- upload (there has never been a per-photo picker — see addPortfolioItem).
  -- Re-stamp only the rows still carrying the OLD headline, so a photo
  -- deliberately filed under a different category keeps it. Without this a
  -- HAIR provider who moves to NAILS keeps every photo in Explore's Hair tab.
  update public.portfolio_items
     set category = new.service_category
   where provider_id = new.id
     and category is not distinct from old.service_category;

  -- Specialties are drawn from a per-category pool (SPECIALTIES_MAP), so the
  -- old set is not merely stale, it is unreachable: no chip in the new pool
  -- can render or clear it. Dropping the rows is what makes the provider
  -- re-pick from the pool that now applies.
  delete from public.provider_specialties
   where provider_id = new.id;

  return null;
end;
$$;

drop trigger if exists providers_service_category_cascade on public.providers;
create trigger providers_service_category_cascade
  after update of service_category, service_categories on public.providers
  for each row
  execute function public.cascade_service_category_change();
