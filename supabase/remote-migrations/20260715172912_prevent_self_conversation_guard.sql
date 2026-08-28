-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260715172912
-- Remote name: prevent_self_conversation_guard
-- Do not edit this recovery archive; create a new tracked migration for changes.

create or replace function public.prevent_self_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.providers p
    where p.id = NEW.provider_id and p.user_id = NEW.user_id
  ) then
    raise exception 'self_conversation_not_allowed: a user cannot open a conversation with their own provider profile';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_prevent_self_conversation on public.provider_conversations;
create trigger trg_prevent_self_conversation
  before insert on public.provider_conversations
  for each row execute function public.prevent_self_conversation();
