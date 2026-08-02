-- ════════════════════════════════════════════════════════════════════════════
-- fix_stale_provider_message_announcement_misroute.sql
--
-- BUG (reported by a client, 2026-08-01 — "fresh provider account showing an
-- unrelated notification")
-- ─────────────────────────────────────────────────────────────────────────
-- databaseService.ts's sendAnnouncement() used to insert broadcast messages
-- as type='provider_message', recipient_role='provider' — wrong, since an
-- announcement is a provider talking TO their clients, not a message a
-- provider receives. This has already been fixed in current code (verified:
-- sendAnnouncement() now writes type='announcement', recipient_role='client').
--
-- But 3 rows written by the OLD, buggy version are still live. They're
-- clearly identifiable: title="aestheicsby N  — Closed", message="Closed
-- temp", created_at 2026-07-11 11:32:45 — one broadcast, sent to 3 different
-- client user_ids, all from provider b6f60c71-4df6-4822-a3b5-331af4554cce.
-- Confirmed live via a read-only SELECT (2026-08-01): exactly these 3 rows
-- match, nothing else in the whole table does. All 3 already have
-- is_read=true.
--
-- The smoking gun: each row's target_role is already 'user' (correct —
-- these were always meant for clients) while recipient_role is 'provider'
-- (wrong — this is the column NotificationsScreen.tsx's activeMode filter
-- actually uses to decide provider-tab vs client-tab). That mismatch is
-- exactly what caused this: any of these 3 users who later became a
-- provider (as one did today) sees this old client-directed message leak
-- into their PROVIDER notifications tab, looking like a stray, unrelated
-- announcement.
--
-- FIX: reclassify these rows to match what sendAnnouncement() writes today
-- (type='announcement', recipient_role='client'), aligning recipient_role
-- with the target_role they already correctly have. Not a delete — this is
-- legitimate content the 3 clients should still be able to see, just filed
-- under the right tab.
--
-- Safe to re-run — the WHERE clause only ever matches already-fixed-away
-- rows once run once (recipient_role will no longer be 'provider').
-- ════════════════════════════════════════════════════════════════════════════

-- STEP 1 — run this first and eyeball the output before running STEP 2.
-- Expect exactly 3 rows, all the same broadcast described above. If you see
-- anything else (different title/provider/date), stop and investigate before
-- proceeding — the fix below is scoped to match only what this returns today.
SELECT id, user_id, provider_id, type, recipient_role, target_role, title, message, is_read, created_at
FROM public.notifications
WHERE type = 'provider_message'
  AND recipient_role = 'provider'
  AND target_role = 'user'
  AND title ~ ' — '
  AND message NOT ILIKE '%unread message%'
ORDER BY created_at;

-- STEP 2 — only after confirming STEP 1's output looks right.
BEGIN;

UPDATE public.notifications
   SET type = 'announcement',
       recipient_role = 'client'
 WHERE type = 'provider_message'
   AND recipient_role = 'provider'
   AND target_role = 'user'
   AND title ~ ' — '
   AND message NOT ILIKE '%unread message%';

COMMIT;

-- VERIFY — expect 0 rows after STEP 2:
--   SELECT count(*) FROM public.notifications
--    WHERE type = 'provider_message' AND recipient_role = 'provider'
--      AND target_role = 'user' AND title ~ ' — ';
-- ════════════════════════════════════════════════════════════════════════════
