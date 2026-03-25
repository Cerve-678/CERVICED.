# CERVICED — Full Backend Implementation Plan

**Stack:** Supabase (Auth + PostgreSQL + Storage + Edge Functions + Realtime) · Resend (Email)

---

## TABLE OF CONTENTS

1. [Tech Stack & Services](#1-tech-stack--services)
2. [Supabase Auth](#2-supabase-auth)
3. [Database Schema](#3-database-schema)
4. [Row Level Security (RLS)](#4-row-level-security-rls)
5. [Storage Buckets](#5-storage-buckets)
6. [In-App Notification System](#6-in-app-notification-system)
7. [Email Notifications via Resend](#7-email-notifications-via-resend)
8. [Edge Functions](#8-edge-functions)
9. [Realtime Subscriptions](#9-realtime-subscriptions)
10. [Frontend Integration Checklist](#10-frontend-integration-checklist)
11. [Implementation Order](#11-implementation-order)

---

## 1. Tech Stack & Services

| Service | Purpose |
|---|---|
| **Supabase Auth** | Email/password signup, login, OAuth (Google, Apple), session JWTs, email verification, password reset |
| **Supabase PostgreSQL** | All relational data: users, providers, services, bookings, reviews, notifications, planner events |
| **Supabase Storage** | User avatars, provider logos, provider portfolio images, service images |
| **Supabase Edge Functions** | Booking triggers, email dispatch via Resend, notification fan-out, reminder scheduling |
| **Supabase Realtime** | Live booking status updates, new message alerts, provider availability changes |
| **Resend** | All transactional emails: verification, booking confirmation, reminders, cancellations, receipts |

---

## 2. Supabase Auth

### 2.1 Auth Providers to Enable

- **Email/Password** — primary method, with email confirmation required
- **Google OAuth** — `signInWithOAuth({ provider: 'google' })`
- **Apple OAuth** — `signInWithOAuth({ provider: 'apple' })` (required for iOS App Store)

### 2.2 Auth Flow (Mapped to Frontend Screens)

```
WelcomeScreen
  ├── "Continue with Google"   → supabase.auth.signInWithOAuth({ provider: 'google' })
  ├── "Continue with Apple"    → supabase.auth.signInWithOAuth({ provider: 'apple' })
  └── "Sign in with Email"     → LoginScreen

LoginScreen
  └── Email + Password         → supabase.auth.signInWithPassword({ email, password })
                                   on error: show "Invalid credentials" message
                                   on success: navigate based on user.role

SignUpStep1 → SignUpStep2 → SignUpStep3 → SignUpStep4
  └── On final step:           → supabase.auth.signUp({ email, password, options: { emailRedirectTo } })
                                 then: insert into public.users (profile row)
                                 Supabase sends verification email via Resend automatically

Password Reset
  └── Forgot Password          → supabase.auth.resetPasswordForEmail(email)
                                   Resend sends password reset link
```

### 2.3 Email Confirmation Setup

In Supabase Dashboard → Auth → Email Templates:
- Set **SMTP provider** to Resend
- Resend SMTP: `smtp.resend.com`, port `465`, user `resend`, password = Resend API key
- Customize: Signup confirmation, Magic Link, Password Reset, Email Change templates

### 2.4 Session Management

- On app start: `supabase.auth.getSession()` → restore session
- On auth state change: `supabase.auth.onAuthStateChange()` → update `AuthContext`
- JWT auto-refresh is handled by Supabase client library

### 2.5 Role-Based Access

User role is stored in `public.users.role` (`'client'` or `'provider'`). After login, read the role and route accordingly:
- `role = 'client'` → `TabNavigator` (client tabs)
- `role = 'provider'` → `ProviderTabNavigator` (provider tabs)

---

## 3. Database Schema

### 3.1 `users` table (extends `auth.users`)

This is the public profile linked to Supabase auth.

```sql
CREATE TABLE public.users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  name            TEXT NOT NULL,
  phone           TEXT,
  dob             DATE,
  role            TEXT NOT NULL CHECK (role IN ('client', 'provider')) DEFAULT 'client',
  avatar_url      TEXT,
  login_method    TEXT DEFAULT 'email',   -- 'email', 'google', 'apple'
  fcm_token       TEXT,                   -- Firebase/Expo push notification token
  service_interests TEXT[],               -- e.g. ['HAIR', 'NAILS']
  is_verified     BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

**Trigger:** Auto-create this row on `auth.users` insert:
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'client')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

### 3.2 `providers` table

One row per provider account. Linked to `users.id`.

```sql
CREATE TABLE public.providers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  business_name     TEXT NOT NULL,
  business_email    TEXT,
  service_category  TEXT NOT NULL CHECK (service_category IN ('HAIR','NAILS','MUA','LASHES','BROWS','AESTHETICS','OTHER')),
  custom_service_type TEXT,               -- If category = 'OTHER'
  location          TEXT,
  about             TEXT,
  logo_url          TEXT,
  accent_color      TEXT,                 -- Hex string e.g. '#C2185B'
  gradient_colors   TEXT[],              -- Array of hex strings e.g. ['#FF6B6B','#4ECDC4']
  availability_slots TEXT,               -- Text description e.g. "Mon-Fri 9am-6pm"
  rating            NUMERIC(3,2) DEFAULT 0,
  review_count      INT DEFAULT 0,
  years_experience  INT,
  specialties       TEXT[],
  is_active         BOOLEAN DEFAULT TRUE,
  is_featured       BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 3.3 `provider_availability` table

Weekly availability schedule per provider.

```sql
CREATE TABLE public.provider_availability (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  time_slots  TEXT[],   -- e.g. ['09:00','09:30','10:00','10:30',...]
  is_closed   BOOLEAN DEFAULT FALSE,
  UNIQUE(provider_id, day_of_week)
);
```

---

### 3.4 `services` table

Individual services offered by a provider.

```sql
CREATE TABLE public.services (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,            -- 'HAIR', 'NAILS', etc.
  name        TEXT NOT NULL,
  description TEXT,
  price       NUMERIC(10,2) NOT NULL,
  duration    TEXT NOT NULL,            -- e.g. '45-60 mins'
  images      TEXT[],                  -- Array of storage URLs
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 3.5 `service_addons` table

Add-on options for a service (e.g. "Toner +£10").

```sql
CREATE TABLE public.service_addons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id  UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  price       NUMERIC(10,2) NOT NULL
);
```

---

### 3.6 `portfolio_items` table

Provider portfolio photos shown in Explore and Provider Profile screens.

```sql
CREATE TABLE public.portfolio_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  image_url    TEXT NOT NULL,
  caption      TEXT,
  category     TEXT,           -- 'HAIR', 'NAILS', etc.
  tags         TEXT[],
  aspect_ratio NUMERIC(4,2) DEFAULT 1.0,
  price_label  TEXT,           -- Optional e.g. '£120'
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 3.7 `bookings` table

Core bookings table. Every confirmed appointment.

```sql
CREATE TABLE public.bookings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parties
  client_id             UUID NOT NULL REFERENCES public.users(id),
  provider_id           UUID NOT NULL REFERENCES public.providers(id),
  service_id            UUID REFERENCES public.services(id),

  -- Service snapshot (frozen at booking time)
  service_name          TEXT NOT NULL,
  service_description   TEXT,
  provider_name         TEXT NOT NULL,
  provider_logo_url     TEXT,
  duration              TEXT,
  quantity              INT DEFAULT 1,

  -- Scheduling
  booking_date          DATE NOT NULL,
  booking_time          TIME NOT NULL,
  end_time              TIME,

  -- Location
  address               TEXT,
  latitude              NUMERIC(10,7),
  longitude             NUMERIC(10,7),
  phone                 TEXT,

  -- Status
  status                TEXT NOT NULL DEFAULT 'upcoming'
                          CHECK (status IN ('upcoming','in_progress','completed','cancelled','no_show')),

  -- Payment
  payment_type          TEXT NOT NULL CHECK (payment_type IN ('full','deposit')),
  payment_status        TEXT NOT NULL DEFAULT 'pending'
                          CHECK (payment_status IN ('pending','deposit_paid','paid_in_full','refund_pending','refunded','failed')),
  payment_method        TEXT,           -- 'card', 'apple_pay', 'google_pay'
  transaction_id        TEXT,           -- External payment processor ID
  base_service_price    NUMERIC(10,2),
  addons_total          NUMERIC(10,2) DEFAULT 0,
  subtotal              NUMERIC(10,2),
  service_charge_rate   NUMERIC(5,4) DEFAULT 0.05,
  service_charge_amount NUMERIC(10,2),
  total_before_payment  NUMERIC(10,2),
  deposit_percentage    NUMERIC(5,4),
  deposit_amount        NUMERIC(10,2),
  amount_charged        NUMERIC(10,2) NOT NULL,
  remaining_balance     NUMERIC(10,2) DEFAULT 0,
  payment_confirmed_at  TIMESTAMPTZ,

  -- Group booking
  group_booking_id      UUID,
  is_group_booking      BOOLEAN DEFAULT FALSE,
  group_booking_count   INT DEFAULT 1,

  -- Reschedule
  is_pending_reschedule BOOLEAN DEFAULT FALSE,
  original_date         DATE,
  original_time         TIME,
  reschedule_count      INT DEFAULT 0,
  last_rescheduled_at   TIMESTAMPTZ,
  reschedule_requested_at TIMESTAMPTZ,

  -- Notes
  notes                 TEXT,
  customer_name         TEXT,
  customer_email        TEXT,
  customer_phone        TEXT,

  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 3.8 `booking_addons` table

Add-ons selected for a specific booking.

```sql
CREATE TABLE public.booking_addons (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  addon_id   UUID REFERENCES public.service_addons(id),
  name       TEXT NOT NULL,
  price      NUMERIC(10,2) NOT NULL
);
```

---

### 3.9 `reviews` table

Client reviews on completed bookings.

```sql
CREATE TABLE public.reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES public.bookings(id),
  client_id   UUID NOT NULL REFERENCES public.users(id),
  provider_id UUID NOT NULL REFERENCES public.providers(id),
  service_id  UUID REFERENCES public.services(id),
  rating      INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  service     TEXT,   -- Service name snapshot
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(booking_id, client_id)   -- One review per booking
);
```

**Trigger:** Update `providers.rating` and `providers.review_count` on insert/delete.

```sql
CREATE OR REPLACE FUNCTION update_provider_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.providers
  SET
    rating = (SELECT AVG(rating) FROM public.reviews WHERE provider_id = NEW.provider_id),
    review_count = (SELECT COUNT(*) FROM public.reviews WHERE provider_id = NEW.provider_id),
    updated_at = NOW()
  WHERE id = NEW.provider_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_review_change
  AFTER INSERT OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION update_provider_rating();
```

---

### 3.10 `notifications` table

In-app notifications stored per user. Replaces the current `AsyncStorage` approach.

```sql
CREATE TABLE public.notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN (
                 'booking_confirmed',
                 'booking_reminder',
                 'payment_success',
                 'booking_cancelled',
                 'new_provider',
                 'reschedule_request',
                 'reschedule_provider_response',
                 'reschedule_confirmed',
                 'promotion',
                 'review_request'
               )),
  title        TEXT NOT NULL,
  message      TEXT NOT NULL,
  priority     TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  is_read      BOOLEAN DEFAULT FALSE,
  is_actionable BOOLEAN DEFAULT FALSE,
  booking_id   UUID REFERENCES public.bookings(id),
  provider_id  UUID REFERENCES public.providers(id),
  provider_name TEXT,
  service_name  TEXT,
  metadata     JSONB DEFAULT '{}',   -- Extra data per notification type
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);
```

---

### 3.11 `bookmarks` table

Saved/bookmarked providers and portfolio items by clients.

```sql
CREATE TABLE public.bookmarks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider_id      UUID REFERENCES public.providers(id) ON DELETE CASCADE,
  portfolio_item_id UUID REFERENCES public.portfolio_items(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  CHECK (provider_id IS NOT NULL OR portfolio_item_id IS NOT NULL),
  UNIQUE(user_id, provider_id),
  UNIQUE(user_id, portfolio_item_id)
);
```

---

### 3.12 `planner_events` table

Event planner items (from Explore screen, "Plan" tab).

```sql
CREATE TABLE public.planner_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  event_date    DATE NOT NULL,
  goal_image_id UUID REFERENCES public.portfolio_items(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 3.13 `planner_tasks` table

Individual tasks within a planner event.

```sql
CREATE TABLE public.planner_tasks (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id           UUID NOT NULL REFERENCES public.planner_events(id) ON DELETE CASCADE,
  portfolio_item_id  UUID REFERENCES public.portfolio_items(id),
  provider_id        UUID REFERENCES public.providers(id),
  service_name       TEXT NOT NULL,
  scheduled_date     DATE,
  status             TEXT DEFAULT 'planned' CHECK (status IN ('planned','scheduled','booked','completed')),
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 3.14 `planner_checklist_items` table

Checklist items within a planner event (e.g. "Buy satin bonnet").

```sql
CREATE TABLE public.planner_checklist_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES public.planner_events(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  category   TEXT,
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 3.15 `reschedule_requests` table

Tracks reschedule back-and-forth between client and provider.

```sql
CREATE TABLE public.reschedule_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id           UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  client_id            UUID NOT NULL REFERENCES public.users(id),
  provider_id          UUID NOT NULL REFERENCES public.providers(id),
  status               TEXT DEFAULT 'pending' CHECK (status IN ('pending','provider_responded','confirmed','rejected')),
  requested_dates      TEXT[],           -- Client's preferred dates ['2026-04-01','2026-04-02']
  provider_available_dates JSONB,        -- Provider's response: [{date, times[]}]
  client_selected_date DATE,
  client_selected_time TIME,
  requested_at         TIMESTAMPTZ DEFAULT NOW(),
  provider_responded_at TIMESTAMPTZ,
  confirmed_at         TIMESTAMPTZ
);
```

---

### 3.16 `promotions` table (optional, Phase 2)

Provider-created promotions shown in notifications and home screen.

```sql
CREATE TABLE public.promotions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  message      TEXT NOT NULL,
  discount_pct INT,
  valid_from   DATE,
  valid_until  DATE,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. Row Level Security (RLS)

Enable RLS on all tables. Below are the policies.

### `users`
```sql
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "users_read_own" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Service role can insert (for trigger)
CREATE POLICY "users_insert_service" ON public.users
  FOR INSERT WITH CHECK (true);
```

### `providers`
```sql
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read providers (browse)
CREATE POLICY "providers_read_any" ON public.providers
  FOR SELECT USING (auth.role() = 'authenticated');

-- Provider can only update their own profile
CREATE POLICY "providers_update_own" ON public.providers
  FOR UPDATE USING (
    auth.uid() = user_id
  );

-- Provider can insert their own profile
CREATE POLICY "providers_insert_own" ON public.providers
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

### `services`
```sql
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- Anyone can read active services
CREATE POLICY "services_read_any" ON public.services
  FOR SELECT USING (is_active = true AND auth.role() = 'authenticated');

-- Provider can manage their own services
CREATE POLICY "services_provider_write" ON public.services
  FOR ALL USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  );
```

### `bookings`
```sql
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Client can see their own bookings
CREATE POLICY "bookings_client_read" ON public.bookings
  FOR SELECT USING (client_id = auth.uid());

-- Provider can see bookings for their business
CREATE POLICY "bookings_provider_read" ON public.bookings
  FOR SELECT USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  );

-- Client can insert a booking
CREATE POLICY "bookings_client_insert" ON public.bookings
  FOR INSERT WITH CHECK (client_id = auth.uid());

-- Client can cancel their own upcoming booking
CREATE POLICY "bookings_client_cancel" ON public.bookings
  FOR UPDATE USING (
    client_id = auth.uid() AND status = 'upcoming'
  );

-- Provider can update status of their bookings
CREATE POLICY "bookings_provider_update" ON public.bookings
  FOR UPDATE USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  );
```

### `notifications`
```sql
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "notifications_read_own" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

-- Users can mark their own notifications as read
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

-- Edge functions (service role) can insert notifications
CREATE POLICY "notifications_service_insert" ON public.notifications
  FOR INSERT WITH CHECK (true);
```

### `reviews`
```sql
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read reviews
CREATE POLICY "reviews_read_any" ON public.reviews
  FOR SELECT USING (auth.role() = 'authenticated');

-- Client can insert review on their completed booking
CREATE POLICY "reviews_client_insert" ON public.reviews
  FOR INSERT WITH CHECK (
    client_id = auth.uid() AND
    booking_id IN (SELECT id FROM public.bookings WHERE client_id = auth.uid() AND status = 'completed')
  );
```

### `bookmarks`
```sql
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bookmarks_own" ON public.bookmarks
  FOR ALL USING (user_id = auth.uid());
```

### `portfolio_items`
```sql
ALTER TABLE public.portfolio_items ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read portfolio items
CREATE POLICY "portfolio_read_any" ON public.portfolio_items
  FOR SELECT USING (auth.role() = 'authenticated');

-- Provider can manage their own portfolio
CREATE POLICY "portfolio_provider_write" ON public.portfolio_items
  FOR ALL USING (
    provider_id IN (SELECT id FROM public.providers WHERE user_id = auth.uid())
  );
```

### `planner_events`, `planner_tasks`, `planner_checklist_items`
```sql
-- All planner tables: users own their data
ALTER TABLE public.planner_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "planner_events_own" ON public.planner_events
  FOR ALL USING (user_id = auth.uid());

ALTER TABLE public.planner_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "planner_tasks_own" ON public.planner_tasks
  FOR ALL USING (
    event_id IN (SELECT id FROM public.planner_events WHERE user_id = auth.uid())
  );

ALTER TABLE public.planner_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "planner_checklist_own" ON public.planner_checklist_items
  FOR ALL USING (
    event_id IN (SELECT id FROM public.planner_events WHERE user_id = auth.uid())
  );
```

---

## 5. Storage Buckets

Create these buckets in Supabase Storage:

| Bucket | Public | Purpose |
|---|---|---|
| `avatars` | No (signed URLs) | User profile pictures |
| `provider-logos` | Yes | Provider business logos shown in browse |
| `provider-portfolio` | Yes | Provider portfolio images (Explore screen, masonry grid) |
| `service-images` | Yes | Per-service photos shown in cart/provider profile |

### Storage Policies

**`avatars`** — only owner can read/write:
```sql
CREATE POLICY "avatars_owner" ON storage.objects
  FOR ALL USING (
    bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

**`provider-logos` / `provider-portfolio` / `service-images`** — public read, provider write:
```sql
-- Public read
CREATE POLICY "provider_media_public_read" ON storage.objects
  FOR SELECT USING (bucket_id IN ('provider-logos','provider-portfolio','service-images'));

-- Provider write own folder
CREATE POLICY "provider_media_write" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id IN ('provider-logos','provider-portfolio','service-images') AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
```

### Upload Paths

```
avatars/{user_id}/avatar.jpg
provider-logos/{provider_id}/logo.jpg
provider-portfolio/{provider_id}/{item_id}.jpg
service-images/{provider_id}/{service_id}/{image_index}.jpg
```

---

## 6. In-App Notification System

### 6.1 How It Works

All notifications are stored in the `public.notifications` table and delivered in real-time via Supabase Realtime. The frontend subscribes to changes on `notifications` filtered by `user_id = auth.uid()`.

### 6.2 Notification Types & Triggers

| Type | Trigger Event | Who Receives |
|---|---|---|
| `booking_confirmed` | New booking row inserted | Client + Provider |
| `payment_success` | `payment_status` updated to `paid_in_full` or `deposit_paid` | Client |
| `booking_reminder` | Scheduled Edge Function (24h + 2h before booking) | Client |
| `booking_cancelled` | `status` updated to `cancelled` | Client + Provider |
| `reschedule_request` | New `reschedule_requests` row inserted | Provider |
| `reschedule_provider_response` | Provider updates `reschedule_requests.status = 'provider_responded'` | Client |
| `reschedule_confirmed` | `reschedule_requests.status = 'confirmed'` | Client + Provider |
| `review_request` | Booking `status` updated to `completed` | Client (24h after) |
| `new_provider` | New `providers` row inserted (is_featured = true) | All clients matching service_interests |
| `promotion` | New `promotions` row inserted | Clients who bookmarked the provider |

### 6.3 Notification Insertion (via Edge Function or DB Trigger)

The `notify_booking_confirmed` Edge Function (example for booking_confirmed):

```typescript
// Insert notification for client
await supabase.from('notifications').insert({
  user_id: booking.client_id,
  type: 'booking_confirmed',
  title: 'Booking Confirmed!',
  message: `Your ${booking.service_name} with ${booking.provider_name} is confirmed for ${booking.booking_date} at ${booking.booking_time}.`,
  priority: 'high',
  is_actionable: true,
  booking_id: booking.id,
  provider_id: booking.provider_id,
  provider_name: booking.provider_name,
  service_name: booking.service_name,
});

// Insert notification for provider
await supabase.from('notifications').insert({
  user_id: provider.user_id,
  type: 'booking_confirmed',
  title: 'New Booking!',
  message: `${booking.customer_name} booked ${booking.service_name} for ${booking.booking_date} at ${booking.booking_time}.`,
  priority: 'high',
  is_actionable: true,
  booking_id: booking.id,
  provider_id: booking.provider_id,
  service_name: booking.service_name,
});
```

### 6.4 Frontend: Replace `NotificationService` AsyncStorage with Supabase

**Current:** `NotificationService` reads/writes to `AsyncStorage`  
**New:** Query `supabase.from('notifications').select(...)` + Realtime subscription

```typescript
// In NotificationsScreen or a global hook
const subscription = supabase
  .channel('notifications')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
    filter: `user_id=eq.${user.id}`,
  }, (payload) => {
    setNotifications(prev => [payload.new, ...prev]);
    // Show push notification banner
  })
  .subscribe();
```

---

## 7. Email Notifications via Resend

### 7.1 Setup

1. Create Resend account → get API key
2. Add domain DNS records in Resend for `cerviced.com` (or your domain)
3. Set `RESEND_API_KEY` in Supabase Edge Function secrets
4. Configure Supabase SMTP to use Resend for auth emails

### 7.2 Resend API call (inside Edge Function)

```typescript
import { Resend } from 'npm:resend';
const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

await resend.emails.send({
  from: 'CERVICED <bookings@cerviced.com>',
  to: clientEmail,
  subject: 'Your booking is confirmed!',
  html: bookingConfirmedTemplate(booking),
});
```

### 7.3 Email Templates Required

#### 1. Email Verification (Supabase Auth — auto-sent)
- Trigger: user signs up
- Content: "Welcome to CERVICED! Verify your email address."
- Configured in Supabase Dashboard → Auth → Email Templates

#### 2. Password Reset (Supabase Auth — auto-sent)
- Trigger: `supabase.auth.resetPasswordForEmail()`
- Content: "Reset your CERVICED password"
- Configured in Supabase Dashboard → Auth → Email Templates

#### 3. Booking Confirmation (Resend)
- Trigger: new booking created
- Sent to: **Client** + **Provider**
- Content:
  - Client email: booking details (service, provider, date, time, address, amount paid, remaining balance if deposit)
  - Provider email: new appointment details (client name, service, date, time, phone)

#### 4. Booking Reminder (Resend — scheduled)
- Trigger: 24 hours before booking AND 2 hours before booking
- Sent to: Client
- Content: "Your appointment tomorrow at [time] with [provider]. Address: [address]"

#### 5. Booking Cancellation (Resend)
- Trigger: booking status changes to `cancelled`
- Sent to: Client + Provider
- Content: cancellation details, refund info if applicable

#### 6. Reschedule Request (Resend)
- Trigger: client submits reschedule request
- Sent to: Provider
- Content: "Client [name] wants to reschedule their [service] appointment. Please respond with your availability."

#### 7. Reschedule Response (Resend)
- Trigger: provider provides new availability
- Sent to: Client
- Content: "[Provider] has responded to your reschedule request. New available times: [dates]. Open the app to confirm."

#### 8. Reschedule Confirmed (Resend)
- Trigger: client selects new time, reschedule confirmed
- Sent to: Client + Provider
- Content: "Your appointment has been rescheduled to [new date] at [new time]."

#### 9. Review Request (Resend)
- Trigger: booking completes, sent 24 hours later
- Sent to: Client only
- Content: "How was your experience with [provider]? Leave a review."

#### 10. Payment Receipt (Resend)
- Trigger: payment confirmed
- Sent to: Client
- Content: itemized receipt — service, add-ons, service charge, deposit paid, remaining balance

#### 11. Welcome Email (Resend)
- Trigger: signup complete (after email verified)
- Sent to: New client or new provider
- Content: onboarding tips, getting started guide

---

## 8. Edge Functions

All deployed as Supabase Edge Functions (Deno). Set these environment secrets:
- `RESEND_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`

### 8.1 `on-booking-created`

**Trigger:** HTTP call from frontend after booking is inserted  
**OR:** Postgres webhook trigger on `bookings` INSERT

**Does:**
1. Fetch full booking + client + provider data
2. Insert `booking_confirmed` notification for client
3. Insert `booking_confirmed` notification for provider
4. Send booking confirmation email to client (Resend)
5. Send new appointment email to provider (Resend)
6. Send payment receipt email to client (Resend)
7. Schedule reminder jobs (via `pg_cron` or Supabase's scheduled functions)

### 8.2 `on-booking-status-changed`

**Trigger:** Postgres webhook on `bookings` UPDATE where `status` changes

**Does:**
- If status → `cancelled`: send cancellation emails + notifications
- If status → `completed`: schedule `review_request` notification + email for 24h later

### 8.3 `on-reschedule-request`

**Trigger:** New row in `reschedule_requests`

**Does:**
1. Insert `reschedule_request` notification for provider
2. Send reschedule request email to provider (Resend)

### 8.4 `on-reschedule-response`

**Trigger:** `reschedule_requests.status` updated to `provider_responded`

**Does:**
1. Insert `reschedule_provider_response` notification for client
2. Send reschedule response email to client (Resend)

### 8.5 `on-reschedule-confirmed`

**Trigger:** `reschedule_requests.status` updated to `confirmed`

**Does:**
1. Update original booking's date/time
2. Insert `reschedule_confirmed` notification for client + provider
3. Send reschedule confirmed emails (Resend)

### 8.6 `send-booking-reminder` (scheduled)

**Trigger:** Cron job (`pg_cron`) — runs every 30 minutes  
**Logic:** Find bookings where `booking_date + booking_time` is between now+23h and now+25h AND `status = 'upcoming'`

**Does:**
1. Send 24h reminder email to client (Resend)
2. Insert `booking_reminder` notification

Runs again for 2h reminders.

### 8.7 `send-review-request` (scheduled)

**Trigger:** Cron job — runs every hour  
**Logic:** Find bookings completed 24h ago where no review exists

**Does:**
1. Insert `review_request` notification for client
2. Send review request email (Resend)

### 8.8 `on-new-provider`

**Trigger:** New `providers` row with `is_featured = true`

**Does:**
1. Find all clients whose `service_interests` match `providers.service_category`
2. Insert `new_provider` notification for each matching client

---

## 9. Realtime Subscriptions

Use Supabase Realtime in the frontend for live updates without polling.

### 9.1 Notifications (global, all screens)

Subscribe on login, unsubscribe on logout:

```typescript
supabase.channel('user-notifications')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
    filter: `user_id=eq.${userId}`,
  }, handleNewNotification)
  .subscribe();
```

### 9.2 Booking Status (BookingsScreen + ProviderHomeScreen)

```typescript
supabase.channel('booking-updates')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'bookings',
    filter: `client_id=eq.${userId}`,  // or provider_id for provider
  }, handleBookingUpdate)
  .subscribe();
```

### 9.3 Reschedule Requests (ProviderHomeScreen)

```typescript
supabase.channel('reschedule-requests')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'reschedule_requests',
    filter: `provider_id=eq.${providerId}`,
  }, handleRescheduleRequest)
  .subscribe();
```

---

## 10. Frontend Integration Checklist

### Auth (replace `AuthContext` local storage)

- [ ] Install `@supabase/supabase-js`
- [ ] Create `src/lib/supabase.ts` with Supabase client
- [ ] Update `AuthContext.tsx`: replace AsyncStorage auth with `supabase.auth`
- [ ] Update `LoginScreen.tsx`: call `supabase.auth.signInWithPassword()`
- [ ] Update `WelcomeScreen.tsx`: wire Google/Apple OAuth buttons
- [ ] Update `SignUpStep4Screen.tsx`: call `supabase.auth.signUp()` → insert `users` row
- [ ] Add email verification gate screen (show after signup, before app entry)
- [ ] Add forgot password flow → `supabase.auth.resetPasswordForEmail()`
- [ ] Update `UserProfileScreen.tsx`: call `supabase.auth.updateUser()` for password changes

### Providers

- [ ] `HomeScreen.tsx`: replace mock data with `supabase.from('providers').select(...)`
- [ ] `ExploreScreen.tsx`: replace mock portfolio with `supabase.from('portfolio_items').select(...)`
- [ ] `SearchScreen.tsx`: use Supabase `.ilike()` / `.contains()` for search/filter
- [ ] `ProviderProfileScreen.tsx`: fetch provider + services + portfolio + reviews from DB
- [ ] `InfoRegScreen.tsx` (provider): upsert `providers` row + upload logo/images to Storage

### Bookings

- [ ] `CartScreen.tsx`: on checkout, `supabase.from('bookings').insert(...)` + call `on-booking-created` Edge Function
- [ ] `BookingsScreen.tsx`: replace AsyncStorage with `supabase.from('bookings').select(...).eq('client_id', userId)`
- [ ] `ProviderHomeScreen.tsx`: fetch bookings with `provider_id` filter
- [ ] `ProviderBookingDetailScreen.tsx`: update booking status via `supabase.from('bookings').update(...)`

### Reschedule

- [ ] `BookingsScreen.tsx` reschedule flow: insert into `reschedule_requests`
- [ ] `ProviderHomeScreen.tsx`: read + respond to `reschedule_requests`

### Notifications

- [ ] `NotificationsScreen.tsx`: replace `NotificationService` with Supabase query
- [ ] Global: add Realtime subscription for live notification badge count
- [ ] Update `NotificationService.ts` to be a thin wrapper over Supabase

### Bookmarks

- [ ] `useBookmarkStore.ts`: replace AsyncStorage with `supabase.from('bookmarks')`
- [ ] `BookmarkedProvidersScreen.tsx`: fetch from bookmarks + join providers

### Reviews

- [ ] `ProviderProfileScreen.tsx`: load reviews from `supabase.from('reviews')`
- [ ] Add review submission flow after `review_request` notification

### Planner

- [ ] `usePlannerStore.ts`: replace AsyncStorage with `supabase.from('planner_events')`

---

## 11. Implementation Order

Work in this order to have a working app as fast as possible:

### Phase 1 — Auth (everything blocked on this)
1. Set up Supabase project, get `SUPABASE_URL` and `SUPABASE_ANON_KEY`
2. Create `src/lib/supabase.ts`
3. Create `users` table + trigger
4. Wire `AuthContext` to Supabase Auth
5. Update LoginScreen, SignUpStep1–4, WelcomeScreen (OAuth)
6. Configure Resend SMTP in Supabase for verification + reset emails
7. Add email verification screen

### Phase 2 — Core Data (browse + profiles)
1. Create `providers`, `provider_availability`, `services`, `service_addons` tables
2. Create `portfolio_items` table
3. Set up Storage buckets
4. Enable RLS
5. Wire HomeScreen, ExploreScreen, SearchScreen, ProviderProfileScreen to Supabase

### Phase 3 — Bookings (core revenue flow)
1. Create `bookings`, `booking_addons` tables
2. Wire CartScreen checkout → insert booking
3. Wire BookingsScreen → fetch client bookings
4. Wire ProviderHomeScreen → fetch provider bookings
5. Deploy `on-booking-created` Edge Function
6. Send booking confirmation emails + notifications

### Phase 4 — Notifications & Emails
1. Create `notifications` table
2. Replace `NotificationService` AsyncStorage with Supabase
3. Add Realtime subscription
4. Deploy remaining Edge Functions (reminders, cancellations, reschedule)
5. Build all Resend email templates

### Phase 5 — Social + Planner (polish)
1. Create `reviews` table + provider rating trigger
2. Wire review submission
3. Create `bookmarks` table, wire `useBookmarkStore`
4. Create `planner_events` / `planner_tasks` / `planner_checklist_items`, wire `usePlannerStore`
5. Deploy `on-new-provider` + `send-review-request` Edge Functions

### Phase 6 — Push Notifications (optional)
1. Integrate Expo Push Notifications (or Firebase FCM)
2. Store `fcm_token` in `users` table on login
3. Edge Functions call FCM/Expo API alongside DB notification inserts

---

## Summary Table

| Feature | Tables | Edge Functions | Emails |
|---|---|---|---|
| Signup / Login | `users` | — | Welcome, Verification |
| Password Reset | — | — | Reset link |
| Browse Providers | `providers`, `portfolio_items` | — | — |
| Search / Filter | `providers`, `services` | — | — |
| Provider Profile | `providers`, `services`, `portfolio_items`, `reviews` | — | — |
| Booking / Checkout | `bookings`, `booking_addons` | `on-booking-created` | Confirmation, Receipt |
| Booking Management | `bookings` | `on-booking-status-changed` | Cancellation |
| Reminders | `bookings` | `send-booking-reminder` | 24h + 2h reminder |
| Reschedule | `reschedule_requests` | `on-reschedule-*` | Request, Response, Confirmed |
| Reviews | `reviews` | `send-review-request` | Review request |
| Bookmarks | `bookmarks` | — | — |
| In-App Notifications | `notifications` | All above | — |
| Event Planner | `planner_events`, `planner_tasks`, `planner_checklist_items` | — | — |
| Provider Profile Setup | `providers`, `services`, `service_addons` | — | — |
| Promotions | `promotions` | `on-new-provider` | Promotion blast |
