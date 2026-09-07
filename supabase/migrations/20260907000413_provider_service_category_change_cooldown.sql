-- A provider's headline service type (providers.service_category) used to be
-- set once at sign-up and never again: InfoRegScreen rendered it as a locked
-- chip reading "contact support to change your service type", and no other
-- screen offered it at all. That is now a self-serve change in
-- BusinessInfoScreen, under a 90-day cooldown.
--
-- Enforced here rather than in the app, for the same reason the display_name
-- cooldown is: the app is not the policy engine, and RLS policy
-- providers_owner_all lets a provider UPDATE their own row directly.
--
-- DEPENDENCY, and it is load-bearing: this guards UPDATE, so it assumes a
-- provider cannot simply INSERT a second providers row for themselves and
-- leave the stamped one behind. That assumption is providers.user_id being
-- UNIQUE, which supabase/enforce_provider_user_id_unique.sql adds — a
-- hand-run file, not a migration, whose own step 1 is a duplicate check the
-- operator has to clear first. getProviderProfileForUserId's comment
-- ("duplicates have crept in during the account churn") reads like it was
-- never run. Confirm providers_user_id_key is live; until it is, the ceiling
-- on this bypass is that a second row would have to become the profile
-- clients actually see, and that resolver prefers the active, oldest row.
--
-- service_category_changed_at is NULL for every existing provider, which
-- deliberately gives everyone exactly one free change from today — the same
-- concession display_name_changed_at made on 2026-08-20.

alter table public.providers
  add column if not exists service_category_changed_at timestamptz;

comment on column public.providers.service_category_changed_at is
  'When service_category was last changed. Set only by enforce_service_category_change_cooldown(); a client cannot write it. NULL = never changed since the cooldown shipped.';

-- ── The guard ───────────────────────────────────────────────────────────────
-- Deliberately `before update` and NOT `before update of service_category`.
-- Scoping the trigger to the column would leave the stamp writable: a
-- provider could clear service_category_changed_at in one UPDATE (which would
-- not fire a column-scoped trigger) and change their category in the next,
-- resetting the cooldown at will. Firing on every UPDATE of the row means the
-- else-branch below re-pins the stamp from OLD no matter how it is reached.
create or replace function public.enforce_service_category_change_cooldown()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.service_category is distinct from old.service_category then
    if old.service_category_changed_at is not null
       and old.service_category_changed_at > now() - interval '90 days' then
      -- P0001 (plpgsql's default for RAISE EXCEPTION) on purpose, and NOT
      -- the check_violation the display_name cooldown uses. The app only
      -- passes a DB message through to the user verbatim on P0001 — see
      -- toUserMessageAllowingDbGuard — so raising check_violation is what
      -- makes the name cooldown's carefully worded date land on the provider
      -- as "Could not save your changes." A message written to be read is
      -- pointless in a code that guarantees it won't be.
      raise exception
        'You changed your service type on %. You can change it again on %.',
        to_char(old.service_category_changed_at, 'DD Mon YYYY'),
        to_char(old.service_category_changed_at + interval '90 days', 'DD Mon YYYY');
    end if;
    new.service_category_changed_at := now();

    -- The free-text name only exists to qualify OTHER. Leaving it behind on a
    -- move to a real category would keep rendering a stale label next to the
    -- new type.
    if new.service_category <> 'OTHER' then
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

drop trigger if exists providers_service_category_cooldown on public.providers;
create trigger providers_service_category_cooldown
  before update on public.providers
  for each row
  execute function public.enforce_service_category_change_cooldown();

-- ── The cascade ─────────────────────────────────────────────────────────────
-- Two other tables carry a copy of the headline category and would otherwise
-- keep describing the business the provider no longer runs.
create or replace function public.cascade_service_category_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
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
  after update of service_category on public.providers
  for each row
  when (old.service_category is distinct from new.service_category)
  execute function public.cascade_service_category_change();

revoke all on function public.enforce_service_category_change_cooldown() from anon;
revoke all on function public.cascade_service_category_change() from anon;
