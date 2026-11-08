/**
 * How long the waiting side has to answer a reschedule: the provider for a
 * client's request, the client for times the provider offered. After this the
 * request expires and the booking stays as it was.
 *
 * The authority is the DATABASE: public.reschedule_reply_window(), which the
 * reschedule-request-expiry cron enforces and the "your turn" notifications
 * quote (supabase/migrations/20261109120000_reschedule_reply_45_minutes.sql).
 * This only lets screens say the same thing. If the DB function changes,
 * change this to match; src/tests/rescheduleReplyWindow.test.ts checks it.
 */
export const RESCHEDULE_REPLY_MINUTES = 45;

export const RESCHEDULE_REPLY_MS = RESCHEDULE_REPLY_MINUTES * 60 * 1000;
