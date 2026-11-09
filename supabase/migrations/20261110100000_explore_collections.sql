-- Explore collections (2026-11-10).
--
-- A client can sort the photos they've hearted in Explore into named,
-- coloured folders ("collections") shown at the top of Explore → Favourites.
--
-- Rules, enforced here rather than in the app:
--   * A collection belongs to one account and only that account can see,
--     change or delete it (RLS, owner only).
--   * Only a photo that is in the owner's Favourites (users.saved_portfolio)
--     can be put in a collection. Un-hearting a photo takes it out of every
--     collection, via the trigger on users below, so a folder can never hold
--     a photo that Favourites doesn't.
--   * Colours are the three pastels the design uses: pink, blue, green.
--   * Names are 1–40 characters; an account can have up to 50 collections.
--   * delete_client_profile() deletes them, alongside the saved list it
--     already clears. A full account deletion cascades from users.
--
-- delete_client_profile() is redefined from the live definition, guarded by
-- its md5; the only change is the one DELETE line for explore_collections.

BEGIN;

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.delete_client_profile()'::regprocedure))
     <> 'b2d7007abfbb242014fb874fb8ebde10' THEN
    RAISE EXCEPTION 'delete_client_profile() changed live since this migration was written; redefine it from the live version';
  END IF;
END $$;

-- ── Tables ───────────────────────────────────────────────

CREATE TABLE public.explore_collections (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  color      text NOT NULL DEFAULT 'pink' CHECK (color IN ('pink', 'blue', 'green')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX explore_collections_user_created_idx
  ON public.explore_collections (user_id, created_at);

-- item_id is the same id the heart writes into users.saved_portfolio: a
-- portfolio_items uuid, or `service-<uuid>__<photo index>` for a service photo.
CREATE TABLE public.explore_collection_items (
  collection_id uuid NOT NULL REFERENCES public.explore_collections(id) ON DELETE CASCADE,
  item_id       text NOT NULL CHECK (char_length(item_id) BETWEEN 1 AND 200),
  added_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, item_id)
);

CREATE INDEX explore_collection_items_item_idx
  ON public.explore_collection_items (item_id);

-- ── Housekeeping triggers ────────────────────────────────

CREATE FUNCTION public.explore_collections_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (SELECT count(*) FROM public.explore_collections WHERE user_id = NEW.user_id) >= 50 THEN
      RAISE EXCEPTION 'You can have up to 50 collections.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  NEW.name := btrim(NEW.name);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER explore_collections_before_write
  BEFORE INSERT OR UPDATE ON public.explore_collections
  FOR EACH ROW EXECUTE FUNCTION public.explore_collections_before_write();

-- Un-hearting removes the photo from every collection; clearing the saved
-- list (delete_client_profile) empties them all.
CREATE FUNCTION public.explore_collections_follow_saved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.explore_collection_items i
   USING public.explore_collections c
   WHERE i.collection_id = c.id
     AND c.user_id = NEW.id
     AND NOT (coalesce(NEW.saved_portfolio, '[]'::jsonb) ? i.item_id);
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.explore_collections_follow_saved() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.explore_collections_before_write() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER users_saved_portfolio_prunes_collections
  AFTER UPDATE OF saved_portfolio ON public.users
  FOR EACH ROW
  WHEN (OLD.saved_portfolio IS DISTINCT FROM NEW.saved_portfolio)
  EXECUTE FUNCTION public.explore_collections_follow_saved();

-- ── Row level security ───────────────────────────────────

ALTER TABLE public.explore_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.explore_collection_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.explore_collections FROM anon, authenticated;
REVOKE ALL ON public.explore_collection_items FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.explore_collections TO authenticated;
GRANT UPDATE (name, color) ON public.explore_collections TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.explore_collection_items TO authenticated;

CREATE POLICY explore_collections_owner_select ON public.explore_collections
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY explore_collections_owner_insert ON public.explore_collections
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY explore_collections_owner_update ON public.explore_collections
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY explore_collections_owner_delete ON public.explore_collections
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE POLICY explore_collection_items_owner_select ON public.explore_collection_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.explore_collections c
                  WHERE c.id = collection_id AND c.user_id = (SELECT auth.uid())));
CREATE POLICY explore_collection_items_owner_insert ON public.explore_collection_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.explore_collections c
             WHERE c.id = collection_id AND c.user_id = (SELECT auth.uid()))
    AND EXISTS (SELECT 1 FROM public.users u
                 WHERE u.id = (SELECT auth.uid()) AND u.saved_portfolio ? item_id)
  );
CREATE POLICY explore_collection_items_owner_delete ON public.explore_collection_items
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.explore_collections c
                  WHERE c.id = collection_id AND c.user_id = (SELECT auth.uid())));

-- ── delete_client_profile(): also delete collections ─────

CREATE OR REPLACE FUNCTION public.delete_client_profile()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid         UUID := auth.uid();
  v_provider_id UUID;
  v_upcoming    INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
  END IF;

  SELECT id INTO v_provider_id FROM public.providers WHERE user_id = v_uid LIMIT 1;

  SELECT COUNT(*) INTO v_upcoming
    FROM public.bookings
   WHERE user_id = v_uid
     AND booking_date >= CURRENT_DATE
     AND status IN ('pending', 'confirmed', 'in_progress');

  IF v_upcoming > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'upcoming_bookings', 'count', v_upcoming);
  END IF;

  INSERT INTO public.account_deletion_log
    (user_id, provider_id, email, deletion_type, had_client_profile, had_provider_profile, account_created_at)
  SELECT v_uid, v_provider_id, au.email,
         CASE WHEN v_provider_id IS NULL THEN 'full_account' ELSE 'client_profile' END,
         true, (v_provider_id IS NOT NULL), au.created_at
    FROM auth.users au WHERE au.id = v_uid;

  IF v_provider_id IS NULL THEN
    UPDATE public.users SET deletion_requested_at = NOW() WHERE id = v_uid;
    RETURN jsonb_build_object('ok', true, 'full_account_deleted', true, 'grace_period_days', 30);
  END IF;

  DELETE FROM public.reviews  WHERE user_id = v_uid;
  DELETE FROM public.bookings WHERE user_id = v_uid;

  DELETE FROM public.bookmarks              WHERE user_id = v_uid;
  DELETE FROM public.event_plans            WHERE user_id = v_uid;
  DELETE FROM public.payment_methods        WHERE user_id = v_uid;
  DELETE FROM public.becca_chat_sessions    WHERE user_id = v_uid;
  DELETE FROM public.user_interactions      WHERE user_id = v_uid;
  DELETE FROM public.provider_follows       WHERE user_id = v_uid;
  DELETE FROM public.provider_conversations WHERE user_id = v_uid;
  DELETE FROM public.notifications          WHERE user_id = v_uid;
  DELETE FROM public.maintenance_items      WHERE user_id = v_uid;
  DELETE FROM public.maintenance_settings   WHERE user_id = v_uid;
  DELETE FROM public.client_external_bookings WHERE client_id = v_uid;
  DELETE FROM public.provider_stat_viewers    WHERE viewer_id = v_uid;
  DELETE FROM public.explore_collections      WHERE user_id = v_uid;

  UPDATE public.users SET
    dob                = NULL,
    has_client_profile = false,
    hair_type          = NULL,
    skin_type          = NULL,
    allergies          = '{}',
    skin_concerns      = '{}',
    style_vibe         = NULL,
    medical_notes      = NULL,
    treatment_history  = '{}',
    service_interests  = '{}',
    saved_portfolio    = '[]'::jsonb
  WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'full_account_deleted', false);
END;
$function$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261110100000', 'explore_collections')
ON CONFLICT (version) DO NOTHING;

COMMIT;
