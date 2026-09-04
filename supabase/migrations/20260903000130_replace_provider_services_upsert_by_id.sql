-- replace_provider_services() has always done DELETE FROM services WHERE
-- provider_id = ... then re-INSERTed every service from the payload, on
-- EVERY save from InfoRegScreen's "fuller editor" — including a save that
-- only touches one unrelated service, or just reorders/renames a category.
-- Every service (and every add-on) gets a brand-new id each time.
--
-- Reported as: "a service is still available by a provider but it says no
-- longer available by provider." Root cause, confirmed live
-- (project ztrfpfvvejzaysrelmfm) before writing this fix:
--
--   * A client's cart item stores the services.id it was added with.
--     validateCartBookings() (src/services/AvailabilityService.ts) checks
--     that id still exists via getBookableServiceIds() — correctly, given
--     what it's told — and reports "no longer available" the moment the
--     provider's NEXT catalogue save regenerates that id, even though the
--     service itself is still fully live under a new row.
--   * Worse: bookings.service_id, portfolio_items.service_id,
--     reviews.service_id, event_tasks.service_id and
--     provider_waitlist.service_id are all ON DELETE SET NULL against
--     services(id), and booking_add_ons.add_on_id is ON DELETE SET NULL
--     against service_add_ons(id). Every one of those gets silently nulled
--     out by the DELETE, for every booking/review/etc. tied to any of that
--     provider's services — not just the one being edited. Checked live:
--     76 of 79 bookings (96%) already have service_id = NULL.
--   * Cart items also reference service_add_ons.id directly
--     (CartScreen.tsx's add_on_ids), so add-on churn breaks the exact same
--     way one level down.
--
-- THE FIX: upsert by id instead of delete-all-then-reinsert, for both
-- services and their add-ons. The app now sends the real DB id (or null for
-- a service/add-on created in this editing session) — see
-- ProviderServiceDraft.dbId / ServiceData.dbId / AddOnData.dbId across
-- src/features/provider-registration/serviceDraft.ts,
-- src/screens/provider/InfoRegScreen.tsx and
-- src/services/providerRegistrationService.ts.
--
--   * An incoming id is only trusted if it already belongs to THIS
--     provider's row (services) / THIS service's row (add-ons) — a
--     forged/foreign id is silently treated as a new insert instead of
--     being allowed to hijack another row.
--   * A service/add-on present in the payload is updated in place,
--     preserving its id.
--   * A service/add-on that existed before but is absent from this save's
--     payload is deleted — a provider removing a service or add-on still
--     works exactly as before.
--   * service_images stays delete-then-reinsert per service: nothing
--     external references service_images.id, so there is no churn hazard
--     there and no reason to complicate it.
--
-- NOT fixed here, flagged instead: getProviderRegistrationDetails() (the
-- query that hydrates InfoRegScreen) filters .eq('is_active', true), so a
-- provider's hidden/inactive services were never loaded into the editor and
-- were therefore never in the save payload either — under BOTH the old
-- delete-all logic and this new upsert-by-id logic, a hidden service is
-- still permanently deleted on the next full-catalogue save, because upsert
-- semantics can't distinguish "provider deleted this" from "provider never
-- saw this." That is a separate bug (silently destroys hidden services, not
-- id churn) needing either loading inactive services into the editor too or
-- excluding them from the prune step — a real product decision, not made
-- here.

CREATE OR REPLACE FUNCTION public.replace_provider_services(
  p_provider_id uuid,
  p_services    jsonb
)
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
  v_kept_addon_ids   uuid[];
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
        is_pregnancy_safe     = COALESCE((v_svc->>'is_pregnancy_safe')::boolean, false),
        patch_test_required   = COALESCE((v_svc->>'patch_test_required')::boolean, false),
        min_age               = NULLIF(v_svc->>'min_age','')::int,
        contraindications     = CASE WHEN jsonb_typeof(v_svc->'contraindications') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'contraindications')) END,
        aftercare_notes       = v_svc->>'aftercare_notes',
        service_type          = v_svc->>'service_type',
        hair_types_suitable   = CASE WHEN jsonb_typeof(v_svc->'hair_types_suitable') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'hair_types_suitable')) END,
        audience              = v_svc->>'audience'
      WHERE id = v_incoming_id;
      v_service_id := v_incoming_id;
    ELSE
      INSERT INTO public.services (
        provider_id, category_name, category_description, name, description, price, duration_minutes,
        buffer_before_mins, buffer_after_mins, is_active, sort_order,
        tags, technique_tags, outcome_tags, occasion_tags, trend_names,
        is_pregnancy_safe, patch_test_required, min_age, contraindications,
        aftercare_notes, service_type, hair_types_suitable, audience
      ) VALUES (
        p_provider_id,
        v_svc->>'category_name',
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
        COALESCE((v_svc->>'is_pregnancy_safe')::boolean, false),
        COALESCE((v_svc->>'patch_test_required')::boolean, false),
        NULLIF(v_svc->>'min_age','')::int,
        CASE WHEN jsonb_typeof(v_svc->'contraindications') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'contraindications')) END,
        v_svc->>'aftercare_notes',
        v_svc->>'service_type',
        CASE WHEN jsonb_typeof(v_svc->'hair_types_suitable') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_svc->'hair_types_suitable')) END,
        v_svc->>'audience'
      )
      RETURNING id INTO v_service_id;
    END IF;

    v_kept_service_ids := v_kept_service_ids || v_service_id;

    -- Images: nothing external references service_images.id, so
    -- delete-then-reinsert stays simple and correct either way.
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

    -- Add-ons: upsert by id too — cart items (add_on_ids) and
    -- booking_add_ons.add_on_id reference service_add_ons.id directly.
    v_kept_addon_ids := '{}';
    FOR v_addon IN SELECT * FROM jsonb_array_elements(COALESCE(v_svc->'add_ons', '[]'::jsonb))
    LOOP
      v_addon_id := NULLIF(v_addon->>'id', '')::uuid;

      IF v_addon_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.service_add_ons WHERE id = v_addon_id AND service_id = v_service_id
      ) THEN
        UPDATE public.service_add_ons SET
          name     = v_addon->>'name',
          price    = (v_addon->>'price')::numeric,
          is_active = true
        WHERE id = v_addon_id;
      ELSE
        INSERT INTO public.service_add_ons (service_id, name, price, is_active)
        VALUES (v_service_id, v_addon->>'name', (v_addon->>'price')::numeric, true)
        RETURNING id INTO v_addon_id;
      END IF;

      v_kept_addon_ids := v_kept_addon_ids || v_addon_id;
    END LOOP;

    -- Add-ons the provider removed from THIS service in this save.
    DELETE FROM public.service_add_ons
     WHERE service_id = v_service_id
       AND NOT (id = ANY(v_kept_addon_ids));

    v_count := v_count + 1;
  END LOOP;

  -- Services the provider removed from the catalogue entirely in this save
  -- (never touched if v_kept_service_ids covers everything, same as before).
  DELETE FROM public.services
   WHERE provider_id = p_provider_id
     AND NOT (id = ANY(v_kept_service_ids));

  RETURN v_count;
END;
$function$;
