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

-- The booking-gated provider read of a client's beauty/health profile that
-- used to be defined here (get_client_beauty_profile_for_provider, the whole
-- profile) was replaced by get_client_beauty_profile_for_booking, which only
-- returns what the booked service needs. See
-- migrations/20261108100000_beauty_profile_shared_by_booked_service.sql.
-- Don't recreate it here.
