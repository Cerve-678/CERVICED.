-- Saving a new info pack sends it to matching upcoming clients only when the
-- provider asks for that.
--
-- Until now the AFTER INSERT trigger `on_info_pack_created` ran
-- handle_new_info_pack() on every insert, which attaches the pack to every
-- matching upcoming booking and notifies each client. The redesigned Info
-- Packs screen gives the provider a "Send to N upcoming clients now" toggle
-- instead; with it off, only bookings made from now on get the pack (through
-- the separate on_booking_attach_info_packs trigger, which is unchanged).
--
-- How: a column the insert sets, and a WHEN clause on the trigger. The
-- function body is NOT redefined, so there is no risk of CREATE OR REPLACE
-- reverting a newer live definition of handle_new_info_pack().
--
-- Older app builds don't send the column, so it defaults to TRUE and they keep
-- today's behaviour exactly. Only the new screen ever writes FALSE.
--
-- The column only means something at insert time. Editing a pack (UPDATE)
-- never re-sends: clients who already have a pack keep their copy in
-- booking_info_packs, by product decision (2026-11-05).

-- Guard: the trigger and function this migration depends on must exist live.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'on_info_pack_created'
       AND tgrelid = 'public.info_packs'::regclass
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'on_info_pack_created is missing on public.info_packs; check live before applying';
  END IF;
  IF to_regprocedure('public.handle_new_info_pack()') IS NULL THEN
    RAISE EXCEPTION 'public.handle_new_info_pack() is missing; check live before applying';
  END IF;
END $$;

ALTER TABLE public.info_packs
  ADD COLUMN IF NOT EXISTS send_to_upcoming BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.info_packs.send_to_upcoming IS
  'Read only by the on_info_pack_created trigger at insert: TRUE sends the new pack to matching upcoming bookings now (and notifies those clients); FALSE leaves them alone so only bookings made afterwards get it. Defaults TRUE so older app builds keep their behaviour.';

DROP TRIGGER IF EXISTS on_info_pack_created ON public.info_packs;
CREATE TRIGGER on_info_pack_created
  AFTER INSERT ON public.info_packs
  FOR EACH ROW
  WHEN (NEW.send_to_upcoming)
  EXECUTE FUNCTION public.handle_new_info_pack();
