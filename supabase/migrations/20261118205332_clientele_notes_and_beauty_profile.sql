-- My Clientele: a client's Beauty Profile and the provider's own notes on them,
-- shown in the client sheet that opens from their card.
--
-- 1. get_client_beauty_profile_for_provider(p_client_id)
--    The same answer get_client_beauty_profile_for_booking gives, but for the
--    client as a whole rather than one booking. Same gate: only the provider
--    the client has an ACCEPTED booking with (confirmed, in_progress or
--    completed) gets a row back — a request, a declined or cancelled booking,
--    or a checkout hold shares nothing (20261110131224). The fields shared
--    are the union of what each accepted booking's category gets
--    (beauty_profile_fields_for_category), so a client who has only booked
--    nails still never brings their hair, skin or makeup details onto the
--    provider's phone. Allergies, medical notes and photography consent
--    always come back, as on the booking page.
--
-- 2. provider_client_notes + get_my_client_note / save_my_client_note
--    One private note per provider per client. Only that provider can read
--    or write it; the client never sees it. RLS is on with no policies and
--    every grant revoked, so the table is reachable only through the two
--    SECURITY DEFINER functions, which also require the client to have
--    booked with the provider at least once (any status but a checkout hold).
--    An empty save deletes the row rather than storing a blank.

-- Guard: this builds on the live definitions below. Stop if either changed.
DO $$
BEGIN
  IF (SELECT md5(pg_get_functiondef('public.beauty_profile_fields_for_category(text)'::regprocedure)))
       <> '0f975e79bdf906bee7277a9e59e99f37' THEN
    RAISE EXCEPTION 'beauty_profile_fields_for_category changed since this migration was written';
  END IF;
  IF (SELECT md5(pg_get_functiondef('public.get_client_beauty_profile_for_booking(uuid)'::regprocedure)))
       <> '3b40eaf6fa463b9a9838367a28ef9902' THEN
    RAISE EXCEPTION 'get_client_beauty_profile_for_booking changed since this migration was written';
  END IF;
END $$;

-- ── 1. Beauty Profile for a client ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_client_beauty_profile_for_provider(p_client_id uuid)
 RETURNS TABLE(service_categories text[], hair_type text[], scalp_condition text[], hair_goals text[], treatment_history text[], skin_type text[], skin_tone text, skin_concerns text[], sensitive_areas text[], nail_length text[], nail_shape text[], nail_condition text[], nail_service text[], nail_style text[], nail_colours text[], lash_style text[], lash_status text, brow_style text[], brow_condition text[], makeup_coverage text[], makeup_finish text[], makeup_eyes text[], makeup_lips text[], style_vibe text[], allergies text[], medical_notes text, photography_consent boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_categories text[];
  f text[];
BEGIN
  -- Every category this provider has an accepted booking with this client
  -- in. Same category pick as get_client_beauty_profile_for_booking: the
  -- first of service, snapshot, provider category that is a real category.
  SELECT array_agg(DISTINCT cat)
    INTO v_categories
  FROM (
    SELECT coalesce(
             (SELECT c FROM unnest(ARRAY[
                upper(s.service_category::text),
                upper(b.service_category_snapshot),
                upper(p.service_category::text)
              ]) WITH ORDINALITY AS t(c, n)
              WHERE c IN ('HAIR', 'NAILS', 'LASHES', 'BROWS', 'MUA', 'AESTHETICS', 'MALE', 'KIDS', 'OTHER')
              ORDER BY n
              LIMIT 1),
             'UNKNOWN') AS cat
    FROM public.bookings b
    JOIN public.providers p ON p.id = b.provider_id
    LEFT JOIN public.services s ON s.id = b.service_id
    WHERE b.user_id = p_client_id
      AND p.user_id = auth.uid()
      AND b.status IN ('confirmed', 'in_progress', 'completed')
  ) cats;

  IF v_categories IS NULL THEN
    RETURN;
  END IF;

  SELECT coalesce(array_agg(DISTINCT field), '{}')
    INTO f
  FROM unnest(v_categories) AS c(cat),
       unnest(public.beauty_profile_fields_for_category(c.cat)) AS x(field);

  RETURN QUERY
  SELECT v_categories,
         CASE WHEN 'hair_type' = ANY (f) THEN u.hair_type END,
         CASE WHEN 'scalp_condition' = ANY (f) THEN u.scalp_condition END,
         CASE WHEN 'hair_goals' = ANY (f) THEN u.hair_goals END,
         CASE WHEN 'treatment_history' = ANY (f) THEN u.treatment_history END,
         CASE WHEN 'skin_type' = ANY (f) THEN u.skin_type END,
         CASE WHEN 'skin_tone' = ANY (f) THEN u.skin_tone END,
         CASE WHEN 'skin_concerns' = ANY (f) THEN u.skin_concerns END,
         CASE WHEN 'sensitive_areas' = ANY (f) THEN u.sensitive_areas END,
         CASE WHEN 'nail_length' = ANY (f) THEN u.nail_length END,
         CASE WHEN 'nail_shape' = ANY (f) THEN u.nail_shape END,
         CASE WHEN 'nail_condition' = ANY (f) THEN u.nail_condition END,
         CASE WHEN 'nail_service' = ANY (f) THEN u.nail_service END,
         CASE WHEN 'nail_style' = ANY (f) THEN u.nail_style END,
         CASE WHEN 'nail_colours' = ANY (f) THEN u.nail_colours END,
         CASE WHEN 'lash_style' = ANY (f) THEN u.lash_style END,
         CASE WHEN 'lash_status' = ANY (f) THEN u.lash_status END,
         CASE WHEN 'brow_style' = ANY (f) THEN u.brow_style END,
         CASE WHEN 'brow_condition' = ANY (f) THEN u.brow_condition END,
         CASE WHEN 'makeup_coverage' = ANY (f) THEN u.makeup_coverage END,
         CASE WHEN 'makeup_finish' = ANY (f) THEN u.makeup_finish END,
         CASE WHEN 'makeup_eyes' = ANY (f) THEN u.makeup_eyes END,
         CASE WHEN 'makeup_lips' = ANY (f) THEN u.makeup_lips END,
         CASE WHEN 'style_vibe' = ANY (f) THEN u.style_vibe END,
         u.allergies,
         u.medical_notes,
         u.photography_consent
  FROM public.users u
  WHERE u.id = p_client_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_client_beauty_profile_for_provider(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_beauty_profile_for_provider(uuid) TO authenticated;

-- ── 2. Private notes on a client ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.provider_client_notes (
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  note        text NOT NULL CHECK (char_length(note) BETWEEN 1 AND 2000),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, client_id)
);

COMMENT ON TABLE public.provider_client_notes IS
  'A provider''s own private note on one of their clients (My Clientele). Read and written only through get_my_client_note / save_my_client_note; no direct access.';

CREATE INDEX IF NOT EXISTS provider_client_notes_client_idx
  ON public.provider_client_notes (client_id);

ALTER TABLE public.provider_client_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_client_notes FROM PUBLIC, anon, authenticated;

-- The caller's provider row, if this client has booked with them at all.
CREATE OR REPLACE FUNCTION public.my_provider_id_for_client(p_client_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p.id
  FROM public.providers p
  WHERE p.user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.provider_id = p.id
        AND b.user_id = p_client_id
        AND b.status <> 'on_hold'
    )
  ORDER BY p.is_active DESC, p.created_at ASC
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.my_provider_id_for_client(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_client_note(p_client_id uuid)
 RETURNS TABLE(note text, updated_at timestamptz)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT n.note, n.updated_at
  FROM public.provider_client_notes n
  WHERE n.provider_id = public.my_provider_id_for_client(p_client_id)
    AND n.client_id = p_client_id;
$function$;

REVOKE ALL ON FUNCTION public.get_my_client_note(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_client_note(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_my_client_note(p_client_id uuid, p_note text)
 RETURNS timestamptz
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_provider uuid := public.my_provider_id_for_client(p_client_id);
  v_note text := btrim(coalesce(p_note, ''));
  v_at timestamptz := now();
BEGIN
  IF v_provider IS NULL THEN
    RAISE EXCEPTION 'You can only keep notes on your own clients.' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_note) > 2000 THEN
    RAISE EXCEPTION 'Notes can be up to 2,000 characters.' USING ERRCODE = 'P0001';
  END IF;

  IF v_note = '' THEN
    DELETE FROM public.provider_client_notes
     WHERE provider_id = v_provider AND client_id = p_client_id;
    RETURN NULL;
  END IF;

  INSERT INTO public.provider_client_notes (provider_id, client_id, note, updated_at)
  VALUES (v_provider, p_client_id, v_note, v_at)
  ON CONFLICT (provider_id, client_id)
  DO UPDATE SET note = EXCLUDED.note, updated_at = EXCLUDED.updated_at;
  RETURN v_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_my_client_note(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_client_note(uuid, text) TO authenticated;
