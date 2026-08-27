/**
 * How long a waitlist hold reserves a freed slot for the client it was
 * offered to.
 *
 * The authority is the DATABASE — public.waitlist_hold_duration(), which
 * invite_next_waitlist_entry() uses to stamp bookings.hold_expires_at and to
 * build the wording of the "held for you for N minutes" notification (see
 * supabase/migrations/20260827120519_waitlist_hold_fifteen_minutes.sql).
 * Nothing here enforces anything; this exists so the app can DISPLAY the
 * window without a second copy of the number appearing in a screen.
 *
 * It lived as a bare `3 * 60 * 60 * 1000` inside ProviderBookingHistoryScreen's
 * JSX, which is how it survived unnoticed when the hold went from 3 hours to
 * 15 minutes — a literal in a render tree is invisible to any search for the
 * thing it describes. If the DB function changes again, change this to match.
 */
export const WAITLIST_HOLD_MINUTES = 15;

export const WAITLIST_HOLD_MS = WAITLIST_HOLD_MINUTES * 60 * 1000;
