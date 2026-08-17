-- GENERATED FROM THE LINKED CERVICED SUPABASE PROJECT.
-- Remote version: 20260802161027
-- Remote name: pin_search_path_remaining_invoker_functions
-- Do not edit this recovery archive; create a new tracked migration for changes.

-- These 7 are SECURITY INVOKER (not DEFINER), so the search_path-hijack
-- privilege-escalation risk doesn't actually apply to them — an invoker
-- function only ever runs with the calling user's own privileges. Pinning
-- anyway for defense-in-depth and to fully close out the linter category;
-- behavior-neutral, same as the earlier definer-function pass. The
-- remaining unpinned functions in public (gbt_*, *_dist, gbtreekey*_in/out)
-- belong to the btree_gist extension itself and are intentionally left
-- untouched.
ALTER FUNCTION public.assign_waitlist_position() SET search_path = public, pg_temp;
ALTER FUNCTION public.create_booking_atomic(p_provider_id uuid, p_booking_date date, p_booking_time time without time zone, p_end_time time without time zone) SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_address_released(p_status text, p_policy text, p_released_at timestamp with time zone, p_booking_date date, p_booking_time time without time zone) SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_conversation() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_provider_search_vector() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_service_search_vector() SET search_path = public, pg_temp;
