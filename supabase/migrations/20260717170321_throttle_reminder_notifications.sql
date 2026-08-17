create or replace function public.throttle_reminder_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reminder_types text[] := array[
    'booking_pending','provider_message','balance_reminder',
    'reschedule_request','intake_form_reminder','booking_not_started'
  ];
  v_item_key  text;
  v_prior     int;
  v_last      timestamptz;
  v_required  interval;
  v_daily_cap constant int := 10;
  v_item_cap  constant int := 3;
begin
  -- Only govern recurring reminder types; event notifications pass straight through.
  if not (NEW.type = any(reminder_types)) then
    return NEW;
  end if;

  -- Per-recipient daily ceiling across all reminder types.
  if (select count(*) from public.notifications n
        where n.user_id = NEW.user_id
          and n.type = any(reminder_types)
          and n.created_at > now() - interval '24 hours') >= v_daily_cap then
    return null;
  end if;

  -- Identify the item this reminder is about so we can count repeats.
  v_item_key := coalesce(NEW.booking_id::text, NEW.metadata->>'conversation_id', NEW.provider_id::text, '');

  select count(*), max(n.created_at)
    into v_prior, v_last
    from public.notifications n
   where n.user_id = NEW.user_id
     and n.type    = NEW.type
     and coalesce(n.booking_id::text, n.metadata->>'conversation_id', n.provider_id::text, '') = v_item_key;

  -- Hard cap: never more than v_item_cap nudges about the same item.
  if v_prior >= v_item_cap then
    return null;
  end if;

  -- Escalating backoff between nudges: 1st immediate, 2nd after 6h, 3rd after 24h.
  v_required := case v_prior when 0 then interval '0' when 1 then interval '6 hours' else interval '24 hours' end;
  if v_last is not null and v_last > now() - v_required then
    return null;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_throttle_reminders on public.notifications;
create trigger trg_throttle_reminders
  before insert on public.notifications
  for each row execute function public.throttle_reminder_notifications();;
