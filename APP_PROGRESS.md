# CERVICED — Implementation Status

Reference before touching any feature. Update when something changes state.

---

## Auth & Onboarding

| Feature | Status | Where |
|---|---|---|
| Client sign-up (5 steps) | ✅ Done | `src/screens/auth/SignUpStep1–5Screen.tsx` |
| Provider sign-up (same flow, role = provider) | ✅ Done | `src/screens/auth/SignUpStep1–5Screen.tsx` |
| Email verification | ✅ Done | `src/screens/auth/EmailVerificationScreen.tsx` |
| Forgot/reset password | ✅ Done | `ForgotPasswordScreen`, `ResetPasswordOTPScreen`, `NewPasswordScreen` |
| Biometric login (Face ID / Touch ID) | ✅ Done | `src/services/biometricService.ts`, wired in `AuthContext` + `ProviderAccountScreen` |
| Provider Acuity Scheduling import | ✅ Done | `src/services/acuityTransferService.ts`, wired in `InfoRegScreen` — imports services + pricing via Claude AI. Does **not** import availability hours. Requires `EXPO_PUBLIC_ANTHROPIC_API_KEY`. |
| Welcome email on sign-up | ✅ Done | `src/services/emailService.ts` → Supabase Edge Function `send-email` |

---

## Provider Setup

| Feature | Status | Where |
|---|---|---|
| Provider profile creation / edit | ✅ Done | `src/screens/ProviderMyProfileScreen.tsx`, `providerRegistrationService.ts` |
| Service management (add/edit/delete) | ✅ Done | Provider profile screen |
| Portfolio photos | ✅ Done | `UploadService`, storage bucket `portfolios/` |
| Weekly hours (availability schedule) | ✅ Done | `src/screens/ProviderScheduleScreen.tsx` → `provider_availability` table |
| Blocked dates | ✅ Done | `ProviderScheduleScreen.tsx` → `provider_blocked_dates` table |
| **Auto-accept bookings** | ✅ Done | `src/screens/ProviderAutomationsScreen.tsx` toggle (`autoConfirmBookings`) saves to **both** `user.user_metadata` (`pa_auto_confirm_bookings`) AND `providers.auto_accept_bookings` column. The Postgres trigger `handle_new_booking()` in `supabase/automation_jobs.sql` reads the column and auto-confirms at DB level. **Do not add a second toggle elsewhere.** |
| Promotions | ✅ Done | `src/screens/ProviderPromotionsScreen.tsx`, `databaseService` |
| Intake forms (provider-side) | ✅ Done | `src/screens/ProviderIntakeFormScreen.tsx` |
| Client intake forms (client-side) | ✅ Done | `src/screens/ClientIntakeFormScreen.tsx` |
| Provider automations settings | ✅ Done | `src/screens/ProviderAutomationsScreen.tsx` — client reminders, rebook nudge, review requests, buffer time, deposit requirement, waitlist, max bookings/day |
| Address release policy | ✅ Done | `providers.address_release_policy` column; options set in `InfoRegScreen` |
| Provider analytics / revenue | ✅ Done | `src/screens/ProviderAnalyticsScreen.tsx` — reads from bookings, reviews; revenue derived from `amount_paid` on booking rows |
| Provider clientele view | ✅ Done | `src/screens/ProviderClienteleScreen.tsx` |
| Provider inbox / communications | ✅ Done | `src/screens/ProviderInboxScreen.tsx`, `ProviderCommunicationsScreen.tsx` |

---

## Booking Flow (Client)

| Feature | Status | Where |
|---|---|---|
| Browse providers (live from Supabase) | ✅ Done | `HomeScreen`, `SearchScreen` → `databaseService.getProviders()` |
| Provider profile view | ✅ Done | `ProviderProfileScreen` |
| Portfolio / explore feed | ✅ Done | `ExploreScreen` |
| Add to cart | ✅ Done | `CartContext` |
| Deposit vs full payment toggle (per item) | ✅ Done | `CartScreen` — 20% deposit or full |
| Date / time scheduling in cart | ✅ Done | `ModernBeautyCalendar` → `AvailabilityService.getAvailableSlots()` — reads real provider hours from Supabase; filters already-booked slots |
| Duration-aware slot filtering | ✅ Done | Slots where `start + duration > close_time` are hidden |
| Slot start-time intervals | ✅ Done | `providers.slot_interval_mins` (15/30/60) set in ProviderAutomationsScreen; used by `generateSlotsFromRange()` |
| Booking window limit | ✅ Done | `providers.booking_window_days` — dates beyond this window return empty. Set in ProviderAutomationsScreen |
| Minimum booking notice | ✅ Done | `providers.min_booking_notice_hrs` — same-day slots within this window are hidden |
| Buffer time between bookings | ✅ Done | `providers.buffer_mins` — extends each booked slot's end time during conflict check |
| Checkout validation (re-checks availability) | ✅ Done | `AvailabilityService.isSlotAvailable()` — queries Supabase at checkout, not just local cache |
| Double-booking prevention (DB level) | ✅ Done | Partial unique index on `(provider_id, booking_date, booking_time)` — **must run `supabase/prevent_double_booking.sql`** |
| Customer details review step | ✅ Done | `CartScreen` review modal before payment |
| Payment UI (card / PayPal / Apple / Google) | ⚠️ UI only | `CartScreen` `PaymentModal` — **no real payment gateway**. Card details collected but never charged. `payments` and `earnings` tables are never written to. Stripe fields exist in DB schema but Stripe SDK not installed. |
| Booking created in Supabase | ✅ Done | `BookingContext.createBookingsFromCart()` → `databaseService.createBooking()` |
| Booking confirmation notification (in-app) | ✅ Done | `NotificationService`, wired in `BookingContext` |
| Booking confirmation email | ✅ Done | `BookingContext.createBookingsFromCart()` calls `sendEmail(bookingConfirmationEmail(...))` after each Supabase insert — fire and forget |

---

## Post-Booking

| Feature | Status | Where |
|---|---|---|
| Client bookings list | ✅ Done | `BookingsScreen` — loads from Supabase |
| Reschedule request flow | ✅ Done | `BookingsScreen`, `databaseService.upsertRescheduleRequest` |
| Provider booking detail | ✅ Done | `ProviderBookingDetailScreen` |
| Provider booking history | ✅ Done | `ProviderBookingHistoryScreen` |
| Provider accept / decline booking | ✅ Done | `ProviderBookingDetailScreen` → `updateBookingStatus` |
| Real-time booking status sync | ✅ Done | `BookingContext` subscribes to Supabase realtime on `bookings` table |
| Leave a review | ✅ Done | `BookingsScreen` → `databaseService.submitReview()` + `hasReviewedBooking()` |
| Push notifications (new booking, status change, reminder) | ✅ Done | `pushNotificationService.ts` — token saved to `users.push_token`; Supabase Edge Function `send-push-notification`; DB trigger in `automation_jobs.sql` |

---

## AI Features

| Feature | Status | Where |
|---|---|---|
| Becca AI chat (recommendations, Q&A) | ✅ Done | `BeccaScreen`, `src/services/aiChatService.ts`, `enhancedAIChatService.ts` |
| Chat history persistence | ✅ Done | `beccaStorageService.ts`, `chat_messages` table |
| User learning / personalisation | ✅ Done | `userLearningService.ts` — feeds provider scoring in `HomeScreen` |

---

## Points / Loyalty

| Feature | Status | Where |
|---|---|---|
| Points screen UI | ⚠️ UI only | `PointsScreen.tsx` — shows static balance and earn/redeem options. No `points` table exists, no points are awarded on booking/review, balance is never written or read from DB. |

---

## Infrastructure

| Feature | Status | Notes |
|---|---|---|
| Supabase auth + RLS | ✅ Done | |
| Push notification edge function | ✅ Done | `supabase/functions/send-push-notification` |
| Email edge function | ✅ Done | `supabase/functions/send-email` |
| Auto-accept DB trigger | ✅ Done | `supabase/automation_jobs.sql` — run this if not already applied |
| Double-booking unique index | ✅ Done | `supabase/prevent_double_booking.sql` — **must be run in Supabase SQL editor** |
| Payment gateway (Stripe) | ❌ Not started | DB schema has `stripe_payment_intent_id` / `stripe_payment_method_id` fields ready. No SDK installed. |
| Earnings / payments tables | ❌ Never written | `payments` and `earnings` tables exist in schema but nothing inserts into them |

---

## SQL to run in Supabase (if not already applied)

```
supabase/automation_jobs.sql        — auto-accept trigger, reminder cron jobs
supabase/prevent_double_booking.sql — unique index on (provider_id, booking_date, booking_time)
supabase/scheduling_settings.sql    — booking_window_days, slot_interval_mins, buffer_mins, min_booking_notice_hrs columns
```

## Not yet implemented

| Feature | Notes |
|---|---|
| Multi-staff / multiple team members | One provider = one schedule. Salons with multiple staff need a `staff_members` table, per-staff availability, and booking assigned to a staff member. Not started. |
| Intake form during checkout | `ClientIntakeFormScreen` exists but is not shown as a checkout step. Currently auto-sent after booking via `autoSendIntakeForm` automation. To embed it in checkout: add a step between scheduling and payment in `CartScreen`. |
| Real payment processing | Stripe SDK not installed. UI collects card details but no charge is made. `payments`/`earnings` tables never written. |
| Points / loyalty | `PointsScreen` UI only. No `points` table, no award logic. |
| Advisory lock for concurrent bookings | Unique index covers same start-time races. Overlapping-but-different-start-time races require a Supabase RPC with `pg_advisory_xact_lock`. Add when traffic warrants it. |

All other `.sql` files in `supabase/` have corresponding `IF NOT EXISTS` guards and are safe to re-run.

---

*Last updated: 2026-06-07*
