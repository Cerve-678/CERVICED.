-- services.is_pregnancy_safe defaulted to FALSE, and no screen anywhere in
-- the app ever lets a provider set this field (grep confirms
-- AddBookingScreen.tsx is the ONLY place it's referenced at all, read-only).
-- Every row's FALSE is therefore an unconfigured default, not a provider's
-- deliberate safety call — 25 of 28 active services were flagged, including
-- ones like "Skin Consultation" and a men's-only "Male ethicists" facial
-- category where a pregnancy warning is nonsensical, confirming this is
-- default noise rather than real input.
--
-- Effect on the app: AddBookingScreen.tsx's safetyRequired check
-- (patch_test_required OR is_pregnancy_safe === false) was showing/requiring
-- the safety acknowledgement toggle for nearly every service regardless of
-- whether the provider had actually flagged anything, since the false
-- default alone was enough to trigger it.
--
-- FIX: flip the default to TRUE (assume safe unless a provider explicitly
-- says otherwise — once a real UI exists for them to set this), and backfill
-- every existing FALSE row to TRUE since none represent genuine input.
-- patch_test_required is untouched: 3 services already have it TRUE, which
-- IS real signal (their default is also FALSE, but far fewer rows carry it,
-- and unlike is_pregnancy_safe a FALSE patch-test default is the correct
-- conservative starting point — "no test required" isn't a safety claim the
-- same way "safe in pregnancy" is).
--
-- Safe to re-run.

ALTER TABLE public.services ALTER COLUMN is_pregnancy_safe SET DEFAULT true;

UPDATE public.services
   SET is_pregnancy_safe = true
 WHERE is_pregnancy_safe = false;
