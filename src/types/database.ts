// Auto-generated Supabase database types for CERVICED
// Keep in sync with supabase/phase1_schema.sql

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// ── Enums ────────────────────────────────────────────────

export type UserRole = 'user' | 'provider';

export type ServiceCategory =
  | 'HAIR' | 'NAILS' | 'LASHES' | 'BROWS'
  | 'MUA' | 'AESTHETICS' | 'MALE' | 'KIDS' | 'OTHER';

export type BookingStatus =
  | 'pending' | 'confirmed' | 'in_progress'
  | 'completed' | 'cancelled' | 'no_show';

export type PaymentType = 'full' | 'deposit';

export type PaymentStatus =
  | 'pending' | 'deposit_paid' | 'fully_paid' | 'refunded' | 'failed';

export type NotificationType =
  | 'booking_pending'    | 'booking_confirmed'  | 'booking_declined'
  | 'booking_cancelled'  | 'booking_reminder'   | 'booking_in_progress'
  | 'no_show'            | 'payment_success'    | 'new_provider'
  | 'reschedule_request' | 'reschedule_response'| 'reschedule_confirmed'
  | 'review_request'     | 'review_received'    | 'promotion';

export type NotificationPriority = 'high' | 'medium' | 'low';

export type RescheduleStatus =
  | 'pending' | 'provider_responded' | 'confirmed' | 'rejected';

export type EventTaskStatus = 'pending' | 'booked' | 'completed';

export type TransactionStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';

export type TransactionType = 'full' | 'deposit' | 'remaining' | 'tip' | 'refund';

// ── Table Row Types ──────────────────────────────────────

export interface DbUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  dob: string | null;
  role: UserRole;
  login_method: string | null;
  business_name: string | null;
  business_email: string | null;
  avatar_url: string | null;
  expo_push_token: string | null;
  service_interests: string[] | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbProvider {
  id: string;
  user_id: string;
  slug: string;
  display_name: string;
  service_category: ServiceCategory;
  custom_service_type: string | null;
  location_text: string | null;
  latitude: number | null;
  longitude: number | null;
  about_text: string | null;
  slots_text: string | null;
  logo_url: string | null;
  gradient: string[] | null;
  accent_color: string | null;
  phone: string | null;
  email: string | null;
  rating: number;
  review_count: number;
  years_experience: number | null;
  is_active: boolean;
  is_featured: boolean;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbProviderSpecialty {
  id: string;
  provider_id: string;
  specialty: string;
}

export interface DbService {
  id: string;
  provider_id: string;
  category_name: string;
  name: string;
  description: string | null;
  price: number;
  price_max: number | null;
  duration_minutes: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface DbServiceImage {
  id: string;
  service_id: string;
  url: string;
  sort_order: number;
}

export interface DbServiceAddOn {
  id: string;
  service_id: string;
  name: string;
  price: number;
  description: string | null;
  is_active: boolean;
}

export interface DbProviderAvailability {
  id: string;
  provider_id: string;
  day_of_week: number; // 0=Sun, 6=Sat
  open_time: string;   // 'HH:MM:SS'
  close_time: string;
  is_closed: boolean;
}

export interface DbProviderBlockedDate {
  id: string;
  provider_id: string;
  blocked_date: string; // 'YYYY-MM-DD'
  reason: string | null;
}

export interface DbPortfolioItem {
  id: string;
  provider_id: string;
  service_id: string | null;
  image_url: string;
  caption: string | null;
  category: string | null;
  tags: string[] | null;
  price: number | null;
  aspect_ratio: number;
  is_featured: boolean;
  created_at: string;
}

export interface DbBooking {
  id: string;
  user_id: string;
  provider_id: string;
  service_id: string | null;
  status: BookingStatus;
  booking_date: string;   // 'YYYY-MM-DD'
  booking_time: string;   // 'HH:MM:SS'
  end_time: string | null;
  notes: string | null;
  booking_instructions: string | null;
  payment_type: PaymentType;
  base_price: number;
  add_ons_total: number;
  service_charge: number;
  deposit_amount: number;
  amount_paid: number;
  remaining_balance: number;
  payment_status: PaymentStatus;
  payment_method: string | null;
  payment_intent_id: string | null;
  is_group_booking: boolean;
  group_booking_id: string | null;
  group_booking_count: number;
  provider_name_snapshot: string;
  service_name_snapshot: string;
  provider_logo_snapshot: string | null;
  provider_address_snapshot: string | null;
  provider_phone_snapshot: string | null;
  provider_coordinates: { lat: number; lng: number } | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbBookingAddOn {
  id: string;
  booking_id: string;
  add_on_id: string | null;
  name_snapshot: string;
  price_snapshot: number;
}

export interface DbBookingRescheduleRequest {
  id: string;
  booking_id: string;
  requested_by: 'user' | 'provider';
  original_date: string;
  original_time: string;
  requested_dates: string[] | null;
  provider_available_slots: { date: string; times: string[] }[] | null;
  status: RescheduleStatus;
  reschedule_count: number;
  created_at: string;
  updated_at: string;
}

export interface DbReview {
  id: string;
  booking_id: string;
  user_id: string;
  provider_id: string;
  service_id: string | null;
  rating: number;
  comment: string | null;
  tip_amount: number | null;
  created_at: string;
}

export interface DbNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  is_read: boolean;
  is_actionable: boolean;
  booking_id: string | null;
  provider_id: string | null;
  target_role: 'user' | 'provider';
  metadata: Json;
  created_at: string;
}

export interface DbBookmark {
  id: string;
  user_id: string;
  provider_id: string;
  created_at: string;
}

export interface DbPromotion {
  id: string;
  provider_id: string;
  title: string;
  description: string | null;
  discount_text: string | null;
  discount_percent: number | null;
  discount_amount: number | null;
  service_category: string | null;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
  created_at: string;
}

export interface DbEventPlan {
  id: string;
  user_id: string;
  name: string;
  event_date: string;
  goal_portfolio_item_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbEventTask {
  id: string;
  event_plan_id: string;
  portfolio_item_id: string | null;
  provider_id: string | null;
  service_id: string | null;
  provider_name: string | null;
  service_name: string | null;
  category: string | null;
  scheduled_date: string | null;
  status: EventTaskStatus;
  sort_order: number;
}

export interface DbEventChecklistItem {
  id: string;
  event_plan_id: string;
  text: string;
  category: string | null;
  is_completed: boolean;
  sort_order: number;
}

export interface DbPaymentMethod {
  id: string;
  user_id: string;
  stripe_payment_method_id: string;
  card_brand: string | null;
  last_four: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
  created_at: string;
}

export interface DbTransaction {
  id: string;
  booking_id: string;
  user_id: string;
  provider_id: string;
  stripe_payment_intent_id: string | null;
  amount: number;
  currency: string;
  status: TransactionStatus;
  type: TransactionType;
  created_at: string;
}

// ── Joined / enriched types used by the app ─────────────

/** Provider with its services and add-ons — used by ProviderProfileScreen */
export interface ProviderWithServices extends DbProvider {
  services: (DbService & {
    images: DbServiceImage[];
    add_ons: DbServiceAddOn[];
  })[];
  specialties: DbProviderSpecialty[];
}

/** Portfolio item with provider info — used by ExploreScreen */
export interface PortfolioItemWithProvider extends DbPortfolioItem {
  provider: Pick<DbProvider, 'id' | 'slug' | 'display_name' | 'service_category' | 'logo_url'>;
}

/** Booking with add-ons — used by BookingsScreen and ProviderHomeScreen */
export interface BookingWithAddOns extends DbBooking {
  add_ons: DbBookingAddOn[];
  provider_info?: { service_category: string } | null;
}

/** Review with user name — used by ProviderProfileScreen */
export interface ReviewWithUser extends DbReview {
  user: Pick<DbUser, 'name' | 'avatar_url'>;
}

/** Notification with optional booking/provider data */
export interface NotificationWithContext extends DbNotification {
  booking?: Pick<DbBooking, 'booking_date' | 'booking_time' | 'service_name_snapshot'> | null;
  provider?: Pick<DbProvider, 'slug' | 'display_name' | 'logo_url'> | null;
}
