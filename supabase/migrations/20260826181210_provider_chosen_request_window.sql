-- How far before opening / after closing a provider will let clients ASK.
--
-- NOT a revert of out_of_hours_extension_mins, which 20260826181157 dropped.
-- That column was a single figure the app measured from a value it DERIVED —
-- the provider's earliest start and latest finish across the whole week — and
-- the derivation is what made it wrong: a 9-5 provider could not be asked for
-- 4am no matter what they set, because the ceiling came from hours describing
-- their NORMAL week. An emergency request is by definition not that.
--
-- These two columns are different in the three ways that mattered:
--
--   1. The provider states them. Nothing is inferred from their schedule.
--   2. They are measured from THAT DAY's own working hours, not from a
--      week-wide envelope — "two hours after I close" means after I close
--      today, not after the latest I ever close.
--   3. NULL means "any time", and it is the DEFAULT. A provider who never
--      touches this setting is asked for whatever the client needs, exactly
--      as they are today. Opting into out-of-hours requests must not quietly
--      come with a ceiling nobody chose.
--
-- Deliberately NOT enforced by enforce_booking_bookability(). This is a
-- display preference — how much of the day is worth showing a client — not a
-- safety rule. The provider approves or declines every request either way, so
-- the trigger has nothing to protect here, and putting it there would only
-- create a second place for the two to drift out of agreement.
--
-- A day the provider does not work at all (blocked date, closed override, or
-- a weekday with no hours) has no opening or closing time to measure from, so
-- these do not apply to it — the whole day is requestable under whichever
-- opt-in covers that day.
--
-- Safe to re-run.

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS request_window_before_mins integer,
  ADD COLUMN IF NOT EXISTS request_window_after_mins  integer;

DO $$
BEGIN
  ALTER TABLE public.providers
    ADD CONSTRAINT providers_request_window_before_mins_range
    CHECK (request_window_before_mins IS NULL OR request_window_before_mins BETWEEN 0 AND 1440);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.providers
    ADD CONSTRAINT providers_request_window_after_mins_range
    CHECK (request_window_after_mins IS NULL OR request_window_after_mins BETWEEN 0 AND 1440);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.providers.request_window_before_mins IS
  'How far BEFORE that day''s opening time a client may be offered an out-of-hours request slot. NULL = any time, and is the default. Display preference only — not enforced by enforce_booking_bookability(), since the provider approves every request regardless.';
COMMENT ON COLUMN public.providers.request_window_after_mins IS
  'How far AFTER that day''s closing time a client may be offered an out-of-hours request slot. NULL = any time, and is the default. Display preference only — see the before column.';
