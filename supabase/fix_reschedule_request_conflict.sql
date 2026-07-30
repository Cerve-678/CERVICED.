-- ============================================================
-- CERVICED — Fix: reschedule requests silently failing to save
-- Run this in the Supabase SQL editor. Safe to re-run.
--
-- Root cause: upsertRescheduleRequest() (src/services/databaseService.ts)
-- does .upsert({...}, { onConflict: 'booking_id' }), which requires a
-- UNIQUE or exclusion constraint on booking_id. booking_reschedule_requests
-- only ever had a plain (non-unique) index on that column, so every upsert
-- since the function was introduced (commit 416b2680, 2026-07-09) threw
-- Postgres error 42P10 ("no unique or exclusion constraint matching ON
-- CONFLICT specification"). The app swallowed the error
-- (.catch(() => {}) in BookingContext.tsx's requestReschedule), so clients
-- saw "Reschedule request sent!" while the provider never received anything
-- — nothing reached the booking_reschedule_requests table at all.
-- ============================================================

ALTER TABLE public.booking_reschedule_requests
  ADD CONSTRAINT booking_reschedule_requests_booking_id_key UNIQUE (booking_id);
