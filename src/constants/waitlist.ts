/**
 * How long a waitlist hold reserves a freed slot for the client it was
 * offered to.
 *
 * The authority is the DATABASE — public.waitlist_hold_duration(), which
 * offer_waitlist_slot() uses to stamp bookings.hold_expires_at and to build
 * the wording of the "held for you for N minutes" notification (see
 * supabase/migrations/20261112100000_waitlist_pays_at_confirm.sql).
 * Nothing here enforces anything; this exists so the app can DISPLAY the
 * window without a second copy of the number appearing in a screen.
 *
 * It once lived as a bare `3 * 60 * 60 * 1000` in a screen's JSX, which is how
 * it survived unnoticed when the hold went from 3 hours to 15 minutes. Read by
 * WaitlistHoldCountdown for the share of the hold left. If the DB function
 * changes again, change this to match.
 */
export const WAITLIST_HOLD_MINUTES = 15;
