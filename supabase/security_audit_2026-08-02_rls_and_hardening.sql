-- ============================================================
-- SECURITY AUDIT FIXES — 2026-08-02
-- Run this in the Supabase SQL editor. Safe to re-run end-to-end.
-- Run AFTER phase1_schema.sql (+ RUN_ALL_MIGRATIONS.sql) on any fresh
-- environment — those files still contain the original, unhardened
-- definitions this file tightens. See the note near the top of
-- phase1_schema.sql.
--
-- Findings (from a live audit against the running "Cerviced" project,
-- cross-checked with Supabase's own security advisor):
--
-- 1. providers/services and 9 tables that hang off them (service_add_ons,
--    portfolio_items, service_images, provider_availability,
--    provider_availability_windows/overrides, provider_blocked_dates,
--    provider_specialties, reviews) had `FOR SELECT USING (true)` RLS —
--    i.e. has_gone_live/is_active gating existed only as an app-side query
--    convention (databaseService.ts), not as a database enforcement
--    boundary. Anyone with the public anon key could read every row
--    directly via the REST API, launched or not.
-- 2. `trending_providers` was a bare view, which Supabase flags ERROR
--    ("security_definer_view") because a view runs with its owner's
--    RLS-bypass by default — and it had no has_gone_live filter, so a
--    delisted provider could still surface as "trending."
-- 3. 7 public storage buckets had a broad `USING (bucket_id = 'x')` SELECT
--    policy on storage.objects, letting any client enumerate every file
--    via .list() — unnecessary, since public buckets serve objects via a
--    URL route that doesn't consult RLS at all.
-- 4. 51 SECURITY DEFINER (or otherwise flagged) functions had no pinned
--    search_path — the standard Postgres privilege-escalation vector for
--    definer functions.
-- 5. `users_service_insert` was `WITH CHECK (true)`, which shadowed the
--    already-correct `Users can insert own profile` (auth.uid() = id)
--    policy since RLS policies OR together.
--
-- Provider/service owners are unaffected throughout: every table below
-- already has (or keeps) a separate owner-scoped ALL/write policy that
-- doesn't depend on has_gone_live, so a provider can still manage their
-- own not-yet-live listing.
-- ============================================================

-- ── 1. has_gone_live / is_active gating ─────────────────────

DROP POLICY IF EXISTS "providers_public_read" ON public.providers;
CREATE POLICY "providers_public_read" ON public.providers
  FOR SELECT USING (has_gone_live = true AND is_active = true);

DROP POLICY IF EXISTS "services_public_read" ON public.services;
CREATE POLICY "services_public_read" ON public.services
  FOR SELECT USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = services.provider_id
        AND p.has_gone_live = true AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "add_ons_public_read" ON public.service_add_ons;
DROP POLICY IF EXISTS "service_add_ons_public_read" ON public.service_add_ons;
CREATE POLICY "service_add_ons_public_read" ON public.service_add_ons
  FOR SELECT USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.services s
      JOIN public.providers p ON p.id = s.provider_id
      WHERE s.id = service_add_ons.service_id
        AND p.has_gone_live = true AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "portfolio_public_read" ON public.portfolio_items;
CREATE POLICY "portfolio_public_read" ON public.portfolio_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = portfolio_items.provider_id
        AND p.has_gone_live = true AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "service_images_public_read" ON public.service_images;
CREATE POLICY "service_images_public_read" ON public.service_images
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.services s
      JOIN public.providers p ON p.id = s.provider_id
      WHERE s.id = service_images.service_id
        AND p.has_gone_live = true AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "availability_public_read" ON public.provider_availability;
CREATE POLICY "availability_public_read" ON public.provider_availability
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_availability.provider_id
        AND p.has_gone_live = true AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "availability_windows_public_read" ON public.provider_availability_windows;
CREATE POLICY "availability_windows_public_read" ON public.provider_availability_windows
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_availability_windows.provider_id
        AND p.has_gone_live = true AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "availability_overrides_public_read" ON public.provider_availability_overrides;
CREATE POLICY "availability_overrides_public_read" ON public.provider_availability_overrides
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_availability_overrides.provider_id
        AND p.has_gone_live = true AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "blocked_dates_public_read" ON public.provider_blocked_dates;
DROP POLICY IF EXISTS "Public read blocked dates" ON public.provider_blocked_dates;
CREATE POLICY "blocked_dates_public_read" ON public.provider_blocked_dates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_blocked_dates.provider_id
        AND p.has_gone_live = true AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "specialties_public_read" ON public.provider_specialties;
CREATE POLICY "specialties_public_read" ON public.provider_specialties
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = provider_specialties.provider_id
        AND p.has_gone_live = true AND p.is_active = true
    )
  );

-- reviews: tighten public read, but add an explicit owner-read policy so a
-- provider can still see their own reviews (e.g. imported during onboarding,
-- before going live) — mirroring the owner exception on providers itself.
DROP POLICY IF EXISTS "reviews_public_read" ON public.reviews;
CREATE POLICY "reviews_public_read" ON public.reviews
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.providers p
      WHERE p.id = reviews.provider_id
        AND p.has_gone_live = true AND p.is_active = true
    )
  );
DROP POLICY IF EXISTS "reviews_owner_read" ON public.reviews;
CREATE POLICY "reviews_owner_read" ON public.reviews
  FOR SELECT USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  );

-- ── 2. users_service_insert shadowing the real owner-only policy ──

DROP POLICY IF EXISTS "users_service_insert" ON public.users;
CREATE POLICY "users_service_insert" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ── 3. trending_providers: bare view -> pinned definer function ──

DROP VIEW IF EXISTS public.trending_providers;

CREATE OR REPLACE FUNCTION public.get_trending_providers(p_limit int DEFAULT 10)
RETURNS TABLE (provider_id uuid, booking_count_7d bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.provider_id, count(*) AS booking_count_7d
  FROM public.bookings b
  JOIN public.providers p ON p.id = b.provider_id
  WHERE b.created_at > (now() - '7 days'::interval)
    AND b.status <> ALL (ARRAY['cancelled'::text, 'no_show'::text])
    AND p.has_gone_live = true
    AND p.is_active = true
  GROUP BY b.provider_id
  ORDER BY count(*) DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_trending_providers(int) TO anon, authenticated;

-- App-side: src/services/databaseService.ts's getTrendingProviderIds() now
-- calls .rpc('get_trending_providers', { p_limit: limit }) instead of
-- .from('trending_providers').select(...).

-- ── 4. public storage buckets: stop RLS-backed listing/enumeration ──
-- Public buckets serve objects via a URL route that never consults RLS, so
-- these broad SELECT policies only ever enabled .list()-based enumeration.
-- Narrowed to owner-only so AuthContext.tsx's clearStorageFolder() (which
-- lists a user's own <uid>/ folder during account deletion) keeps working.

DROP POLICY IF EXISTS "avatars: public read" ON storage.objects;
CREATE POLICY "avatars: owner read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "portfolio: public read" ON storage.objects;
CREATE POLICY "portfolio: owner read" ON storage.objects
  FOR SELECT USING (bucket_id = 'portfolio' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "provider-backgrounds: public read" ON storage.objects;
CREATE POLICY "provider-backgrounds: owner read" ON storage.objects
  FOR SELECT USING (bucket_id = 'provider-backgrounds' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "provider-logos: public read" ON storage.objects;
DROP POLICY IF EXISTS "Public read provider-logos" ON storage.objects;
CREATE POLICY "provider-logos: owner read" ON storage.objects
  FOR SELECT USING (bucket_id = 'provider-logos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "service-images: public read" ON storage.objects;
CREATE POLICY "service-images: owner read" ON storage.objects
  FOR SELECT USING (bucket_id = 'service-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Public read promotion images" ON storage.objects;
CREATE POLICY "promotion-images: owner read" ON storage.objects
  FOR SELECT USING (bucket_id = 'promotion-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Public read access" ON storage.objects;
CREATE POLICY "public: owner read" ON storage.objects
  FOR SELECT USING (bucket_id = 'public' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ── 5. pin search_path on every SECURITY DEFINER function ──
-- Behavior-neutral: only changes how unqualified names resolve, closing
-- the classic definer-function search_path-hijack privilege-escalation
-- vector. Re-running is harmless (ALTER FUNCTION ... SET is idempotent).

ALTER FUNCTION public.append_saved_portfolio_item(p_user_id uuid, p_item_id text) SET search_path = public, pg_temp;
ALTER FUNCTION public.apply_provider_booking_instructions() SET search_path = public, pg_temp;
ALTER FUNCTION public.attach_info_pack_to_booking(p_booking_id uuid, p_info_pack_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.check_and_set_provider_live(p_provider_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.claim_waitlist_hold(p_booking_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.decline_waitlist_hold(p_booking_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_booking_bookability() SET search_path = public, pg_temp;
ALTER FUNCTION public.expire_waitlist_holds() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_promotion_audience(p_promotion_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_attach_info_packs() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_auto_send_intake_form() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_availability_window_change() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_booking_status_change() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_booking_todo_notification() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_intake_form_completed() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_booking() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_info_pack() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_provider_address_change() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_provider_availability_change() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_provider_gone_live() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_provider_service_insert() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_review_received() SET search_path = public, pg_temp;
ALTER FUNCTION public.invite_next_waitlist_entry(p_provider_id uuid, p_service_id uuid, p_booking_date date, p_booking_time time without time zone, p_end_time time without time zone, p_base_price numeric, p_add_ons_total numeric, p_service_charge numeric, p_service_category_snapshot text) SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_on_new_chat_message() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_auto_complete_bookings() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_birthday_greetings() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_client_appointment_reminders() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_expire_stale_pending_bookings() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_pending_booking_warnings() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_post_appt_check_ins() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_provider_24hr_reminders() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_provider_daily_recap() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_provider_fully_booked_alerts() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_provider_intake_form_reminders() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_provider_not_started_reminders() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_provider_stale_reschedule_reminders() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_provider_unaccepted_booking_reminders() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_provider_unpaid_deposit_reminders() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_provider_unread_message_reminders() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_rebooking_nudges() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_scheduled_promotion_notifications() SET search_path = public, pg_temp;
ALTER FUNCTION public.remove_saved_portfolio_item(p_user_id uuid, p_item_id text) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_conversation_last_message(conv_id uuid, msg_text text, p_sender_type text) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_provider_rating() SET search_path = public, pg_temp;

-- SECURITY INVOKER (not DEFINER) — no privilege-escalation vector, pinned
-- anyway for defense-in-depth. btree_gist extension internals (gbt_*,
-- *_dist, gbtreekey*_in/out) are intentionally left alone.
ALTER FUNCTION public.assign_waitlist_position() SET search_path = public, pg_temp;
ALTER FUNCTION public.create_booking_atomic(p_provider_id uuid, p_booking_date date, p_booking_time time without time zone, p_end_time time without time zone) SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_address_released(p_status text, p_policy text, p_released_at timestamp with time zone, p_booking_date date, p_booking_time time without time zone) SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_conversation() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_provider_search_vector() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_service_search_vector() SET search_path = public, pg_temp;

-- ============================================================
-- DONE — verified via mcp Supabase get_advisors(security): 0 remaining
-- rls_policy_always_true, public_bucket_allows_listing, or unpinned
-- SECURITY DEFINER functions. Not fixed here (separate decisions):
--   - auth_leaked_password_protection (Dashboard → Auth → Policies toggle,
--     not a migration)
--   - extension_in_public (btree_gist/pgcrypto living in public schema —
--     low severity, moving extensions schemas is a separate, riskier change)
--   - 4 tables (account_deletion_log, provider_outreach_suppressions,
--     provider_scrape_jobs, provider_scrape_sources) have RLS enabled with
--     zero policies — fail-closed by default, likely intentional
--     backend-only tables, not a vulnerability as-is
-- ============================================================
