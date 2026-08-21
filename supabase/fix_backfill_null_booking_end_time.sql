-- PROPOSED — NOT YET APPLIED to the live database.
-- Written by cerviced-booking-domain 2026-08-20 while auditing the domain
-- layer under both hats (BookingsScreen/ProviderHomeScreen etc. sit on top
-- of this). Review before running; nothing in this file has been executed.
--
-- ── Why ──────────────────────────────────────────────────────────────────
-- src/services/databaseService.ts's insertDirectBooking() used to accept
-- end_time as optional and every caller omitted it, so every booking
-- created through that path landed with bookings.end_time = NULL. It has
-- since been made a required field (see the function's own doc comment),
-- but that only fixes new rows — rows already written that way are
-- unaffected by an app-code change.
--
-- insertDirectBooking()'s only live caller is the provider "invite from
-- waitlist" flow (ProviderBookingHistoryScreen.tsx → handleConfirmInvite).
-- Every other booking-creation path already wrote end_time correctly at the
-- time it ran:
--   - prepare_checkout() / provider_create_manual_booking()  — see
--     supabase/migrations/20260817075902_safety_acknowledgement_checkout.sql,
--     both compute v_end_time from the service's duration_minutes before
--     inserting.
--   - The waitlist auto-accept INSERTs in
--     supabase/migrations/20260731232258_waitlist_automation_settings.sql
--     and 20260802152641_waitlist_holds.sql both take end_time as a
--     parameter (p_end_time) and always supply it.
-- So the NULL rows should be scoped to that one provider-invite flow. This
-- has NOT been confirmed against live data (no COUNT query has been run —
-- the Supabase MCP connection was unavailable during this audit). Run the
-- verification query below first; if it turns up NULL end_time rows from a
-- path not listed above, stop and re-scope this file before running the
-- UPDATEs.
--
--   SELECT count(*) FILTER (WHERE service_id IS NOT NULL)  AS with_service,
--          count(*) FILTER (WHERE service_id IS NULL)      AS without_service,
--          min(booking_date) AS oldest, max(booking_date) AS newest
--   FROM   public.bookings
--   WHERE  end_time IS NULL;
--
-- ── What a NULL end_time currently breaks ───────────────────────────────
-- Every read path already assumes a fallback for these rows rather than
-- crashing, but the fallbacks disagree with each other:
--   - get_provider_busy_spans() and the bookings_no_overlap trigger
--     (prevent_overlapping_bookings(), effective_end column) both COALESCE
--     to booking_time + 60 minutes — see
--     supabase/migrations/20260806171711_provider_busy_spans_rpc.sql and
--     20260802152337_prevent_overlapping_bookings_steps_0_2.sql.
--   - mapDbBookingToConfirmed() (src/services/bookingService.ts) instead
--     falls back to endTime = booking_time (i.e. zero length), which makes
--     `duration` render as an empty string everywhere it's shown, and used
--     to make src/utils/scheduleIssues.ts unable to detect a real clash
--     against one of these bookings (a zero-length block can never
--     overlap). scheduleIssues.ts now has its own multi-tier fallback
--     (endTime → duration string → the service's own length via
--     getServiceDurationsByIds → a last-resort assumed hour), and
--     ProviderHomeScreen/ProviderBookingDetailScreen now recover and
--     display the real length the same way — but that's a client-side
--     patch over the underlying NULL, not a fix to the data.
-- Net effect on a genuinely 30-minute or 90-minute service: the DB's own
-- overlap math (busy spans, the overlap constraint) is running on a wrong
-- assumed hour for these specific historical rows until backfilled, which
-- can produce either a false "unavailable" gap or a missed real clash.
--
-- ── What this file does ──────────────────────────────────────────────────
--   1. For a NULL end_time row with a service_id that still resolves to a
--      real services row, set end_time = booking_time + that service's
--      duration_minutes — the actual booked length.
--   2. For anything still NULL after that (no service_id, e.g. a fully
--      custom manual booking — or a service_id whose service has since
--      been deleted), fall back to +60 minutes. This does not change any
--      read path's behaviour for those specific rows — it materializes the
--      exact assumption get_provider_busy_spans()/effective_end already
--      silently make for them — but it does make a future service-length
--      change or service deletion stop being able to retroactively alter
--      what these particular historical bookings are treated as.
--   3. Nothing else. effective_end is NOT touched directly: bookings'
--      BEFORE INSERT OR UPDATE OF (..., end_time, ...) trigger
--      (prevent_overlapping_bookings()) recomputes it automatically as
--      part of the same UPDATE, so a separate statement would either be
--      redundant or (if done first) get immediately overwritten.
--
-- Idempotent / safe to re-run: every UPDATE is scoped to
-- WHERE end_time IS NULL, so a second run touches zero rows.

BEGIN;

-- Step 1: recover the real length wherever the service is still resolvable.
UPDATE public.bookings b
SET    end_time = b.booking_time + make_interval(mins => s.duration_minutes)
FROM   public.services s
WHERE  b.end_time IS NULL
  AND  b.service_id = s.id
  AND  s.duration_minutes IS NOT NULL
  AND  s.duration_minutes > 0;

-- Step 2: everything still NULL (no service_id, or the service is gone) —
-- the same +60min assumption every read path already makes for these rows.
UPDATE public.bookings
SET    end_time = booking_time + INTERVAL '60 minutes'
WHERE  end_time IS NULL;

COMMIT;

-- ── After running ────────────────────────────────────────────────────────
-- Re-run the verification query above — it should return 0 rows. Then
-- confirm bookings_no_overlap didn't reject anything (it fires on this
-- exact UPDATE, so a violation would abort the transaction with a real
-- error rather than silently corrupting data — but worth a deliberate
-- check that the COMMIT above actually succeeded end-to-end rather than
-- partially).
