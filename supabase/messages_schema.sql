-- ─────────────────────────────────────────────────────────────────────────────
-- BOOKING MESSAGES  (user ↔ provider real-time chat per booking)
-- Run this in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.booking_messages (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  sender_id    uuid not null references auth.users(id) on delete cascade,
  sender_role  text not null check (sender_role in ('customer', 'provider')),
  content      text not null,
  created_at   timestamptz not null default now()
);

-- Index for fast per-booking queries ordered by time
create index if not exists booking_messages_booking_id_created_at
  on public.booking_messages (booking_id, created_at asc);

-- Enable realtime
alter publication supabase_realtime add table public.booking_messages;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.booking_messages enable row level security;

-- Both the customer and the provider linked to the booking can read messages
create policy "booking participants can read messages"
  on public.booking_messages for select
  using (
    exists (
      select 1 from public.bookings b
      join public.providers p on p.id = b.provider_id
      where b.id = booking_messages.booking_id
        and (b.user_id = auth.uid() or p.user_id = auth.uid())
    )
  );

-- Only the authenticated sender can insert their own messages
create policy "participants can send messages"
  on public.booking_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      join public.providers p on p.id = b.provider_id
      where b.id = booking_messages.booking_id
        and (b.user_id = auth.uid() or p.user_id = auth.uid())
    )
  );
