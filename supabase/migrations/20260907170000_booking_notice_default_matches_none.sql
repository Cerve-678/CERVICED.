-- Every provider on the platform is running a 2-hour minimum booking notice
-- that nobody chose.
--
-- `providers.min_booking_notice_hrs` is live as `DEFAULT 2`, but no migration
-- in this repo ever set that. Both tracked definitions of the column --
-- supabase/scheduling_settings.sql and RUN_ALL_MIGRATIONS.sql -- declare it
-- `NOT NULL DEFAULT 0`, and the live column is additionally nullable. The 2
-- was applied out of band and is undocumented drift, not a recorded decision.
--
-- The app disagrees with it everywhere:
--   * SchedulingScreen seeds the control at '0', whose MIN_NOTICE_OPTS label
--     is "None";
--   * AvailabilityService.checkNoticeWindow reads `?? 0`;
--   * getProviderBookingRules reads `?? 0`.
-- So the app's own answer for "unset" is None, and only the database says 2.
--
-- Nothing writes the column at signup either. Its sole writer in the whole
-- codebase is SchedulingScreen's save handler, so a provider row is born on
-- this default and stays there until someone opens Business Profile ->
-- Scheduling and presses save. At the time of writing all 8 provider rows
-- (7 live) hold exactly 2 -- not one distinct value -- which is what an
-- untouched column default looks like, not eight independent choices.
--
-- The client-visible cost: earliestBookableStartMs floors every picker at
-- now + 2h, and enforce_booking_bookability rejects anything inside it. A
-- client looking at 6:20pm could not take an 8:00pm slot, because the floor
-- was 8:20pm. Out-of-hours request slots die on the same floor unless the
-- provider also enables allow_short_notice_requests, which none has. So the
-- last two hours of every working day quietly disappear for everyone.
--
-- This restores the tracked intent: unset means None. Nullability is left
-- alone deliberately -- `?? 0` and this default now agree, so tightening it
-- to NOT NULL would be a separate change with its own risk.

ALTER TABLE public.providers
  ALTER COLUMN min_booking_notice_hrs SET DEFAULT 0;

-- Backfill only rows still sitting exactly on the old default. A provider who
-- deliberately picked "2 hrs" is indistinguishable from one who never touched
-- it -- the column records the value, not who set it -- so this cannot tell
-- them apart. It is scoped to the old default's exact value so it can never
-- touch a 1/4/12/24 anyone did choose, and providers keep the control to set
-- 2 hrs again from Business Profile -> Scheduling.
UPDATE public.providers
   SET min_booking_notice_hrs = 0
 WHERE min_booking_notice_hrs = 2;

COMMENT ON COLUMN public.providers.min_booking_notice_hrs IS
  'Minimum hours of notice required to make a booking. 0 = None, which is '
  'what MIN_NOTICE_OPTS shows for an unset provider and what the app reads '
  'for a missing value. Only SchedulingScreen writes this.';
