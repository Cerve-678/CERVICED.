-- Companion to 20260821100444_remove_unverifiable_payment_and_not_started_reminders.
--
-- That migration stopped both reminders being produced. This one clears the
-- rows they already wrote — 57 of them live (34 'booking_not_started',
-- 23 'balance_reminder', newest 2026-08-21) — because each is a standing
-- claim about something the app cannot verify: whether a provider was
-- actually paid, and whether an appointment actually started. Leaving them
-- in provider inboxes would keep making the claim after the producer is gone.
--
-- Both values are DELIBERATELY left in the notifications type CHECK
-- constraint. Nothing produces them any more; the constraint is not the
-- enforcement point and tightening it buys nothing here.

DELETE FROM public.notifications
WHERE type IN ('balance_reminder', 'booking_not_started');
