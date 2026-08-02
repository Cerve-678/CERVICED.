-- ============================================================
-- CERVICED — Fix: any authenticated (and even unauthenticated) caller
-- could read any other user's full profile, including allergies and
-- medical_notes, straight off the users table.
-- Run this in the Supabase SQL editor. Safe to re-run.
--
-- Root cause: "users_public_profile_read" was FOR SELECT USING (true)
-- with no role restriction -- RLS is row-level only, so a policy meant to
-- expose one row's name/avatar_url to anyone ended up exposing every
-- column of every row to anyone, including the anon role (which has a
-- table-level SELECT grant by default). Confirmed live: allergies,
-- medical_notes, email, phone, dob etc. were all readable via a direct
-- .from('users').select(...) call with any user id, no relationship
-- required.
--
-- The owner-only policies (auth.uid() = id) already correctly cover every
-- legitimate use in the app -- every existing call site reads its own row
-- except one (a provider reading a booked client's beauty/health profile
-- before their appointment) and one batched public need (reviewer
-- name+avatar on a provider's public review list). Both get a properly
-- scoped SECURITY DEFINER function below instead of the blanket policy.
-- ============================================================

DROP POLICY IF EXISTS "users_public_profile_read" ON public.users;

-- Batched, low-sensitivity: name + avatar_url only, for any set of user
-- ids -- used to show reviewer identity on a provider's public review list
-- without embedding a broad join on the base table.
CREATE OR REPLACE FUNCTION public.get_user_public_profiles(p_user_ids uuid[])
RETURNS TABLE(id uuid, name text, avatar_url text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.name, u.avatar_url
  FROM public.users u
  WHERE u.id = ANY(p_user_ids);
$$;
GRANT EXECUTE ON FUNCTION public.get_user_public_profiles(uuid[]) TO authenticated, anon;

-- Booking-gated: a provider may read a client's beauty/health profile only
-- if that client has an actual booking with them.
CREATE OR REPLACE FUNCTION public.get_client_beauty_profile_for_provider(p_client_user_id uuid)
RETURNS TABLE(
  hair_type text, scalp_condition text, hair_goals text[], treatment_history text[],
  skin_type text, skin_tone text, skin_concerns text[], sensitive_areas text[],
  nail_length text, nail_shape text,
  lash_style text, lash_status text, brow_style text, brow_condition text,
  makeup_coverage text, makeup_finish text, makeup_eyes text, makeup_lips text,
  style_vibe text, allergies text[], medical_notes text, photography_consent boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.hair_type, u.scalp_condition, u.hair_goals, u.treatment_history,
         u.skin_type, u.skin_tone, u.skin_concerns, u.sensitive_areas,
         u.nail_length, u.nail_shape,
         u.lash_style, u.lash_status, u.brow_style, u.brow_condition,
         u.makeup_coverage, u.makeup_finish, u.makeup_eyes, u.makeup_lips,
         u.style_vibe, u.allergies, u.medical_notes, u.photography_consent
  FROM public.users u
  WHERE u.id = p_client_user_id
    AND EXISTS (
      SELECT 1
      FROM public.bookings b
      JOIN public.providers p ON p.id = b.provider_id
      WHERE b.user_id = p_client_user_id
        AND p.user_id = auth.uid()
    );
$$;
GRANT EXECUTE ON FUNCTION public.get_client_beauty_profile_for_provider(uuid) TO authenticated;
