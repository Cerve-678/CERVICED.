-- Universal add-ons.
--
-- Until now an add-on lived inside one service (service_add_ons.service_id),
-- so a provider retyped "Lash removal £10" for every lash service and a price
-- change meant editing each copy. Add-ons are now the provider's own list:
--
--   provider_add_ons      one row per add-on: name, price, description,
--                         extra_minutes (NEW: makes the appointment longer),
--                         is_active (false = paused everywhere), and a rule
--                         for which services it goes on:
--                           applies_to = 'all' | 'categories' | 'services'
--                           category_names        (for 'categories')
--                           included_service_ids  (ticked outside the rule)
--                           excluded_service_ids  (unticked inside the rule)
--
--   service_add_ons       kept, as the DERIVED per-service rows. Every
--                         checkout path (prepare_checkout, finalize_checkout,
--                         hold/claim, manual bookings) and every client read
--                         already uses these ids, so none of them change
--                         shape. sync_provider_add_on_links() rewrites them
--                         from provider_add_ons, updating in place so an id
--                         in someone's cart stays valid while its link does.
--
-- booking_add_ons is untouched: bookings keep the name and price paid.
--
-- Extra time: prepare_checkout and provider_create_manual_booking now add the
-- chosen add-ons' extra_minutes to end_time. The legacy hold/claim path takes
-- end_time from the app, which adds the same minutes before sending it.
--
-- Existing data: add-ons with the same name (case/space-insensitive) and the
-- same price, under one provider, become one shared add-on ticked on exactly
-- the services that had it (applies_to = 'services'), so nothing a client
-- sees changes. Live on 2026-11-05: 52 rows -> 16 shared add-ons.
--
-- Function bodies below are copied from the LIVE definitions on 2026-11-05
-- and guarded by md5, so this refuses to apply over a newer version.

BEGIN;

DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.prepare_checkout(jsonb)'::regprocedure)) <> 'b66075bf305424c8a755f86f0fbbb04d' THEN
    RAISE EXCEPTION 'prepare_checkout changed live since this migration was written. Rebuild it from the live definition.';
  END IF;
  IF md5(pg_get_functiondef('public.provider_create_manual_booking(uuid, uuid, date, time without time zone, text, uuid[], boolean, boolean, integer)'::regprocedure)) <> 'd4de2dadebed6c2e62b708792de54ff4' THEN
    RAISE EXCEPTION 'provider_create_manual_booking changed live since this migration was written. Rebuild it from the live definition.';
  END IF;
  IF md5(pg_get_functiondef('public.replace_provider_services(uuid, jsonb)'::regprocedure)) <> '2933dca476d71cbd4bb8973773b89bcd' THEN
    RAISE EXCEPTION 'replace_provider_services changed live since this migration was written. Rebuild it from the live definition.';
  END IF;
END
$guard$;

-- ── The provider's own add-ons ──────────────────────────────────────────────
CREATE TABLE public.provider_add_ons (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id          uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  name                 text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  price                numeric(10,2) NOT NULL CHECK (price >= 0 AND price <= 10000),
  description          text CHECK (description IS NULL OR char_length(description) <= 300),
  extra_minutes        integer NOT NULL DEFAULT 0 CHECK (extra_minutes BETWEEN 0 AND 240),
  is_active            boolean NOT NULL DEFAULT true,
  applies_to           text NOT NULL DEFAULT 'services' CHECK (applies_to IN ('all', 'categories', 'services')),
  category_names       text[] NOT NULL DEFAULT '{}',
  included_service_ids uuid[] NOT NULL DEFAULT '{}',
  excluded_service_ids uuid[] NOT NULL DEFAULT '{}',
  sort_order           integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX provider_add_ons_provider_id_idx ON public.provider_add_ons (provider_id);

ALTER TABLE public.provider_add_ons ENABLE ROW LEVEL SECURITY;
-- The owner reads their own list to edit it. Clients never read this table:
-- they see the derived service_add_ons rows, already gated on has_gone_live.
-- Writes go only through replace_provider_add_ons().
CREATE POLICY provider_add_ons_owner_read ON public.provider_add_ons
  FOR SELECT TO authenticated
  USING (provider_id IN (SELECT p.id FROM public.providers p WHERE p.user_id = auth.uid()));
REVOKE ALL ON public.provider_add_ons FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.provider_add_ons TO authenticated;

-- ── Per-service rows become derived links ───────────────────────────────────
ALTER TABLE public.service_add_ons
  ADD COLUMN provider_add_on_id uuid REFERENCES public.provider_add_ons(id) ON DELETE CASCADE,
  ADD COLUMN extra_minutes integer NOT NULL DEFAULT 0 CHECK (extra_minutes BETWEEN 0 AND 240);
CREATE UNIQUE INDEX service_add_ons_service_provider_add_on_key
  ON public.service_add_ons (service_id, provider_add_on_id);

-- ── Move existing add-ons onto shared rows ──────────────────────────────────
WITH grouped AS (
  SELECT s.provider_id,
         lower(btrim(a.name)) AS name_key,
         a.price,
         (array_agg(btrim(a.name) ORDER BY a.id))[1] AS name,
         (array_agg(a.description ORDER BY a.id) FILTER (WHERE a.description IS NOT NULL))[1] AS description,
         bool_or(a.is_active) AS is_active,
         array_agg(DISTINCT a.service_id) AS service_ids
    FROM public.service_add_ons a
    JOIN public.services s ON s.id = a.service_id
   GROUP BY s.provider_id, lower(btrim(a.name)), a.price
), inserted AS (
  INSERT INTO public.provider_add_ons (provider_id, name, price, description, is_active, applies_to, included_service_ids, sort_order)
  SELECT g.provider_id, g.name, g.price, g.description, g.is_active, 'services', g.service_ids,
         (row_number() OVER (PARTITION BY g.provider_id ORDER BY g.name, g.price) - 1)::int
    FROM grouped g
  RETURNING id, provider_id, lower(btrim(name)) AS name_key, price
)
UPDATE public.service_add_ons a
   SET provider_add_on_id = i.id
  FROM public.services s, inserted i
 WHERE s.id = a.service_id
   AND i.provider_id = s.provider_id
   AND i.name_key = lower(btrim(a.name))
   AND i.price = a.price;

DO $check$
BEGIN
  IF EXISTS (SELECT 1 FROM public.service_add_ons WHERE provider_add_on_id IS NULL) THEN
    RAISE EXCEPTION 'An existing add-on was not moved onto a shared add-on';
  END IF;
END
$check$;

-- ── Which services an add-on goes on ────────────────────────────────────────
-- One definition, used by the sync below. The app mirrors it in
-- src/features/provider-registration/addOnLibrary.ts (addOnAppliesTo).
CREATE OR REPLACE FUNCTION public.provider_add_on_applies(pa public.provider_add_ons, s public.services)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT s.id = ANY(pa.included_service_ids)
      OR ((pa.applies_to = 'all'
           OR (pa.applies_to = 'categories' AND s.category_name = ANY(pa.category_names)))
          AND NOT (s.id = ANY(pa.excluded_service_ids)));
$fn$;

-- Rewrites one provider's service_add_ons from provider_add_ons. Updates in
-- place (unique on service_id + provider_add_on_id), so a link's id survives
-- every save that keeps the link. A deleted link's id goes NULL on any
-- booking_add_ons row (ON DELETE SET NULL), which keeps its snapshot.
CREATE OR REPLACE FUNCTION public.sync_provider_add_on_links(p_provider_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  DELETE FROM public.service_add_ons sa
   USING public.services s
   WHERE sa.service_id = s.id
     AND s.provider_id = p_provider_id
     AND NOT EXISTS (
       SELECT 1 FROM public.provider_add_ons pa
        WHERE pa.id = sa.provider_add_on_id
          AND pa.provider_id = p_provider_id
          AND public.provider_add_on_applies(pa, s)
     );

  INSERT INTO public.service_add_ons (service_id, provider_add_on_id, name, price, description, extra_minutes, is_active)
  SELECT s.id, pa.id, pa.name, pa.price, pa.description, pa.extra_minutes, pa.is_active
    FROM public.provider_add_ons pa
    JOIN public.services s ON s.provider_id = pa.provider_id
   WHERE pa.provider_id = p_provider_id
     AND public.provider_add_on_applies(pa, s)
  ON CONFLICT (service_id, provider_add_on_id) DO UPDATE SET
    name          = EXCLUDED.name,
    price         = EXCLUDED.price,
    description   = EXCLUDED.description,
    extra_minutes = EXCLUDED.extra_minutes,
    is_active     = EXCLUDED.is_active;
END;
$fn$;

-- Saves a provider's whole add-on list in one go: updates the rows it knows,
-- creates the new ones, deletes the rest, then re-derives every service's
-- links. Returns each item's client_key with its saved id so the app can
-- swap its local keys for real ids.
CREATE OR REPLACE FUNCTION public.replace_provider_add_ons(p_provider_id uuid, p_add_ons jsonb)
RETURNS TABLE (client_key text, add_on_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_uid      uuid := auth.uid();
  v_owner    uuid;
  v_items    jsonb := COALESCE(p_add_ons, '[]'::jsonb);
  v_item     jsonb;
  v_id       uuid;
  v_kept     uuid[] := '{}';
  v_order    integer := 0;
  v_name     text;
  v_price    numeric;
  v_minutes  integer;
  v_applies  text;
  v_desc     text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT p.user_id INTO v_owner FROM public.providers p WHERE p.id = p_provider_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'provider not found'; END IF;
  IF v_owner <> v_uid THEN RAISE EXCEPTION 'not your provider'; END IF;

  IF jsonb_typeof(v_items) <> 'array' THEN RAISE EXCEPTION 'Your add-ons could not be read. Please try again.'; END IF;
  IF jsonb_array_length(v_items) > 50 THEN RAISE EXCEPTION 'You can have up to 50 add-ons.'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items)
  LOOP
    v_name := btrim(COALESCE(v_item->>'name', ''));
    IF v_name = '' THEN RAISE EXCEPTION 'Every add-on needs a name.'; END IF;
    IF char_length(v_name) > 80 THEN RAISE EXCEPTION 'Add-on names can be up to 80 characters.'; END IF;
    v_price := NULLIF(v_item->>'price', '')::numeric;
    IF v_price IS NULL OR v_price < 0 OR v_price > 10000 THEN
      RAISE EXCEPTION 'Give "%" a price between £0 and £10,000.', v_name;
    END IF;
    v_minutes := COALESCE(NULLIF(v_item->>'extra_minutes', '')::integer, 0);
    IF v_minutes < 0 OR v_minutes > 240 THEN
      RAISE EXCEPTION 'Extra time for "%" can be up to 4 hours.', v_name;
    END IF;
    v_applies := COALESCE(NULLIF(v_item->>'applies_to', ''), 'services');
    IF v_applies NOT IN ('all', 'categories', 'services') THEN
      RAISE EXCEPTION 'Choose which services "%" goes on.', v_name;
    END IF;
    v_desc := NULLIF(btrim(COALESCE(v_item->>'description', '')), '');
    IF v_desc IS NOT NULL AND char_length(v_desc) > 300 THEN
      RAISE EXCEPTION 'The description for "%" can be up to 300 characters.', v_name;
    END IF;

    v_id := NULLIF(v_item->>'id', '')::uuid;
    IF v_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.provider_add_ons x WHERE x.id = v_id AND x.provider_id = p_provider_id
    ) THEN
      UPDATE public.provider_add_ons SET
        name                 = v_name,
        price                = v_price,
        description          = v_desc,
        extra_minutes        = v_minutes,
        is_active            = COALESCE((v_item->>'is_active')::boolean, true),
        applies_to           = v_applies,
        category_names       = CASE WHEN jsonb_typeof(v_item->'category_names') = 'array'
                                 THEN ARRAY(SELECT jsonb_array_elements_text(v_item->'category_names')) ELSE '{}' END,
        included_service_ids = CASE WHEN jsonb_typeof(v_item->'included_service_ids') = 'array'
                                 THEN ARRAY(SELECT e::uuid FROM jsonb_array_elements_text(v_item->'included_service_ids') AS e) ELSE '{}' END,
        excluded_service_ids = CASE WHEN jsonb_typeof(v_item->'excluded_service_ids') = 'array'
                                 THEN ARRAY(SELECT e::uuid FROM jsonb_array_elements_text(v_item->'excluded_service_ids') AS e) ELSE '{}' END,
        sort_order           = v_order,
        updated_at           = now()
      WHERE id = v_id;
    ELSE
      INSERT INTO public.provider_add_ons (
        provider_id, name, price, description, extra_minutes, is_active, applies_to,
        category_names, included_service_ids, excluded_service_ids, sort_order
      ) VALUES (
        p_provider_id, v_name, v_price, v_desc, v_minutes,
        COALESCE((v_item->>'is_active')::boolean, true), v_applies,
        CASE WHEN jsonb_typeof(v_item->'category_names') = 'array'
          THEN ARRAY(SELECT jsonb_array_elements_text(v_item->'category_names')) ELSE '{}' END,
        CASE WHEN jsonb_typeof(v_item->'included_service_ids') = 'array'
          THEN ARRAY(SELECT e::uuid FROM jsonb_array_elements_text(v_item->'included_service_ids') AS e) ELSE '{}' END,
        CASE WHEN jsonb_typeof(v_item->'excluded_service_ids') = 'array'
          THEN ARRAY(SELECT e::uuid FROM jsonb_array_elements_text(v_item->'excluded_service_ids') AS e) ELSE '{}' END,
        v_order
      )
      RETURNING id INTO v_id;
    END IF;

    v_kept := v_kept || v_id;
    v_order := v_order + 1;
    client_key := v_item->>'client_key';
    add_on_id := v_id;
    RETURN NEXT;
  END LOOP;

  DELETE FROM public.provider_add_ons x
   WHERE x.provider_id = p_provider_id
     AND NOT (x.id = ANY(v_kept));

  PERFORM public.sync_provider_add_on_links(p_provider_id);
END;
$fn$;

-- ── replace_provider_services: live definition, add-on block replaced ─────
CREATE OR REPLACE FUNCTION public.replace_provider_services(p_provider_id uuid, p_services jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid              uuid := auth.uid();
  v_owner            uuid;
  v_svc              jsonb;
  v_service_id       uuid;
  v_incoming_id      uuid;
  v_img              jsonb;
  v_addon            jsonb;
  v_addon_id         uuid;
  v_count            int := 0;
  v_kept_service_ids uuid[] := '{}';
  v_pa_id            uuid;
  v_ticked           uuid[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT user_id INTO v_owner FROM public.providers WHERE id = p_provider_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'provider not found'; END IF;
  IF v_owner <> v_uid THEN RAISE EXCEPTION 'not your provider'; END IF;

  FOR v_svc IN SELECT * FROM jsonb_array_elements(COALESCE(p_services, '[]'::jsonb))
  LOOP
    v_incoming_id := NULLIF(v_svc->>'id', '')::uuid;

    IF v_incoming_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.services WHERE id = v_incoming_id AND provider_id = p_provider_id
    ) THEN
      UPDATE public.services SET
        category_name         = v_svc->>'category_name',
        service_category      = v_svc->>'service_category',
        category_description  = v_svc->>'category_description',
        name                  = v_svc->>'name',
        description           = v_svc->>'description',
        price                 = (v_svc->>'price')::numeric,
        duration_minutes      = (v_svc->>'duration_minutes')::int,
        buffer_before_mins    = NULLIF(v_svc->>'buffer_before_mins','')::int,
        buffer_after_mins     = NULLIF(v_svc->>'buffer_after_mins','')::int,
        is_active             = COALESCE((v_svc->>'is_active')::boolean, true),
        sort_order            = COALESCE((v_svc->>'sort_order')::int, v_count),
        tags                  = CASE WHEN jsonb_typeof(v_svc->'tags')          = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'tags')) END,
        technique_tags        = CASE WHEN jsonb_typeof(v_svc->'technique_tags') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'technique_tags')) END,
        outcome_tags          = CASE WHEN jsonb_typeof(v_svc->'outcome_tags')   = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'outcome_tags')) END,
        occasion_tags         = CASE WHEN jsonb_typeof(v_svc->'occasion_tags')  = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'occasion_tags')) END,
        trend_names           = CASE WHEN jsonb_typeof(v_svc->'trend_names')    = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'trend_names')) END,
        is_pregnancy_safe     = COALESCE((v_svc->>'is_pregnancy_safe')::boolean, true),
        patch_test_required   = COALESCE((v_svc->>'patch_test_required')::boolean, false),
        min_age               = NULLIF(v_svc->>'min_age','')::int,
        contraindications     = CASE WHEN jsonb_typeof(v_svc->'contraindications') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'contraindications')) END,
        aftercare_notes       = v_svc->>'aftercare_notes',
        service_type          = v_svc->>'service_type',
        hair_types_suitable   = CASE WHEN jsonb_typeof(v_svc->'hair_types_suitable') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'hair_types_suitable')) END,
        skin_tones_suitable   = CASE WHEN v_svc ? 'skin_tones_suitable' THEN
          CASE WHEN jsonb_typeof(v_svc->'skin_tones_suitable') = 'array'
            THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'skin_tones_suitable')) END
          ELSE skin_tones_suitable END,
        audience              = v_svc->>'audience'
      WHERE id = v_incoming_id;
      v_service_id := v_incoming_id;
    ELSE
      INSERT INTO public.services (
        provider_id, category_name, service_category, category_description, name, description, price, duration_minutes,
        buffer_before_mins, buffer_after_mins, is_active, sort_order,
        tags, technique_tags, outcome_tags, occasion_tags, trend_names,
        is_pregnancy_safe, patch_test_required, min_age, contraindications,
        aftercare_notes, service_type, hair_types_suitable, skin_tones_suitable, audience
      ) VALUES (
        p_provider_id,
        v_svc->>'category_name',
        v_svc->>'service_category',
        v_svc->>'category_description',
        v_svc->>'name',
        v_svc->>'description',
        (v_svc->>'price')::numeric,
        (v_svc->>'duration_minutes')::int,
        NULLIF(v_svc->>'buffer_before_mins','')::int,
        NULLIF(v_svc->>'buffer_after_mins','')::int,
        COALESCE((v_svc->>'is_active')::boolean, true),
        COALESCE((v_svc->>'sort_order')::int, v_count),
        CASE WHEN jsonb_typeof(v_svc->'tags')          = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'tags')) END,
        CASE WHEN jsonb_typeof(v_svc->'technique_tags') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'technique_tags')) END,
        CASE WHEN jsonb_typeof(v_svc->'outcome_tags')   = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'outcome_tags')) END,
        CASE WHEN jsonb_typeof(v_svc->'occasion_tags')  = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'occasion_tags')) END,
        CASE WHEN jsonb_typeof(v_svc->'trend_names')    = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'trend_names')) END,
        COALESCE((v_svc->>'is_pregnancy_safe')::boolean, true),
        COALESCE((v_svc->>'patch_test_required')::boolean, false),
        NULLIF(v_svc->>'min_age','')::int,
        CASE WHEN jsonb_typeof(v_svc->'contraindications') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'contraindications')) END,
        v_svc->>'aftercare_notes',
        v_svc->>'service_type',
        CASE WHEN jsonb_typeof(v_svc->'hair_types_suitable') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'hair_types_suitable')) END,
        CASE WHEN jsonb_typeof(v_svc->'skin_tones_suitable') = 'array'
          THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'skin_tones_suitable')) END,
        v_svc->>'audience'
      )
      RETURNING id INTO v_service_id;
    END IF;

    v_kept_service_ids := v_kept_service_ids || v_service_id;

    DELETE FROM public.service_images WHERE service_id = v_service_id;
    FOR v_img IN SELECT * FROM jsonb_array_elements(COALESCE(v_svc->'images', '[]'::jsonb))
    LOOP
      INSERT INTO public.service_images (service_id, url, sort_order, aspect_ratio, fit)
      VALUES (
        v_service_id,
        v_img->>'url',
        COALESCE((v_img->>'sort_order')::int, 0),
        NULLIF(v_img->>'aspect_ratio','')::numeric,
        COALESCE(NULLIF(v_img->>'fit',''), 'cover')
      );
    END LOOP;

    -- Universal add-ons (20261105223541): add-ons belong to the provider now
    -- (provider_add_ons), and this service's rows in service_add_ons are
    -- derived from those by sync_provider_add_on_links() below. The current
    -- app saves add-ons with replace_provider_add_ons() and sends no
    -- 'add_ons' key here, so nothing happens for it.
    --
    -- An older app build still sends this service's own add-on list. Read it
    -- as "these are ticked on this service": a row it already knew keeps its
    -- shared add-on, a name it typed fresh reuses a shared add-on with the
    -- same name and price or creates one, and anything left out is unticked
    -- for this service only. Name/price edits from an old build are not
    -- applied, because the price is shared with other services now. An old
    -- build never saw paused add-ons, so saving from one unticks them here.
    IF v_svc ? 'add_ons' THEN
      v_ticked := '{}';
      FOR v_addon IN SELECT * FROM jsonb_array_elements(COALESCE(v_svc->'add_ons', '[]'::jsonb))
      LOOP
        v_addon_id := NULLIF(v_addon->>'id', '')::uuid;
        v_pa_id := NULL;
        IF v_addon_id IS NOT NULL THEN
          SELECT sa.provider_add_on_id INTO v_pa_id
            FROM public.service_add_ons sa
           WHERE sa.id = v_addon_id AND sa.service_id = v_service_id;
        END IF;
        IF v_pa_id IS NULL THEN
          SELECT pa.id INTO v_pa_id
            FROM public.provider_add_ons pa
           WHERE pa.provider_id = p_provider_id
             AND lower(btrim(pa.name)) = lower(btrim(v_addon->>'name'))
             AND pa.price = (v_addon->>'price')::numeric
           ORDER BY pa.created_at
           LIMIT 1;
        END IF;
        IF v_pa_id IS NULL THEN
          INSERT INTO public.provider_add_ons (provider_id, name, price, applies_to, included_service_ids, sort_order)
          VALUES (
            p_provider_id, btrim(v_addon->>'name'), (v_addon->>'price')::numeric, 'services', ARRAY[v_service_id],
            (SELECT COALESCE(max(x.sort_order) + 1, 0) FROM public.provider_add_ons x WHERE x.provider_id = p_provider_id)
          )
          RETURNING id INTO v_pa_id;
        END IF;
        v_ticked := v_ticked || v_pa_id;
      END LOOP;

      UPDATE public.provider_add_ons pa SET
        included_service_ids = CASE
          WHEN pa.id = ANY(v_ticked) THEN
            CASE WHEN v_service_id = ANY(pa.included_service_ids) THEN pa.included_service_ids
                 ELSE pa.included_service_ids || v_service_id END
          ELSE array_remove(pa.included_service_ids, v_service_id) END,
        excluded_service_ids = CASE
          WHEN pa.id = ANY(v_ticked) THEN array_remove(pa.excluded_service_ids, v_service_id)
          WHEN (pa.applies_to = 'all'
                OR (pa.applies_to = 'categories' AND (v_svc->>'category_name') = ANY(pa.category_names)))
               AND NOT (v_service_id = ANY(pa.excluded_service_ids))
            THEN pa.excluded_service_ids || v_service_id
          ELSE pa.excluded_service_ids END,
        updated_at = now()
      WHERE pa.provider_id = p_provider_id;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  DELETE FROM public.services
   WHERE provider_id = p_provider_id
     AND NOT (id = ANY(v_kept_service_ids));

  -- New services pick up every add-on whose rule covers them, and links
  -- to deleted services are already gone (ON DELETE CASCADE).
  PERFORM public.sync_provider_add_on_links(p_provider_id);

  RETURN v_count;
END;
$function$;

-- ── prepare_checkout: live definition, plus add-on extra time ──────────────
CREATE OR REPLACE FUNCTION public.prepare_checkout(p_items jsonb)
 RETURNS TABLE(checkout_batch_id uuid, amount_due numeric, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item jsonb;
  v_provider public.providers%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_booking_id uuid;
  v_batch_id uuid := gen_random_uuid();
  v_add_on_ids jsonb;
  v_add_ons_total numeric(10,2);
  v_add_on_minutes integer;
  v_subtotal numeric(10,2);
  v_deposit numeric(10,2);
  v_due numeric(10,2) := 0;
  v_use_deposit boolean;
  v_deposit_type text;
  v_deposit_amount numeric(10,2);
  v_end_time time;
  v_user public.users%ROWTYPE;
  v_expiry timestamptz := now() + interval '10 minutes';
  v_daily_booking_cap integer;
  v_active_booking_count integer;
  v_safety_required boolean;
  v_safety_ack boolean;
  v_emergency boolean;
  v_emergency_ack boolean;
  v_stale_batch_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in is required'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one booking is required';
  END IF;
  IF jsonb_array_length(p_items) > 20 THEN RAISE EXCEPTION 'Too many bookings in one checkout'; END IF;

  SELECT u.* INTO v_user FROM public.users u WHERE u.id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Client profile was not found'; END IF;

  -- NEW: release the caller's own abandoned, unpaid checkouts that hold a
  -- slot with a provider on a date this checkout books (see header).
  FOR v_stale_batch_id IN
    SELECT DISTINCT cb.id
      FROM public.checkout_batches cb
      JOIN public.bookings b ON b.hold_batch_id = cb.id
     WHERE cb.user_id = auth.uid()
       AND cb.status = 'prepared'
       AND cb.payment_intent_id IS NULL
       AND b.status = 'on_hold'
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_items) AS i(value)
          WHERE NULLIF(i.value->>'provider_id', '')::uuid = b.provider_id
            AND NULLIF(i.value->>'booking_date', '')::date = b.booking_date
       )
  LOOP
    PERFORM public.cancel_checkout(v_stale_batch_id);
  END LOOP;

  INSERT INTO public.checkout_batches (id, user_id, amount_due, expires_at)
  VALUES (v_batch_id, auth.uid(), 0, v_expiry);

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF NULLIF(v_item->>'provider_id', '') IS NULL
       OR NULLIF(v_item->>'service_id', '') IS NULL
       OR NULLIF(v_item->>'booking_date', '') IS NULL
       OR NULLIF(v_item->>'booking_time', '') IS NULL THEN
      RAISE EXCEPTION 'Each booking needs a provider, service, date and time';
    END IF;

    SELECT p.* INTO v_provider FROM public.providers p
     WHERE p.id = (v_item->>'provider_id')::uuid AND p.has_gone_live = true FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Provider is not available for booking'; END IF;
    SELECT s.* INTO v_service FROM public.services s
     WHERE s.id = (v_item->>'service_id')::uuid AND s.provider_id = v_provider.id AND s.is_active = true FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Service is no longer available'; END IF;

    v_add_on_ids := COALESCE(v_item->'add_on_ids', '[]'::jsonb);
    IF jsonb_typeof(v_add_on_ids) <> 'array' THEN RAISE EXCEPTION 'Invalid add-ons'; END IF;
    -- Universal add-ons: an add-on can make the appointment longer, so its
    -- extra time is summed from the same rows that price it.
    SELECT COALESCE(sum(a.price), 0), COALESCE(sum(a.extra_minutes), 0)
      INTO v_add_ons_total, v_add_on_minutes
      FROM public.service_add_ons a
     WHERE a.service_id = v_service.id AND a.is_active = true
       AND a.id IN (SELECT e.value::uuid FROM jsonb_array_elements_text(v_add_on_ids) AS e(value));
    IF (SELECT count(*) FROM jsonb_array_elements_text(v_add_on_ids)) <>
       (SELECT count(*) FROM public.service_add_ons a WHERE a.service_id = v_service.id AND a.is_active = true
          AND a.id IN (SELECT e.value::uuid FROM jsonb_array_elements_text(v_add_on_ids) AS e(value))) THEN
      RAISE EXCEPTION 'One or more add-ons are unavailable';
    END IF;

    v_safety_required := COALESCE(v_service.patch_test_required, false)
      OR v_service.is_pregnancy_safe = false;
    v_safety_ack := COALESCE((v_item->>'safety_ack')::boolean, false);
    IF v_safety_required AND NOT v_safety_ack THEN
      RAISE EXCEPTION 'Please confirm you have seen this treatment''s safety information before continuing';
    END IF;

    v_emergency := COALESCE((v_item->>'emergency')::boolean, false);
    v_emergency_ack := COALESCE((v_item->>'emergency_ack')::boolean, false);
    IF v_emergency AND NOT v_emergency_ack THEN
      RAISE EXCEPTION 'Please confirm you have read this provider''s policy before requesting a time outside their availability';
    END IF;

    -- Mobile-address gate: a mobile provider travels TO the client, so a mobile
    -- booking with no client address is a provider sent nowhere. Fail closed
    -- here -- same shape as the two gates above. business_type is read from the
    -- provider row, never trusted from the client payload.
    IF v_provider.business_type = 'mobile'
       AND NULLIF(btrim(v_item->>'client_address'), '') IS NULL THEN
      RAISE EXCEPTION 'A mobile booking needs the client''s address before payment';
    END IF;

    v_subtotal := v_service.price + v_add_ons_total;
    v_use_deposit := COALESCE((v_item->>'use_deposit')::boolean, false);
    v_deposit_type := COALESCE(v_provider.booking_policies->>'depositType', 'percentage');
    v_deposit_amount := NULLIF(v_provider.booking_policies->>'depositAmount', '')::numeric;
    IF COALESCE((v_provider.booking_policies->>'depositRequired')::boolean, true) = false THEN v_use_deposit := false; END IF;
    IF COALESCE((v_provider.booking_policies->>'depositOnly')::boolean, false) THEN v_use_deposit := true; END IF;
    v_deposit := CASE WHEN v_use_deposit THEN LEAST(v_subtotal,
      CASE WHEN v_deposit_type = 'fixed' THEN COALESCE(v_deposit_amount, 0)
           ELSE round(v_subtotal * COALESCE(v_deposit_amount, 20) / 100, 2) END)
      ELSE 0 END;
    v_due := v_due + CASE WHEN v_use_deposit THEN v_deposit ELSE v_subtotal END;
    v_end_time := (v_item->>'booking_time')::time + make_interval(mins => v_service.duration_minutes + v_add_on_minutes);

    v_daily_booking_cap := COALESCE(v_provider.max_bookings_per_day, 0);
    IF v_daily_booking_cap > 0 THEN
      SELECT count(*) INTO v_active_booking_count
        FROM public.bookings b
       WHERE b.provider_id = v_provider.id
         AND b.booking_date = (v_item->>'booking_date')::date
         AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold');
      IF v_active_booking_count >= v_daily_booking_cap THEN
        RAISE EXCEPTION 'This provider has reached their booking limit for that date';
      END IF;
    END IF;

    INSERT INTO public.bookings (
      user_id, provider_id, service_id, status, booking_date, booking_time, end_time, notes,
      payment_type, base_price, add_ons_total, service_charge, deposit_amount, amount_paid,
      remaining_balance, payment_status, provider_name_snapshot, service_name_snapshot,
      service_category_snapshot, provider_logo_snapshot, customer_name, customer_email,
      customer_phone, hold_batch_id, hold_expires_at, safety_ack_required, safety_ack_at,
      is_emergency_request, emergency_ack_at, client_address, client_area
    ) VALUES (
      auth.uid(), v_provider.id, v_service.id, 'on_hold', (v_item->>'booking_date')::date,
      (v_item->>'booking_time')::time, v_end_time, NULLIF(btrim(v_item->>'notes'), ''),
      CASE WHEN v_use_deposit THEN 'deposit' ELSE 'full' END, v_service.price, v_add_ons_total, 0,
      v_deposit, CASE WHEN v_use_deposit THEN v_deposit ELSE v_subtotal END,
      CASE WHEN v_use_deposit THEN v_subtotal - v_deposit ELSE 0 END,
      CASE WHEN v_use_deposit THEN 'deposit_paid' ELSE 'fully_paid' END,
      v_provider.display_name, v_service.name, v_provider.service_category, v_provider.logo_url,
      v_user.name, v_user.email, v_user.phone, v_batch_id, v_expiry,
      v_safety_required, CASE WHEN v_safety_required THEN now() ELSE NULL END,
      v_emergency, CASE WHEN v_emergency THEN now() ELSE NULL END,
      CASE WHEN v_provider.business_type = 'mobile' THEN NULLIF(btrim(v_item->>'client_address'), '') ELSE NULL END,
      CASE WHEN v_provider.business_type = 'mobile' THEN NULLIF(btrim(v_item->>'client_area'), '') ELSE NULL END
    ) RETURNING id INTO v_booking_id;
    INSERT INTO public.checkout_batch_items (checkout_batch_id, booking_id, add_on_ids)
    VALUES (v_batch_id, v_booking_id, v_add_on_ids);
  END LOOP;

  UPDATE public.checkout_batches SET amount_due = v_due WHERE id = v_batch_id;
  RETURN QUERY SELECT v_batch_id, v_due, v_expiry;
END;
$function$;

-- ── provider_create_manual_booking: live definition, plus add-on extra time ─
CREATE OR REPLACE FUNCTION public.provider_create_manual_booking(p_client_user_id uuid, p_service_id uuid, p_booking_date date, p_booking_time time without time zone, p_notes text DEFAULT NULL::text, p_add_on_ids uuid[] DEFAULT '{}'::uuid[], p_safety_ack boolean DEFAULT false, p_override_scheduling boolean DEFAULT false, p_extra_minutes integer DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_provider public.providers%ROWTYPE;
  v_service public.services%ROWTYPE;
  v_client public.users%ROWTYPE;
  v_booking_id uuid;
  v_end_time time;
  v_daily_booking_cap integer;
  v_active_booking_count integer;
  v_add_ons_total numeric(10,2) := 0;
  v_safety_required boolean;
  v_extra_minutes integer;
  v_add_on_minutes integer := 0;
BEGIN
  SELECT p.* INTO v_provider
    FROM public.providers p
   WHERE p.user_id = auth.uid()
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the owning provider can add a booking';
  END IF;

  SELECT s.* INTO v_service
    FROM public.services s
   WHERE s.id = p_service_id
     AND s.provider_id = v_provider.id
     AND s.is_active = TRUE
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service is not active for this provider';
  END IF;

  SELECT u.* INTO v_client
    FROM public.users u
   WHERE u.id = p_client_user_id
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client account was not found';
  END IF;

  IF p_booking_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Booking date cannot be in the past';
  END IF;
  IF p_booking_time IS NULL THEN
    RAISE EXCEPTION 'Booking time is required';
  END IF;

  v_extra_minutes := COALESCE(p_extra_minutes, 0);
  IF v_extra_minutes < 0 THEN
    RAISE EXCEPTION 'Extra time cannot be negative';
  END IF;
  IF v_extra_minutes > 240 THEN
    RAISE EXCEPTION 'Extra time cannot exceed 4 hours';
  END IF;

  v_safety_required := COALESCE(v_service.patch_test_required, false)
    OR v_service.is_pregnancy_safe = false;
  IF v_safety_required AND NOT COALESCE(p_safety_ack, false) THEN
    RAISE EXCEPTION 'Please confirm the client has been told this treatment''s safety requirements';
  END IF;

  IF p_add_on_ids IS NOT NULL AND array_length(p_add_on_ids, 1) > 0 THEN
    SELECT COALESCE(SUM(sao.price), 0), COALESCE(SUM(sao.extra_minutes), 0)
      INTO v_add_ons_total, v_add_on_minutes
      FROM public.service_add_ons sao
     WHERE sao.id = ANY(p_add_on_ids)
       AND sao.service_id = p_service_id
       AND sao.is_active = TRUE;
  END IF;

  -- The provider's own extra time plus whatever the chosen add-ons add.
  v_end_time := p_booking_time + make_interval(mins => v_service.duration_minutes + v_extra_minutes + v_add_on_minutes);

  v_daily_booking_cap := COALESCE(v_provider.max_bookings_per_day, 0);
  IF v_daily_booking_cap > 0 THEN
    SELECT count(*) INTO v_active_booking_count
      FROM public.bookings b
     WHERE b.provider_id = v_provider.id
       AND b.booking_date = p_booking_date
       AND b.status IN ('pending', 'confirmed', 'in_progress', 'on_hold');
    IF v_active_booking_count >= v_daily_booking_cap THEN
      RAISE EXCEPTION 'This provider has reached their booking limit for that date';
    END IF;
  END IF;

  PERFORM set_config('cerviced.bypass_working_hours', 'on', true);

  IF p_override_scheduling THEN
    PERFORM set_config('cerviced.bypass_scheduling_policy', 'on', true);
  END IF;

  INSERT INTO public.bookings (
    user_id, provider_id, service_id, status,
    booking_date, booking_time, end_time, notes,
    payment_type, base_price, add_ons_total, service_charge,
    deposit_amount, amount_paid, remaining_balance, payment_status,
    provider_name_snapshot, service_name_snapshot, service_category_snapshot,
    provider_logo_snapshot, customer_name, customer_email, customer_phone,
    safety_ack_required, safety_ack_at
  ) VALUES (
    v_client.id, v_provider.id, v_service.id, 'on_hold',
    p_booking_date, p_booking_time, v_end_time, NULLIF(btrim(p_notes), ''),
    'full', v_service.price, v_add_ons_total, 0,
    0, 0, v_service.price + v_add_ons_total, 'pending',
    v_provider.display_name, v_service.name, v_provider.service_category,
    v_provider.logo_url, v_client.name, v_client.email, v_client.phone,
    v_safety_required, CASE WHEN v_safety_required THEN now() ELSE NULL END
  ) RETURNING id INTO v_booking_id;

  IF p_add_on_ids IS NOT NULL AND array_length(p_add_on_ids, 1) > 0 THEN
    INSERT INTO public.booking_add_ons (booking_id, add_on_id, name_snapshot, price_snapshot)
    SELECT v_booking_id, sao.id, sao.name, sao.price
      FROM public.service_add_ons sao
     WHERE sao.id = ANY(p_add_on_ids)
       AND sao.service_id = p_service_id
       AND sao.is_active = TRUE;
  END IF;

  UPDATE public.bookings
     SET status = 'confirmed', confirmed_at = now()
   WHERE id = v_booking_id;

  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
  VALUES (
    v_client.id, 'booking_confirmed', 'Booking Confirmed! 🎉',
    v_provider.display_name || ' booked your ' || v_service.name ||
      ' for ' || to_char(p_booking_date, 'DD Mon YYYY') ||
      ' at ' || public.format_notification_time(p_booking_time) || '.',
    'high', TRUE, v_booking_id, v_provider.id, 'client'
  );
  INSERT INTO public.notifications
    (user_id, type, title, message, priority, is_actionable, booking_id, provider_id, recipient_role)
  VALUES (
    v_provider.user_id, 'booking_confirmed', 'Manual Booking Added',
    COALESCE(v_client.name, 'Client') || ' was added for ' || v_service.name ||
      ' on ' || to_char(p_booking_date, 'DD Mon YYYY') ||
      ' at ' || public.format_notification_time(p_booking_time) || '.',
    'medium', FALSE, v_booking_id, v_provider.id, 'provider'
  );

  RETURN v_booking_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.provider_add_on_applies(public.provider_add_ons, public.services) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_provider_add_on_links(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_provider_add_ons(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_provider_add_ons(uuid, jsonb) TO authenticated;

-- CREATE OR REPLACE keeps the existing grants on the three redefined
-- functions (authenticated + service_role only, checked live 2026-11-05).

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261105223541', 'universal_add_ons')
ON CONFLICT (version) DO NOTHING;

COMMIT;
