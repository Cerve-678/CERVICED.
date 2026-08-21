-- A provider's public business name (providers.display_name) may be changed,
-- but not again for 14 days. Enforced here rather than in the app: the app is
-- not the policy engine, and two screens (InfoRegScreen's save and
-- BusinessInfoScreen) both write this column.
--
-- display_name_changed_at is NULL for every existing provider, which
-- deliberately gives everyone exactly one free change from today.

alter table public.providers
  add column if not exists display_name_changed_at timestamptz;

comment on column public.providers.display_name_changed_at is
  'When display_name was last changed. Set only by enforce_display_name_change_cooldown(); a client cannot write it. NULL = never changed since the cooldown shipped.';

create or replace function public.enforce_display_name_change_cooldown()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.display_name is distinct from old.display_name then
    if old.display_name_changed_at is not null
       and old.display_name_changed_at > now() - interval '14 days' then
      raise exception
        'You changed your business name on %. You can change it again on %.',
        to_char(old.display_name_changed_at, 'DD Mon YYYY'),
        to_char(old.display_name_changed_at + interval '14 days', 'DD Mon YYYY')
        using errcode = 'check_violation';
    end if;
    new.display_name_changed_at := now();
  else
    -- The stamp is the trigger's alone: a caller including it in an UPDATE
    -- payload (or clearing it) must never move the cooldown window.
    new.display_name_changed_at := old.display_name_changed_at;
  end if;
  return new;
end;
$$;

drop trigger if exists providers_display_name_cooldown on public.providers;
create trigger providers_display_name_cooldown
  before update of display_name on public.providers
  for each row
  execute function public.enforce_display_name_change_cooldown();
