// Auto-generated Supabase database types for CERVICED
// Keep in sync with supabase/phase1_schema.sql

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

// ── Enums ────────────────────────────────────────────────

export type UserRole = "user" | "provider";

/**
 * Where a provider works, and therefore whose address the appointment happens
 * at. This is the DB enum (`users_business_type_check`, and the matching
 * constraint on `providers.business_type`) and the ONE declaration of it —
 * every other module imports this rather than restating the union, so adding
 * a fifth type is a single edit here plus the option table in
 * `src/features/business-details/options.ts` that TypeScript will then force
 * you to complete.
 *
 * - salon / studio: the client travels to commercial premises.
 * - home_based:     the client travels to the provider's home.
 * - mobile:         the PROVIDER travels; the venue is the client's address.
 *
 * Nullable everywhere it appears: a provider row can predate the field or
 * simply not have answered yet, and "unknown" is not the same as any of the
 * four (see appointmentVenue in features/business-details/options.ts).
 */
export type BusinessType = "salon" | "studio" | "home_based" | "mobile";

export type ServiceCategory =
  | "HAIR"
  | "NAILS"
  | "LASHES"
  | "BROWS"
  | "MUA"
  | "AESTHETICS"
  | "MALE"
  | "KIDS"
  | "OTHER";

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show"
  | "provider_no_show";

export type PaymentType = "full" | "deposit";

export type PaymentStatus =
  | "pending"
  | "deposit_paid"
  | "fully_paid"
  | "refunded"
  | "failed";

export type NotificationType =
  | "booking_pending"
  | "booking_confirmed"
  | "booking_declined"
  | "booking_cancelled"
  | "booking_reminder"
  | "booking_in_progress"
  | "no_show"
  | "provider_no_show"
  | "payment_success"
  | "new_provider"
  | "reschedule_request"
  | "reschedule_provider_response"
  | "reschedule_confirmed"
  | "reschedule_declined"
  /** Nobody answered in time — distinct from _declined, which means somebody
   *  decided. Inserted only by process_expire_stale_reschedule_requests(). */
  | "reschedule_expired"
  | "cancel_window_closing"
  | "review_request"
  | "review_received"
  | "promotion"
  | "provider_message"
  | "intake_form_reminder"
  | "waitlist_slot_available"
  | "new_message"
  | "announcement" // provider broadcast to clients (client-facing)
  | "intake_form_received" // provider sent client a form to fill (client-facing)
  | "intake_form_completed" // client sent a filled form back (provider-facing)
  | "info_pack_received" // provider sent client prep/aftercare info (client-facing)
  | "address_released" // booking address is now visible to the client
  | "birthday_greeting" // provider's automated birthday message (client-facing)
  | "post_appt_check_in" // provider's automated post-appointment check-in (client-facing)
  | "rebooking_nudge" // "it's been a while" nudge to rebook (client-facing)
  | "daily_recap" // provider's automated today's-schedule summary (provider-facing)
  | "schedule_fully_booked" // provider's whole calendar has no openings in their alert window (provider-facing)
  | "pending_booking_reminder" // booking still pending at T-24h, nudging the provider to confirm/decline (provider-facing)
  | "points_earned"; // client earned loyalty points (client-facing)

export type NotificationPriority = "high" | "medium" | "low";

export type RescheduleStatus =
  | "pending"
  | "provider_responded"
  | "confirmed"
  | "rejected"
  | "cancelled";

export type EventTaskStatus = "pending" | "booked" | "completed";

export type TransactionStatus = "pending" | "succeeded" | "failed" | "refunded";

export type TransactionType =
  | "full"
  | "deposit"
  | "remaining"
  | "tip"
  | "refund";

// ── Table Row Types ──────────────────────────────────────

export interface DbUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  dob: string | null;
  // The client hat's own storage (migration 20260823105742). Do NOT re-derive
  // this from `dob` — that inference is exactly what dropped a provider's client
  // hat when the client->provider upgrade never collected a date of birth.
  has_client_profile: boolean;
  // Client's saved default address for mobile bookings. Owner-readable only
  // (every SELECT policy on `users` is auth.uid() = id) — providers see the
  // per-booking snapshot in bookings.client_address, which the address-release
  // policy governs, never this.
  client_address: string | null;
  // The coarse half the client CHOOSES (migration 20260827162000): "Camden,
  // London". Stamped onto bookings.client_area at checkout, where — unlike
  // client_address — a mobile provider may read it before accepting.
  client_area: string | null;
  // Coach-mark walkthroughs this ACCOUNT has been shown, as {tour_key: version}
  // (migration 20260831124409). Written only by the mark_tour_seen RPC, which
  // merges one key at a time and never lets a version move backwards — read it
  // through seenVersionFor() in src/utils/coachMarkTours.ts rather than
  // indexing it raw, since an older build may have left a malformed entry.
  seen_tours: Record<string, number>;
  role: UserRole;
  login_method: string | null;
  business_name: string | null;
  business_email: string | null;
  avatar_url: string | null;
  push_token: string | null;
  service_interests: string[] | null;
  gender: "female" | "male" | "non-binary" | "prefer-not-to-say" | null;
  has_kids: boolean | null;
  birth_year: number | null;
  // Provider-signup-only fields — staged here until a `providers` row
  // exists, then prefilled across by InfoRegScreen's first-save flow
  // (see getUserSignupPrefillInfo).
  team_size: "solo" | "small_team" | "large_team" | null;
  accessibility_notes: string | null;
  languages_spoken: string[] | null;
  specialties: string[] | null;
  price_range: "budget" | "mid" | "premium" | "luxury" | null;
  preferred_contact_methods: string[] | null;
  preferred_payment_methods: string[] | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
  deletion_requested_at: string | null;
}

export interface DbProvider {
  id: string;
  // Nullable for unclaimed/scraped rows (see is_claimed below) — a provider
  // has no owning auth user until claimed. providers_claim_state_check
  // enforces is_claimed=true <=> user_id NOT NULL at the DB level.
  user_id: string | null;
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
  background_image_url: string | null;
  profile_theme: string | null; // preset key from src/constants/providerThemes.ts ('app', 'blush', …)
  brand_font: string | null; // preset key from src/constants/providerFonts.ts — see PROVIDER_FONTS for the current list; null = default (Prata-Regular)
  phone: string | null;
  email: string | null;
  instagram: string | null;
  website: string | null;
  tiktok: string | null;
  preferred_contact_methods: string[] | null;
  whatsapp_number: string | null;
  // When set, client-facing "Book" CTAs open this URL (Fresha, Treatwell,
  // Acuity, etc.) instead of Cerviced's in-app booking flow. Null/empty =
  // book entirely in-app, unchanged from before this column existed.
  external_booking_url: string | null;
  rating: number;
  review_count: number;
  years_experience: number | null;
  is_active: boolean;
  is_featured: boolean;
  is_verified: boolean;
  has_gone_live: boolean;
  // Stamped once, the moment the provider first publishes their profile
  // (InfoRegScreen's !isEditMode path) — never overwritten by later edits.
  // Null for providers who published before this column existed.
  terms_accepted_at: string | null;
  booking_policies: {
    cancelNotice?: string;
    cancelPenalty?: string;
    cancelNote?: string;
    rescheduleNotice?: string;
    maxReschedules?: string;
    rescheduleNote?: string;
    /** 'full_only' | 'client_choice' | 'deposit_required' — the provider's
     *  three-way deposit choice, edited on PaymentsScreen. Read it through
     *  resolveDepositMode() in src/utils/depositPolicy.ts, never directly:
     *  rows saved before 2026-08-20 only carry the boolean pair below. */
    depositMode?: string;
    depositRequired?: boolean;
    depositType?: string;
    depositAmount?: string;
    depositNote?: string;
    noShowAction?: string;
    noShowNote?: string;
    /** Client must pay the deposit — no "pay in full" choice at checkout.
     *  Legacy: this and depositRequired were written in lockstep, which is
     *  why depositMode exists. Still written for older client builds. */
    depositOnly?: boolean;
    /** Free-text disclosure only — this app has no refund-processing infra
     *  and never calculates/enforces a refund automatically. */
    refundPolicyNote?: string;
    /** Minutes past the booked start time before "No Show" can be marked. */
    noShowGraceMinutes?: string;
    /** Stamped onto every new booking, shown to clients in booking details. */
    bookingInstructions?: string;
    /** Optional photo of a fuller policy document, shown to clients via a
     *  pop-up on their profile view (see ProviderProfileScreen). */
    policyImageUrl?: string;
    /** Waitlist candidate-selection strategy — see InfoRegScreen's
     *  ProviderPolicies.waitlistSelectionMethod for the full explanation. */
    waitlistSelectionMethod?: string;
  } | null;
  business_type: BusinessType | null;
  // full_address is deliberately NOT here. It moved to provider_private_details
  // (owner-only RLS) because `providers` is readable by every authenticated user
  // and RLS cannot hide a single column — so keeping it here leaked every
  // provider's home address to clients via `.select('*')` on browse. See
  // supabase/restrict_provider_full_address.sql. Read via
  // getMyProviderFullAddress(), write via setMyProviderFullAddress().
  address_release_policy:
    | "always"
    | "on_confirmation"
    | "day_before"
    | "two_days_before"
    | "three_days_before"
    | "five_days_before"
    | "week_before"
    | "manual"
    | null;
  online_consultations_available: boolean;
  consultation_required_new_clients: boolean;
  style_tags: string[] | null;
  occasion_tags: string[] | null;
  expertise_tags: string[] | null;
  technique_tags: string[] | null;
  inclusive_flags: string[] | null;
  price_tier: "budget" | "mid" | "premium" | "luxury" | null;
  team_size: "solo" | "small_team" | "large_team" | null;
  accessibility_notes: string | null;
  languages_spoken: string[] | null;
  // Service-coverage cities (src/constants/ukCities.ts) — drives the client
  // Search "City" filter. Distinct from location_text, which is a single
  // geocodable business-address string, not a coverage list.
  service_locations: string[] | null;
  preferred_payment_methods: string[] | null;
  // ── Practice details ────────────────────────────────────────────────────
  // Added by supabase/provider_practice_details_columns.sql, which promoted
  // these out of device-local AsyncStorage ('@provider_extras') so they
  // survive reinstall and can actually reach clients.
  //
  // patch_test_policy is health-adjacent — clients need it BEFORE booking.
  // is_insured_self_declared / dbs_checked_self_declared are provider
  // SELF-ATTESTATIONS that Cerviced does not verify; never render them to a
  // client as a platform-verified credential.
  patch_test_policy:
    | "always"
    | "new_clients"
    | "optional"
    | "not_needed"
    | null;
  qualifications: string | null;
  is_insured_self_declared: boolean;
  dbs_checked_self_declared: boolean;
  travel_radius: string | null;
  clientele: string[] | null;
  // Provider-level hair types catered to (HAIR_TYPES vocabulary — Straight,
  // Wavy, Curly, Coily, 4A, 4B, 4C). NULL/empty = caters to all. This is what
  // the client Search "Hair Type" filter matches on; services.hair_types_
  // suitable below is the narrower per-service refinement.
  hair_types_catered: string[] | null;
  availability_windows: string[] | null;
  accepts_new_clients: "yes" | "waitlist" | "no" | null;
  walk_ins_welcome: boolean;
  group_bookings_available: boolean;
  products_used: string | null;
  vegan_cruelty_free: boolean;
  auto_accept_bookings: boolean;
  max_bookings_per_day: number;
  booking_window_days: number;
  slot_interval_mins: number;
  buffer_mins: number;
  min_booking_notice_hrs: number;
  /** Emergency-request opt-ins — each lets a CLIENT ask for a time one of the
   *  four scheduling rules above would otherwise reject outright. All default
   *  false; an accepted request always lands pending, never auto-confirmed.
   *  See supabase/migrations/20260821143821_emergency_booking_requests.sql. */
  allow_out_of_hours_requests: boolean;
  allow_blocked_date_requests: boolean;
  allow_short_notice_requests: boolean;
  allow_beyond_window_requests: boolean;
  /** How far before opening / after closing a client may be OFFERED an
   *  out-of-hours request slot, measured from that day's own hours. NULL =
   *  any time, and is the default — a provider who never touches this is
   *  asked for whatever the client needs. A display preference only: the
   *  bookability trigger doesn't enforce it, because the provider approves
   *  or declines every request regardless. */
  request_window_before_mins: number | null;
  request_window_after_mins: number | null;
  cancellation_notice_hours: number;
  /** Mirror of the provider's Automations screen settings — readable by
   *  client screens and pg_cron jobs (auth user_metadata is not). */
  automation_settings: {
    clientReminderTiming?: string[]; // e.g. ['24h','48h','2h']
    rebookingNudgeWeeks?: string; // 'never' | '2' | '4' | ...
    autoReviewRequest?: boolean;
    postApptCheckIn?: boolean;
    birthdayGreeting?: boolean;
    waitlistEnabled?: boolean;
    autoAcceptWaitlist?: boolean;
    depositRequiredNew?: boolean;
    /** Daily 07:00 provider recap push. Read by
     *  process_provider_daily_recap() (pg_cron job `provider-daily-recap`),
     *  which gates on
     *  COALESCE((automation_settings->>'newBookingRecap')::BOOLEAN, TRUE).
     *  Because that COALESCE defaults to TRUE, a MISSING key means "send" —
     *  so this must always be written, not omitted when false. */
    newBookingRecap?: boolean;
    /** Day of month (1-31) this provider releases/redoes their schedule.
     *  Read by process_follow_schedule_release_nudges() (provider_follow_
     *  notify_cron.sql) to notify provider_follows rows with
     *  notify_enabled = TRUE on that day each month. Unset = never fires. */
    scheduleReleaseDay?: number;
  } | null;
  // Cooldown guard for process_provider_fully_booked_alerts() (provider_
  // fully_booked_alert.sql) — read-only from the app, written only by that
  // cron job. Fixed weekly check for now, not provider-configurable.
  fully_booked_alert_last_sent_at: string | null;
  // Claimable-profile fields (supabase/claimable_provider_profiles.sql).
  // is_claimed=false rows are imported placeholders with no owner yet —
  // see searchUnclaimedProviders/getUnclaimedProviderDetail in
  // databaseService.ts and the claim flow in ClaimProviderScreen.tsx.
  is_claimed: boolean;
  source: "self_signup" | "scraped" | null;
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
  // Shown to clients under the category tab once selected — same value
  // stored redundantly on every service row sharing that category_name,
  // mirroring how category_name itself isn't a normalized entity either.
  category_description: string | null;
  name: string;
  description: string | null;
  price: number;
  price_max: number | null;
  duration_minutes: number;
  // NULL = no override. before defaults to 0; after inherits providers.buffer_mins.
  buffer_before_mins: number | null;
  buffer_after_mins: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  // Discoverability tags — feed search, Becca, and user learning
  tags: string[] | null;
  technique_tags: string[] | null;
  outcome_tags: string[] | null;
  occasion_tags: string[] | null;
  trend_names: string[] | null;
  // Safety & suitability
  is_pregnancy_safe: boolean;
  patch_test_required: boolean;
  min_age: number | null;
  contraindications: string[] | null;
  // Hair types this service suits (HAIR_TYPES vocabulary — Straight, Wavy,
  // Curly, Coily, 4A, 4B, 4C). NULL/empty = suits all hair types.
  hair_types_suitable: string[] | null;
  // Who this specific service is for. NULL = not stated, read as "everyone" —
  // same convention as hair_types_suitable's "suits all" empty case. Mirrors
  // the live services_audience_check constraint.
  audience: "women" | "men" | "kids" | "everyone" | null;
  // Context
  aftercare_notes: string | null;
  service_type:
    | "treatment"
    | "enhancement"
    | "maintenance"
    | "restorative"
    | "consultation"
    | null;
  // Only populated by queries that explicitly join service_add_ons (e.g.
  // getMyProviderServices) — most service reads leave it undefined.
  add_ons?: DbServiceAddOn[];
}

export interface DbServiceImage {
  id: string;
  service_id: string;
  url: string;
  sort_order: number;
  /**
   * width/height of the image at `url`, measured at upload time.
   * NULL for rows created before this column existed (and for any upload
   * whose measurement failed) — callers must treat null as "unknown" and
   * measure the file themselves rather than substituting a default, since a
   * guessed ratio is what makes a landscape photo render in a portrait box.
   */
  aspect_ratio: number | null;
  /**
   * How the provider chose to have this photo framed: 'cover' fills the
   * display box and may crop, 'contain' fits the whole photo and letterboxes.
   * NOT NULL with a 'cover' default, so every legacy row reads as today's
   * behaviour — see supabase/migrations/20260829011733_service_image_fit.sql.
   */
  fit: "cover" | "contain";
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
  open_time: string; // 'HH:MM:SS'
  close_time: string;
  is_closed: boolean;
}

export interface DbProviderBlockedDate {
  id: string;
  provider_id: string;
  blocked_date: string; // 'YYYY-MM-DD'
  reason: string | null;
}

/** A bookable period in a provider's recurring weekly schedule. */
export interface DbProviderAvailabilityWindow {
  id: string;
  provider_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  created_at: string;
  updated_at: string;
}

/** A one-off closure or replacement working period for a calendar date. */
export interface DbProviderAvailabilityOverride {
  id: string;
  provider_id: string;
  availability_date: string;
  is_closed: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
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
  // Enriched discovery tags — personalised Explore feed
  vibe_tags: string[] | null;
  occasion_tags: string[] | null;
  trend_names: string[] | null;
  hair_type_shown: string | null;
  skin_tone_shown: "fair" | "light" | "medium" | "tan" | "deep" | "rich" | null;
}

export interface DbBooking {
  id: string;
  user_id: string;
  provider_id: string;
  service_id: string | null;
  status: BookingStatus;
  booking_date: string; // 'YYYY-MM-DD'
  booking_time: string; // 'HH:MM:SS'
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
  /** Unique short code shown to humans, e.g. 4B2X9K7M (displayed as
   *  CRV-4B2X9K7M). Generated by a BEFORE INSERT trigger and covered by a
   *  UNIQUE index, so it is never merely probably unique the way the old
   *  8-character id truncation was. Optional on the TS side only because a
   *  row read before migration 20260827153834 will not carry one. */
  booking_ref?: string | null;
  provider_name_snapshot: string;
  service_name_snapshot: string;
  service_category_snapshot: string | null;
  provider_logo_snapshot: string | null;
  provider_address_snapshot: string | null;
  provider_phone_snapshot: string | null;
  provider_coordinates: { lat: number; lng: number } | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  confirmed_at: string | null;
  address_released_at: string | null;
  // WRITE-ONLY FUNNEL since 20260827161000 — always NULL at rest. Read the
  // address off the client_bookings view or the booking_client_addresses
  // embed, never off this column.
  client_address: string | null;
  // Coarse area, ungated: the provider reads it the moment the request lands.
  // Either a chosen area ("Camden, London") or a postcode district derived
  // from the address ("SE15"). See 20260827161000 / 20260827162000.
  client_area?: string | null;
  // Read live off the joined providers row by the client_bookings view, not
  // snapshotted onto the booking — it decides whose address is the
  // appointment's location (see isMobileBooking). Absent when a booking is
  // read straight from `bookings` rather than the view.
  provider_business_type?: BusinessType | null;
  // No-show dispute bookkeeping (migration 20260827154500). Optional because
  // every booking read is a select('*'), so these are simply absent until
  // that migration is applied — and null on any booking never marked.
  no_show_marked_at?: string | null;
  no_show_disputed_at?: string | null;
  no_show_dispute_reason?: string | null;
  no_show_counted_at?: string | null;
  // Client intent — feeds search personalisation and Becca context
  occasion_type:
    | "wedding"
    | "prom"
    | "photoshoot"
    | "date-night"
    | "birthday"
    | "festival"
    | "everyday"
    | "other"
    | null;
  style_request: string | null;
  reference_image_url: string | null;
  // When the client agreed to the provider's cancellation/booking policy at
  // checkout (BookingSheet/MultiBookingSheet), and a frozen copy of that
  // policy as it stood then — never rewritten by later provider edits. Null
  // for bookings made before this column existed, or via CartScreen (a
  // separate, deferred Cerviced-wide terms checkbox, not a provider policy).
  policy_accepted_at: string | null;
  policy_snapshot: Record<string, unknown> | null;
  /** The client asked for a time this provider's own scheduling rules
   *  exclude — outside their hours, on a blocked date, at short notice, or
   *  beyond their booking window — under one of the providers.allow_*_requests
   *  opt-ins. Never auto-confirmed, whatever auto_accept_bookings says. See
   *  supabase/migrations/20260821143821_emergency_booking_requests.sql. */
  is_emergency_request: boolean;
  /** When the client accepted that confirmation, having been pointed at the
   *  provider's policy. Required server-side whenever the flag above is set. */
  emergency_ack_at: string | null;
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
  requested_by: "user" | "provider";
  original_date: string;
  original_time: string;
  requested_dates: string[] | null;
  // Index-aligned with requested_dates (element i is the time requested
  // alongside requested_dates[i], NULL where no time was supplied). Added by
  // fix_reschedule_requested_dates_type_mismatch.sql — requested_dates is
  // DATE[] server-side and cannot carry a time-of-day itself.
  requested_times?: string[] | null;
  provider_available_slots: { date: string; times: string[] }[] | null;
  status: RescheduleStatus;
  reschedule_count: number;
  // Optional decline reason — set by reject_reschedule_request (provider
  // decline) and surfaced to the client via the trigger-owned notification.
  response_note?: string | null;
  // Set on every sibling row a provider_initiate_group_reschedule() call
  // wrote together — see supabase/fix_group_booking_reschedule.sql. Absent
  // (null) for an ordinary single-booking reschedule request.
  group_reschedule_batch_id?: string | null;
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
  metadata: Json;
  created_at: string;
  recipient_role: "provider" | "client";
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
  service_ids: string[] | null;
  promo_code: string | null;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
  image_url: string | null;
  scheduled_notify_at: string | null;
  notify_sent_at: string | null;
  created_at: string;
}

/** Promotion fields safe and necessary on a browsing client's profile. */
export type ClientPromotion = Omit<
  DbPromotion,
  "scheduled_notify_at" | "notify_sent_at"
>;

export interface ClienteleMember {
  user_id: string;
  customer_name: string;
  customer_email: string;
  booking_count: number;
  last_booking_date: string;
  total_spent: number;
}

export interface PublicPromotionWithProvider extends ClientPromotion {
  providers?: {
    display_name: string | null;
    logo_url: string | null;
    slug: string | null;
  } | null;
}

/** @deprecated Client-facing code should use PublicPromotionWithProvider. */
export type DbPromotionWithProvider = PublicPromotionWithProvider;

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

/**
 * Public, client-facing provider profile payload.
 *
 * Keep this as an explicit projection rather than extending DbProvider. The
 * providers table also contains operational/provider-only columns, and a
 * `.select('*')` here would silently expose every future column to browsing
 * clients. The query in getProviderBySlug must stay in lock-step with this
 * allow-list.
 */
export type ProviderWithServices = Pick<
  DbProvider,
  | "id"
  | "slug"
  | "display_name"
  | "service_category"
  | "custom_service_type"
  | "location_text"
  | "about_text"
  | "logo_url"
  | "gradient"
  | "accent_color"
  | "background_image_url"
  | "profile_theme"
  | "brand_font"
  | "phone"
  | "email"
  | "instagram"
  | "website"
  | "tiktok"
  | "preferred_contact_methods"
  | "whatsapp_number"
  | "external_booking_url"
  | "rating"
  | "years_experience"
  | "is_verified"
  | "booking_policies"
  | "business_type"
  | "online_consultations_available"
  | "cancellation_notice_hours"
  | "accessibility_notes"
  | "languages_spoken"
  | "qualifications"
  | "is_insured_self_declared"
  | "dbs_checked_self_declared"
  | "team_size"
  | "walk_ins_welcome"
  | "group_bookings_available"
  | "vegan_cruelty_free"
  | "travel_radius"
  | "products_used"
  | "hair_types_catered"
> & {
  /** Only the automation flags needed by the public profile UI. */
  automation_settings: Pick<
    NonNullable<DbProvider["automation_settings"]>,
    "scheduleReleaseDay" | "waitlistEnabled"
  > | null;
  services: (Pick<
    DbService,
    | "id"
    | "category_name"
    | "category_description"
    | "name"
    | "description"
    | "price"
    | "duration_minutes"
    | "is_active"
    | "sort_order"
    | "is_pregnancy_safe"
    | "patch_test_required"
    | "min_age"
    | "contraindications"
    | "aftercare_notes"
    | "service_type"
  > & {
    images: Pick<
      DbServiceImage,
      "id" | "url" | "sort_order" | "aspect_ratio"
    >[];
    add_ons: Pick<
      DbServiceAddOn,
      "id" | "name" | "price" | "description" | "is_active"
    >[];
  })[];
  specialties: Pick<DbProviderSpecialty, "specialty">[];
};

/** Public provider card/search payload shared by Home, Search and Becca. */
export type PublicProviderSummary = Pick<
  DbProvider,
  | 'id'
  | 'slug'
  | 'display_name'
  | 'service_category'
  | 'logo_url'
  | 'location_text'
  | 'service_locations'
  | 'latitude'
  | 'longitude'
  | 'rating'
  | 'review_count'
  | 'price_tier'
  | 'business_type'
  | 'walk_ins_welcome'
  | 'group_bookings_available'
  | 'vegan_cruelty_free'
  | 'is_featured'
  | 'created_at'
>;

/** Portfolio item with provider info — used by ExploreScreen */
export interface PortfolioItemWithProvider extends DbPortfolioItem {
  provider: Pick<
    DbProvider,
    | "id"
    | "slug"
    | "display_name"
    | "service_category"
    | "logo_url"
    | "rating"
    | "review_count"
  >;
}

/** Service with photo(s) and provider info — powers ExploreScreen's mixed discovery feed */
export interface DiscoverServiceWithProvider {
  id: string;
  provider_id: string;
  name: string;
  description: string | null;
  price: number;
  service_images: Pick<DbServiceImage, "url" | "sort_order" | "aspect_ratio" | "fit">[];
  provider: Pick<
    DbProvider,
    | "id"
    | "slug"
    | "display_name"
    | "service_category"
    | "logo_url"
    | "rating"
    | "review_count"
  >;
}

/** Booking with add-ons — used by BookingsScreen and ProviderHomeScreen */
export interface BookingWithAddOns extends DbBooking {
  add_ons: DbBookingAddOn[];
  /** Live provider logo — only present when the query joins it; snapshot is frozen at booking time and may be null for older rows. */
  provider?: { logo_url: string | null } | null;
}

/** Review with user name — used by ProviderProfileScreen */
export interface ReviewWithUser extends DbReview {
  user: Pick<DbUser, "name" | "avatar_url">;
}

/** Public review payload: deliberately excludes booking and payment linkage. */
export interface PublicReviewWithUser
  extends Pick<
    DbReview,
    "id" | "user_id" | "provider_id" | "rating" | "comment" | "created_at"
  > {
  user: Pick<DbUser, "name" | "avatar_url">;
}

/** Notification with optional booking/provider data */
export interface NotificationWithContext extends DbNotification {
  booking?: Pick<
    DbBooking,
    "booking_date" | "booking_time" | "service_name_snapshot"
  > | null;
  provider?: Pick<DbProvider, "slug" | "display_name" | "logo_url"> | null;
}
