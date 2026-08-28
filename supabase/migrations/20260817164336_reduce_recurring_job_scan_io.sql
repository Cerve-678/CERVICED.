-- Partial indexes for the recurring cron jobs' hot predicates. These jobs run
-- on a schedule against tables that keep growing, so without them each tick
-- degrades into a sequential scan. Every index is partial (WHERE ...) so it
-- stays small: it covers only the rows a job is actually looking for, not the
-- whole table. See the auto-memory note cron-reminder-jobs-planning-cost —
-- rank this work by total_exec_time, not shared_blks.
create index if not exists idx_bookings_on_hold_expiry
  on public.bookings (hold_expires_at)
  where status = 'on_hold' and hold_expires_at is not null;

create index if not exists idx_bookings_pending_created_at
  on public.bookings (created_at)
  where status = 'pending';

create index if not exists idx_notifications_booking_user_type_created
  on public.notifications (booking_id, user_id, type, created_at desc)
  where booking_id is not null;

create index if not exists idx_notifications_provider_message_dedupe
  on public.notifications (
    provider_id,
    user_id,
    (metadata ->> 'conversation_id'),
    created_at desc
  )
  where type = 'provider_message';

create index if not exists idx_provider_conversations_unread_updated
  on public.provider_conversations (updated_at)
  where unread_count_provider > 0;

create index if not exists idx_provider_scrape_jobs_pending
  on public.provider_scrape_jobs (status)
  where status in ('pending', 'running');

create index if not exists idx_promotions_pending_notification
  on public.promotions (scheduled_notify_at)
  where notify_sent_at is null
    and is_active = true
    and scheduled_notify_at is not null;
