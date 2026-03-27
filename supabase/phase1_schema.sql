-- ============================================================
-- CERVICED — Phase 1: Complete Database Schema
-- Run this entire script in Supabase SQL Editor
-- Project: ztrfpfvvejzaysrelmfm
-- ============================================================

-- ============================================================
-- STEP 1: Extend existing `users` table
-- ============================================================

-- Fix role constraint (currently missing 'provider')
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('user', 'provider'));

-- Add missing columns if they don't exist
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url        TEXT,
  ADD COLUMN IF NOT EXISTS expo_push_token   TEXT,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT NOW();

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- STEP 2: providers
-- ============================================================

CREATE TABLE IF NOT EXISTS public.providers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  slug                TEXT UNIQUE NOT NULL,
  display_name        TEXT NOT NULL,
  service_category    TEXT NOT NULL CHECK (service_category IN (
                        'HAIR','NAILS','LASHES','BROWS','MUA','AESTHETICS','MALE','KIDS','OTHER'
                      )),
  custom_service_type TEXT,
  location_text       TEXT,
  latitude            NUMERIC(10,7),
  longitude           NUMERIC(10,7),
  about_text          TEXT,
  slots_text          TEXT,
  logo_url            TEXT,
  gradient            TEXT[],
  accent_color        TEXT,
  phone               TEXT,
  email               TEXT,
  rating              NUMERIC(3,2) DEFAULT 0,
  review_count        INT DEFAULT 0,
  years_experience    INT,
  is_active           BOOLEAN DEFAULT TRUE,
  is_featured         BOOLEAN DEFAULT FALSE,
  is_verified         BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS providers_updated_at ON public.providers;
CREATE TRIGGER providers_updated_at
  BEFORE UPDATE ON public.providers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_providers_user_id ON public.providers(user_id);
CREATE INDEX IF NOT EXISTS idx_providers_service_category ON public.providers(service_category);
CREATE INDEX IF NOT EXISTS idx_providers_slug ON public.providers(slug);
CREATE INDEX IF NOT EXISTS idx_providers_is_active ON public.providers(is_active);

-- ============================================================
-- STEP 3: provider_specialties
-- ============================================================

CREATE TABLE IF NOT EXISTS public.provider_specialties (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  specialty   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_provider_specialties_provider_id ON public.provider_specialties(provider_id);

-- ============================================================
-- STEP 4: services
-- ============================================================

CREATE TABLE IF NOT EXISTS public.services (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  category_name   TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  price           NUMERIC(10,2) NOT NULL,
  price_max       NUMERIC(10,2),
  duration_minutes INT NOT NULL DEFAULT 60,
  is_active       BOOLEAN DEFAULT TRUE,
  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_services_provider_id ON public.services(provider_id);
CREATE INDEX IF NOT EXISTS idx_services_is_active ON public.services(is_active);

-- ============================================================
-- STEP 5: service_images
-- ============================================================

CREATE TABLE IF NOT EXISTS public.service_images (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  sort_order INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_service_images_service_id ON public.service_images(service_id);

-- ============================================================
-- STEP 6: service_add_ons
-- ============================================================

CREATE TABLE IF NOT EXISTS public.service_add_ons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id  UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  price       NUMERIC(10,2) NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_service_add_ons_service_id ON public.service_add_ons(service_id);

-- ============================================================
-- STEP 7: provider_availability
-- ============================================================

CREATE TABLE IF NOT EXISTS public.provider_availability (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time   TIME NOT NULL,
  close_time  TIME NOT NULL,
  is_closed   BOOLEAN DEFAULT FALSE,
  UNIQUE(provider_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_provider_availability_provider_id ON public.provider_availability(provider_id);

-- ============================================================
-- STEP 8: provider_blocked_dates
-- ============================================================

CREATE TABLE IF NOT EXISTS public.provider_blocked_dates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  blocked_date DATE NOT NULL,
  reason       TEXT,
  UNIQUE(provider_id, blocked_date)
);

CREATE INDEX IF NOT EXISTS idx_provider_blocked_dates_provider_id ON public.provider_blocked_dates(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_blocked_dates_date ON public.provider_blocked_dates(blocked_date);

-- ============================================================
-- STEP 9: portfolio_items
-- ============================================================

CREATE TABLE IF NOT EXISTS public.portfolio_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  service_id   UUID REFERENCES public.services(id) ON DELETE SET NULL,
  image_url    TEXT NOT NULL,
  caption      TEXT,
  category     TEXT,
  tags         TEXT[],
  price        NUMERIC(10,2),
  aspect_ratio NUMERIC(4,2) DEFAULT 1.0,
  is_featured  BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_items_provider_id ON public.portfolio_items(provider_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_items_category ON public.portfolio_items(category);
CREATE INDEX IF NOT EXISTS idx_portfolio_items_created_at ON public.portfolio_items(created_at DESC);

-- ============================================================
-- STEP 10: bookings
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bookings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES public.users(id),
  provider_id              UUID NOT NULL REFERENCES public.providers(id),
  service_id               UUID REFERENCES public.services(id) ON DELETE SET NULL,

  -- Status
  status                   TEXT NOT NULL DEFAULT 'confirmed'
                             CHECK (status IN (
                               'pending','confirmed','in_progress','completed','cancelled','no_show'
                             )),

  -- Scheduling
  booking_date             DATE NOT NULL,
  booking_time             TIME NOT NULL,
  end_time                 TIME,

  -- Notes
  notes                    TEXT,
  booking_instructions     TEXT,

  -- Payment
  payment_type             TEXT NOT NULL CHECK (payment_type IN ('full','deposit')),
  base_price               NUMERIC(10,2) NOT NULL,
  add_ons_total            NUMERIC(10,2) DEFAULT 0,
  service_charge           NUMERIC(10,2) DEFAULT 2.99,
  deposit_amount           NUMERIC(10,2) DEFAULT 0,
  amount_paid              NUMERIC(10,2) NOT NULL,
  remaining_balance        NUMERIC(10,2) DEFAULT 0,
  payment_status           TEXT NOT NULL DEFAULT 'pending'
                             CHECK (payment_status IN (
                               'pending','deposit_paid','fully_paid','refunded','failed'
                             )),
  payment_method           TEXT,
  payment_intent_id        TEXT,

  -- Group booking
  is_group_booking         BOOLEAN DEFAULT FALSE,
  group_booking_id         UUID,
  group_booking_count      INT DEFAULT 1,

  -- Denormalized snapshots (frozen at booking time)
  provider_name_snapshot   TEXT NOT NULL,
  service_name_snapshot    TEXT NOT NULL,
  provider_logo_snapshot   TEXT,
  provider_address_snapshot TEXT,
  provider_phone_snapshot  TEXT,
  provider_coordinates     JSONB,

  -- Customer info snapshot
  customer_name            TEXT,
  customer_email           TEXT,
  customer_phone           TEXT,

  confirmed_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS bookings_updated_at ON public.bookings;
CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON public.bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_provider_id ON public.bookings(provider_id);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_date ON public.bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_provider_date ON public.bookings(provider_id, booking_date);

-- ============================================================
-- STEP 11: booking_add_ons
-- ============================================================

CREATE TABLE IF NOT EXISTS public.booking_add_ons (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  add_on_id      UUID REFERENCES public.service_add_ons(id) ON DELETE SET NULL,
  name_snapshot  TEXT NOT NULL,
  price_snapshot NUMERIC(10,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_booking_add_ons_booking_id ON public.booking_add_ons(booking_id);

-- ============================================================
-- STEP 12: booking_reschedule_requests
-- ============================================================

CREATE TABLE IF NOT EXISTS public.booking_reschedule_requests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id              UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  requested_by            TEXT NOT NULL CHECK (requested_by IN ('user','provider')),
  original_date           DATE NOT NULL,
  original_time           TIME NOT NULL,
  requested_dates         DATE[],
  provider_available_slots JSONB,
  status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN (
                              'pending','provider_responded','confirmed','rejected'
                            )),
  reschedule_count        INT DEFAULT 1,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS reschedule_updated_at ON public.booking_reschedule_requests;
CREATE TRIGGER reschedule_updated_at
  BEFORE UPDATE ON public.booking_reschedule_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_reschedule_booking_id ON public.booking_reschedule_requests(booking_id);

-- ============================================================
-- STEP 13: reviews + auto-update provider rating
-- ============================================================

CREATE TABLE IF NOT EXISTS public.reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES public.bookings(id),
  user_id     UUID NOT NULL REFERENCES public.users(id),
  provider_id UUID NOT NULL REFERENCES public.providers(id),
  service_id  UUID REFERENCES public.services(id) ON DELETE SET NULL,
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  tip_amount  NUMERIC(10,2),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(booking_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_provider_id ON public.reviews(provider_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON public.reviews(user_id);

-- Trigger: keep providers.rating and review_count in sync
CREATE OR REPLACE FUNCTION public.update_provider_rating()
RETURNS TRIGGER AS $$
DECLARE
  target_provider_id UUID;
BEGIN
  target_provider_id := COALESCE(NEW.provider_id, OLD.provider_id);
  UPDATE public.providers
  SET
    rating       = COALESCE((SELECT ROUND(AVG(rating)::numeric, 2) FROM public.reviews WHERE provider_id = target_provider_id), 0),
    review_count = (SELECT COUNT(*) FROM public.reviews WHERE provider_id = target_provider_id),
    updated_at   = NOW()
  WHERE id = target_provider_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_review_change ON public.reviews;
CREATE TRIGGER on_review_change
  AFTER INSERT OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_provider_rating();

-- ============================================================
-- STEP 14: notifications
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN (
                 'booking_confirmed','booking_reminder','payment_success',
                 'booking_cancelled','new_provider','reschedule_request',
                 'reschedule_response','reschedule_confirmed','promotion','review_request'
               )),
  title        TEXT NOT NULL,
  message      TEXT NOT NULL,
  priority     TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  is_read      BOOLEAN DEFAULT FALSE,
  is_actionable BOOLEAN DEFAULT FALSE,
  booking_id   UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  provider_id  UUID REFERENCES public.providers(id) ON DELETE SET NULL,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- Trigger: auto-create notifications when a booking is inserted
CREATE OR REPLACE FUNCTION public.handle_new_booking()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify the user: booking confirmed
  INSERT INTO public.notifications (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
  VALUES (
    NEW.user_id,
    'booking_confirmed',
    'Booking Confirmed',
    'Your booking with ' || NEW.provider_name_snapshot || ' on ' ||
      TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || ' at ' ||
      TO_CHAR(NEW.booking_time, 'HH12:MI AM') || ' is confirmed.',
    'high',
    TRUE,
    NEW.id,
    NEW.provider_id
  );

  -- Notify the provider: new booking received
  INSERT INTO public.notifications (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
  SELECT
    p.user_id,
    'booking_confirmed',
    'New Booking!',
    COALESCE(NEW.customer_name, 'A client') || ' booked ' || NEW.service_name_snapshot ||
      ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',
    'high',
    TRUE,
    NEW.id,
    NEW.provider_id
  FROM public.providers p
  WHERE p.id = NEW.provider_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_booking_created ON public.bookings;
CREATE TRIGGER on_booking_created
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_booking();

-- Trigger: notify when booking is cancelled
CREATE OR REPLACE FUNCTION public.handle_booking_cancelled()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    -- Notify user
    INSERT INTO public.notifications (user_id, type, title, message, priority, is_actionable, booking_id)
    VALUES (
      NEW.user_id,
      'booking_cancelled',
      'Booking Cancelled',
      'Your booking with ' || NEW.provider_name_snapshot || ' on ' ||
        TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || ' has been cancelled.',
      'high',
      FALSE,
      NEW.id
    );

    -- Notify provider
    INSERT INTO public.notifications (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    SELECT
      p.user_id,
      'booking_cancelled',
      'Booking Cancelled',
      COALESCE(NEW.customer_name, 'A client') || ' cancelled their booking for ' ||
        NEW.service_name_snapshot || ' on ' || TO_CHAR(NEW.booking_date, 'DD Mon YYYY') || '.',
      'medium',
      FALSE,
      NEW.id,
      NEW.provider_id
    FROM public.providers p
    WHERE p.id = NEW.provider_id;
  END IF;

  -- Notify user when provider completes booking (prompt review)
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    INSERT INTO public.notifications (user_id, type, title, message, priority, is_actionable, booking_id, provider_id)
    VALUES (
      NEW.user_id,
      'review_request',
      'How was your appointment?',
      'Leave a review for ' || NEW.provider_name_snapshot || '. Your feedback helps others find great providers.',
      'medium',
      TRUE,
      NEW.id,
      NEW.provider_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_booking_status_changed ON public.bookings;
CREATE TRIGGER on_booking_status_changed
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_booking_cancelled();

-- ============================================================
-- STEP 15: bookmarks
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bookmarks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON public.bookmarks(user_id);

-- ============================================================
-- STEP 16: promotions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.promotions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id      UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  discount_text    TEXT,
  discount_percent NUMERIC(5,2),
  discount_amount  NUMERIC(10,2),
  service_category TEXT,
  valid_from       DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until      DATE NOT NULL,
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotions_provider_id ON public.promotions(provider_id);
CREATE INDEX IF NOT EXISTS idx_promotions_valid_until ON public.promotions(valid_until);
CREATE INDEX IF NOT EXISTS idx_promotions_service_category ON public.promotions(service_category);

-- ============================================================
-- STEP 17: event_plans
-- ============================================================

CREATE TABLE IF NOT EXISTS public.event_plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  event_date            DATE NOT NULL,
  goal_portfolio_item_id UUID REFERENCES public.portfolio_items(id) ON DELETE SET NULL,
  is_active             BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS event_plans_updated_at ON public.event_plans;
CREATE TRIGGER event_plans_updated_at
  BEFORE UPDATE ON public.event_plans
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_event_plans_user_id ON public.event_plans(user_id);

-- ============================================================
-- STEP 18: event_tasks
-- ============================================================

CREATE TABLE IF NOT EXISTS public.event_tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_plan_id     UUID NOT NULL REFERENCES public.event_plans(id) ON DELETE CASCADE,
  portfolio_item_id UUID REFERENCES public.portfolio_items(id) ON DELETE SET NULL,
  provider_id       UUID REFERENCES public.providers(id) ON DELETE SET NULL,
  service_id        UUID REFERENCES public.services(id) ON DELETE SET NULL,
  provider_name     TEXT,
  service_name      TEXT,
  category          TEXT,
  scheduled_date    DATE,
  status            TEXT DEFAULT 'pending' CHECK (status IN ('pending','booked','completed')),
  sort_order        INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_event_tasks_event_plan_id ON public.event_tasks(event_plan_id);

-- ============================================================
-- STEP 19: event_checklist_items
-- ============================================================

CREATE TABLE IF NOT EXISTS public.event_checklist_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_plan_id UUID NOT NULL REFERENCES public.event_plans(id) ON DELETE CASCADE,
  text          TEXT NOT NULL,
  category      TEXT,
  is_completed  BOOLEAN DEFAULT FALSE,
  sort_order    INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_event_checklist_event_plan_id ON public.event_checklist_items(event_plan_id);

-- ============================================================
-- STEP 20: payment_methods
-- ============================================================

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  stripe_payment_method_id   TEXT NOT NULL,
  card_brand                 TEXT,
  last_four                  TEXT,
  exp_month                  SMALLINT,
  exp_year                   SMALLINT,
  is_default                 BOOLEAN DEFAULT FALSE,
  created_at                 TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON public.payment_methods(user_id);

-- ============================================================
-- STEP 21: transactions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.transactions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id               UUID NOT NULL REFERENCES public.bookings(id),
  user_id                  UUID NOT NULL REFERENCES public.users(id),
  provider_id              UUID NOT NULL REFERENCES public.providers(id),
  stripe_payment_intent_id TEXT,
  amount                   NUMERIC(10,2) NOT NULL,
  currency                 TEXT DEFAULT 'gbp',
  status                   TEXT NOT NULL CHECK (status IN ('pending','succeeded','failed','refunded')),
  type                     TEXT NOT NULL CHECK (type IN ('full','deposit','remaining','tip','refund')),
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_booking_id ON public.transactions(booking_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_provider_id ON public.transactions(provider_id);

-- ============================================================
-- STEP 22: Enable Row Level Security on all tables
-- ============================================================

ALTER TABLE public.providers                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_specialties        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_images              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_add_ons             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_availability       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_blocked_dates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_add_ons             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_reschedule_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_plans                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_tasks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_checklist_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions                ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STEP 23: RLS Policies
-- ============================================================

-- ── users — public profile (needed for review author names) ──
-- Allow reading name + avatar_url for review display.
-- Sensitive fields (email, phone, dob) are never selected in those queries.
CREATE POLICY "users_public_profile_read" ON public.users
  FOR SELECT USING (TRUE);

-- Users can update their own profile
CREATE POLICY "users_own_update" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Service role / triggers can insert (for on_auth_user_created trigger)
CREATE POLICY "users_service_insert" ON public.users
  FOR INSERT WITH CHECK (TRUE);

-- ── providers ──────────────────────────────────────────────
-- Anyone can read active providers (public browse)
CREATE POLICY "providers_public_read" ON public.providers
  FOR SELECT USING (is_active = TRUE);

-- Providers can manage their own row
CREATE POLICY "providers_owner_all" ON public.providers
  FOR ALL USING (user_id = auth.uid());

-- ── provider_specialties ──────────────────────────────────
CREATE POLICY "specialties_public_read" ON public.provider_specialties
  FOR SELECT USING (TRUE);

CREATE POLICY "specialties_owner_write" ON public.provider_specialties
  FOR ALL USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  );

-- ── services ──────────────────────────────────────────────
CREATE POLICY "services_public_read" ON public.services
  FOR SELECT USING (is_active = TRUE);

CREATE POLICY "services_owner_all" ON public.services
  FOR ALL USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  );

-- ── service_images ────────────────────────────────────────
CREATE POLICY "service_images_public_read" ON public.service_images
  FOR SELECT USING (TRUE);

CREATE POLICY "service_images_owner_write" ON public.service_images
  FOR ALL USING (
    service_id IN (
      SELECT s.id FROM public.services s
      JOIN public.providers p ON p.id = s.provider_id
      WHERE p.user_id = auth.uid()
    )
  );

-- ── service_add_ons ───────────────────────────────────────
CREATE POLICY "add_ons_public_read" ON public.service_add_ons
  FOR SELECT USING (is_active = TRUE);

CREATE POLICY "add_ons_owner_write" ON public.service_add_ons
  FOR ALL USING (
    service_id IN (
      SELECT s.id FROM public.services s
      JOIN public.providers p ON p.id = s.provider_id
      WHERE p.user_id = auth.uid()
    )
  );

-- ── provider_availability ─────────────────────────────────
CREATE POLICY "availability_public_read" ON public.provider_availability
  FOR SELECT USING (TRUE);

CREATE POLICY "availability_owner_write" ON public.provider_availability
  FOR ALL USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  );

-- ── provider_blocked_dates ────────────────────────────────
CREATE POLICY "blocked_dates_public_read" ON public.provider_blocked_dates
  FOR SELECT USING (TRUE);

CREATE POLICY "blocked_dates_owner_write" ON public.provider_blocked_dates
  FOR ALL USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  );

-- ── portfolio_items ───────────────────────────────────────
CREATE POLICY "portfolio_public_read" ON public.portfolio_items
  FOR SELECT USING (TRUE);

CREATE POLICY "portfolio_owner_write" ON public.portfolio_items
  FOR ALL USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  );

-- ── bookings ──────────────────────────────────────────────
-- Users can see their own bookings
CREATE POLICY "bookings_user_read" ON public.bookings
  FOR SELECT USING (user_id = auth.uid());

-- Users can create bookings
CREATE POLICY "bookings_user_insert" ON public.bookings
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can cancel their own bookings (update status only)
CREATE POLICY "bookings_user_update" ON public.bookings
  FOR UPDATE USING (user_id = auth.uid());

-- Providers can see bookings for their provider
CREATE POLICY "bookings_provider_read" ON public.bookings
  FOR SELECT USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  );

-- Providers can update status of their own bookings
CREATE POLICY "bookings_provider_update" ON public.bookings
  FOR UPDATE USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  );

-- ── booking_add_ons ───────────────────────────────────────
CREATE POLICY "booking_add_ons_user_read" ON public.booking_add_ons
  FOR SELECT USING (
    booking_id IN (SELECT id FROM public.bookings WHERE user_id = auth.uid())
  );

CREATE POLICY "booking_add_ons_provider_read" ON public.booking_add_ons
  FOR SELECT USING (
    booking_id IN (
      SELECT b.id FROM public.bookings b
      JOIN public.providers p ON p.id = b.provider_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "booking_add_ons_user_insert" ON public.booking_add_ons
  FOR INSERT WITH CHECK (
    booking_id IN (SELECT id FROM public.bookings WHERE user_id = auth.uid())
  );

-- ── booking_reschedule_requests ───────────────────────────
CREATE POLICY "reschedule_user_all" ON public.booking_reschedule_requests
  FOR ALL USING (
    booking_id IN (SELECT id FROM public.bookings WHERE user_id = auth.uid())
  );

CREATE POLICY "reschedule_provider_all" ON public.booking_reschedule_requests
  FOR ALL USING (
    booking_id IN (
      SELECT b.id FROM public.bookings b
      JOIN public.providers p ON p.id = b.provider_id
      WHERE p.user_id = auth.uid()
    )
  );

-- ── reviews ───────────────────────────────────────────────
CREATE POLICY "reviews_public_read" ON public.reviews
  FOR SELECT USING (TRUE);

CREATE POLICY "reviews_user_insert" ON public.reviews
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "reviews_user_update" ON public.reviews
  FOR UPDATE USING (user_id = auth.uid());

-- ── notifications ─────────────────────────────────────────
CREATE POLICY "notifications_own_read" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notifications_own_update" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

-- ── bookmarks ─────────────────────────────────────────────
CREATE POLICY "bookmarks_own_all" ON public.bookmarks
  FOR ALL USING (user_id = auth.uid());

-- ── promotions ────────────────────────────────────────────
CREATE POLICY "promotions_public_read" ON public.promotions
  FOR SELECT USING (is_active = TRUE AND valid_until >= CURRENT_DATE);

CREATE POLICY "promotions_owner_write" ON public.promotions
  FOR ALL USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  );

-- ── event_plans ───────────────────────────────────────────
CREATE POLICY "event_plans_own_all" ON public.event_plans
  FOR ALL USING (user_id = auth.uid());

-- ── event_tasks ───────────────────────────────────────────
CREATE POLICY "event_tasks_own_all" ON public.event_tasks
  FOR ALL USING (
    event_plan_id IN (SELECT id FROM public.event_plans WHERE user_id = auth.uid())
  );

-- ── event_checklist_items ─────────────────────────────────
CREATE POLICY "checklist_own_all" ON public.event_checklist_items
  FOR ALL USING (
    event_plan_id IN (SELECT id FROM public.event_plans WHERE user_id = auth.uid())
  );

-- ── payment_methods ───────────────────────────────────────
CREATE POLICY "payment_methods_own_all" ON public.payment_methods
  FOR ALL USING (user_id = auth.uid());

-- ── transactions ──────────────────────────────────────────
CREATE POLICY "transactions_user_read" ON public.transactions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "transactions_provider_read" ON public.transactions
  FOR SELECT USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  );

-- ============================================================
-- STEP 24: Enable Realtime on key tables
-- (Run these separately if needed in Supabase dashboard)
-- ============================================================

-- Uncomment and run if Realtime is not already enabled via dashboard:
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_reschedule_requests;

-- ============================================================
-- DONE — All Phase 1 tables, indexes, triggers, and RLS created
-- ============================================================
