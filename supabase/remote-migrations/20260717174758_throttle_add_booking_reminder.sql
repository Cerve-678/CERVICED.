-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260717174758
-- Remote name: throttle_add_booking_reminder
-- Do not edit this recovery archive; create a new tracked migration for changes.

create or replace function public.throttle_reminder_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reminder_types text[] := array[
    'booking_pending','provider_message','balance_reminder',
    'reschedule_request','intake_form_reminder','booking_not_started',
    'booking_reminder'
  ];
  v_item_key  text;
  v_prior     int;
  v_last      timestamptz;
  v_required  interval;
  v_daily_cap constant int := 10;
  v_item_cap  constant int := 3;
begin
  if not (NEW.type = any(reminder_types)) then
    return NEW;
  end if;

  if (select count(*) from public.notifications n
        where n.user_id = NEW.user_id
          and n.type = any(reminder_types)
          and n.created_at > now() - interval '24 hours') >= v_daily_cap then
    return null;
  end if;

  v_item_key := coalesce(NEW.booking_id::text, NEW.metadata->>'conversation_id', NEW.provider_id::text, '');

  select count(*), max(n.created_at)
    into v_prior, v_last
    from public.notifications n
   where n.user_id = NEW.user_id
     and n.type    = NEW.type
     and coalesce(n.booking_id::text, n.metadata->>'conversation_id', n.provider_id::text, '') = v_item_key;

  if v_prior >= v_item_cap then
    return null;
  end if;

  v_required := case v_prior when 0 then interval '0' when 1 then interval '6 hours' else interval '24 hours' end;
  if v_last is not null and v_last > now() - v_required then
    return null;
  end if;

  return NEW;
end;
$$;
