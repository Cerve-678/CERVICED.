-- bookings.notes is the CLIENT's own free-text note, and nothing else.
--
-- 20260825133014 already stripped the generated
-- "Health info: Allergies: … | Medical notes: …" line that checkout used to
-- prepend, and the writer itself came out of CartScreen.tsx on 2026-08-20.
-- Five more rows arrived carrying it on 2026-08-26 15:23–15:37 UTC, all from
-- one client, hours of testing apart. The source could not have written them:
-- every commit that day holds only the comment explaining the removal. They
-- came from an app build compiled before the fix and still installed on a
-- device — which is not a state a one-off UPDATE can clean up, because the
-- next checkout from that build writes another one.
--
-- So the cleanup is repeated here AND made permanent as a BEFORE INSERT OR
-- UPDATE guard. The app is not the enforcement point for this; an old bundle
-- is exactly the caller that never gets the fix.
--
-- The pattern requires the note to START with the generated header, so a
-- client whose own note happens to mention health keeps every word of it. A
-- note that was nothing but the generated line becomes NULL rather than '',
-- so "does this booking have a note" reads false the same way everywhere.

CREATE OR REPLACE FUNCTION public.strip_generated_health_prefix()
RETURNS TRIGGER
LANGUAGE plpgsql
-- No SECURITY DEFINER: this rewrites a column on the row being written and
-- needs no privilege the writer doesn't already have. search_path is pinned
-- regardless, per the 2026-08-20 hardening pass.
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.notes IS NOT NULL AND NEW.notes ~ '^Health info:' THEN
    NEW.notes := NULLIF(
      btrim(regexp_replace(NEW.notes, '^Health info:[^\n]*(\n|$)', '')),
      ''
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_booking_strip_generated_health_prefix ON public.bookings;
CREATE TRIGGER before_booking_strip_generated_health_prefix
  BEFORE INSERT OR UPDATE OF notes ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.strip_generated_health_prefix();

-- Same statement as 20260825133014, re-run for the rows written after it.
-- Safe to re-run: the anchored pattern no longer matches once stripped.
UPDATE bookings
SET notes = NULLIF(btrim(regexp_replace(notes, '^Health info:[^\n]*(\n|$)', '')), '')
WHERE notes ~ '^Health info:';
