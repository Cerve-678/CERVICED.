-- ============================================================
-- cron_reminder_frequency_trim.sql
--
-- The 12 process_* reminder jobs cost ~1,595s of CPU over 43 days — more
-- than any other workload on the database, including Realtime.
--
-- The cost is NOT slow queries. EXPLAIN on the heaviest one shows:
--     Execution Time: 0.129 ms
--     Planning Time: 99.656 ms   (949 buffer hits)
-- The indexes are already correct and the queries return 0 rows almost
-- every tick. The cost is plpgsql re-planning its statements on each call
-- against a large catalog. You cannot index that away — the only lever is
-- calling these functions less often.
--
-- Every one of these functions has an internal dedup window (2-4h
-- NOT EXISTS guards on notifications). Ticking slower therefore cannot
-- double-send; it only delays a nudge by minutes.
--
-- NOT changed (deliberately):
--   jobid 147 expire-cart-holds  (*/5) — checkout slot-hold backstop; the
--     10-minute hold TTL depends on this cadence. Leave it alone.
--   jobid 146 expire-waitlist-holds (*/15) — same class of user-facing TTL.
--
-- Minute offsets are staggered so the jobs don't all fire on the same tick.
-- ============================================================

-- Provider reminder nudges: every 30m -> every 2h.
SELECT cron.alter_job(1, schedule => '13 */2 * * *');  -- unaccepted booking
SELECT cron.alter_job(2, schedule => '23 */2 * * *');  -- not started
SELECT cron.alter_job(4, schedule => '33 */2 * * *');  -- unread message
SELECT cron.alter_job(6, schedule => '43 */2 * * *');  -- unpaid deposit
SELECT cron.alter_job(7, schedule => '53 */2 * * *');  -- stale reschedule

-- Scheduled promotions (jobid 64) is deliberately NOT touched here, despite
-- being the single most expensive job (300s / 3,534 calls).
--
-- Note for whoever picks this up: promotions are currently disabled app-wide
-- via OFFERS_ENABLED in src/constants/featureFlags.ts (since 2026-08-09), and
-- live data shows 0 promotions created and 0 promo notifications sent since.
-- The job is polling for work that cannot be created. Pausing it outright
-- would recover the full 300s with no user-visible effect — but it would then
-- have to be reactivated in the same change that flips OFFERS_ENABLED back on,
-- or scheduled promotions will silently never notify.
--
-- Left running deliberately, pending that call.
-- See FUTURE_LOGIC.md, "Scheduled promotion notification cadence".

-- Background queues: every 5m -> every 15m.
SELECT cron.alter_job(151, schedule => '*/15 * * * *');      -- scrape jobs
SELECT cron.alter_job(152, schedule => '4,19,34,49 * * * *'); -- announcements

-- ============================================================
-- DONE — cron_reminder_frequency_trim.sql applied.
-- Expected: ~21k fewer calls per 43 days, roughly 40-45% off the
-- ~1,595s reminder-job CPU total. (Would be 55-60% with promotions
-- included; that job is deferred — see FUTURE_LOGIC.md.)
-- ============================================================
