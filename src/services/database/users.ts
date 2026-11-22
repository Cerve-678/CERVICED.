// Database access: User profile reads and writes.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import { supabase } from "../../lib/supabase";
import type { DbUser } from "../../types/database";
import { logger } from "../../utils/logger";

// ─────────────────────────────────────────────────────────
// USERS — profile reads
// ─────────────────────────────────────────────────────────

/** Fetch the full users row by ID. Returns null on PGRST116 (row missing); throws on other errors. */
export async function getUserProfileById(
  userId: string,
): Promise<DbUser | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as DbUser;
}

/**
 * Which coach-mark walkthroughs this account has already been shown, as
 * {tour_key: version}. Empty object for an account that has seen none.
 *
 * Account-scoped on purpose: the device-local flag this replaced could not
 * survive a reinstall or follow the account to a second phone, which is why
 * walkthroughs appeared to replay on every sign-in.
 */
export async function getSeenTours(
  userId: string,
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("users")
    .select("seen_tours")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return ((data as { seen_tours: Record<string, number> | null } | null)
    ?.seen_tours ?? {}) as Record<string, number>;
}

/**
 * Record that this account has been shown `tourKey` up to `version`.
 *
 * Goes through the RPC rather than an UPDATE so the write merges one key into
 * the map instead of rewriting it — two tours can finish moments apart on
 * adjacent tabs, and a read-modify-write would lose one. The RPC also refuses
 * to move a version backwards, so a stale app build cannot un-see a newer
 * walkthrough for someone who has already been shown it.
 */
export async function markTourSeen(
  tourKey: string,
  version: number,
): Promise<void> {
  const { error } = await supabase.rpc("mark_tour_seen", {
    p_key: tourKey,
    p_version: version,
  });
  if (error) throw new Error(error.message);
}

/**
 * Wipe this account's walkthrough record so every tour is owed again.
 *
 * Dev-only (DevSettings > Replay Walkthroughs). It has to clear the ACCOUNT's
 * record, not just the device cache: with users.seen_tours as the source of
 * truth, clearing the cache alone leaves the server still saying "seen" and
 * the replay silently does nothing.
 */
export async function clearSeenTours(userId: string): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ seen_tours: {} })
    .eq("id", userId);
  if (error) throw error;
}

/** Fetch name, phone, and dob for a user — for the account-info edit screen */
export async function getUserBasicInfo(userId: string): Promise<{
  name: string | null;
  phone: string | null;
  dob: string | null;
} | null> {
  const { data, error } = await supabase
    .from("users")
    .select("name, phone, dob")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data as {
    name: string | null;
    phone: string | null;
    dob: string | null;
  };
}

/** Fetch business_name and business_email for a user */
export async function getUserBusinessInfo(userId: string): Promise<{
  business_name: string | null;
  business_email: string | null;
} | null> {
  const { data, error } = await supabase
    .from("users")
    .select("business_name, business_email")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data as {
    business_name: string | null;
    business_email: string | null;
  };
}

/**
 * Fetch the signup-time contact fields that a first-time provider profile
 * save should prefill instead of asking for again (InfoRegScreen.tsx) — name,
 * business name/email/phone, instagram, website. These were already
 * collected and saved to `users` during the 5-step signup flow
 * (EmailVerificationScreen.tsx), but the providers row doesn't exist until
 * InfoRegScreen's first save, so without this the form starts blank and the
 * provider ends up retyping data they already gave.
 */
export async function getUserSignupPrefillInfo(userId: string): Promise<{
  name: string | null;
  phone: string | null;
  business_name: string | null;
  business_email: string | null;
  business_phone: string | null;
  business_type: string | null;
  instagram: string | null;
  website: string | null;
  tiktok: string | null;
  service_interests: string[] | null;
  service_locations: string[] | null;
  location_text: string | null;
  years_experience: number | null;
  team_size: string | null;
  accessibility_notes: string | null;
  languages_spoken: string[] | null;
  specialties: string[] | null;
  price_range: string | null;
  price_bands: string[] | null;
  preferred_contact_methods: string[] | null;
  preferred_payment_methods: string[] | null;
  external_booking_url: string | null;
} | null> {
  const { data, error } = await supabase
    .from("users")
    .select(
      "name, phone, business_name, business_email, business_phone, business_type, instagram, website, tiktok, " +
        "service_interests, service_locations, location_text, years_experience, team_size, accessibility_notes, languages_spoken, specialties, " +
        "price_range, price_bands, preferred_contact_methods, preferred_payment_methods, external_booking_url",
    )
    .eq("id", userId)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as unknown as {
    name: string | null;
    phone: string | null;
    business_name: string | null;
    business_email: string | null;
    business_phone: string | null;
    business_type: string | null;
    instagram: string | null;
    website: string | null;
    tiktok: string | null;
    service_interests: string[] | null;
    service_locations: string[] | null;
    location_text: string | null;
    years_experience: number | null;
    team_size: string | null;
    accessibility_notes: string | null;
    languages_spoken: string[] | null;
    specialties: string[] | null;
    price_range: string | null;
    price_bands: string[] | null;
    preferred_contact_methods: string[] | null;
    preferred_payment_methods: string[] | null;
    external_booking_url: string | null;
  };
}

/** Fetch the name field from the users table (distinct from providers.display_name) */
export async function getUserDisplayName(
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("users")
    .select("name")
    .eq("id", userId)
    .maybeSingle();
  return (data as { name: string | null } | null)?.name ?? null;
}

// ─────────────────────────────────────────────────────────
// USERS — profile writes
// ─────────────────────────────────────────────────────────

/** Upgrade a user account to provider role, writing business info alongside */
export async function upgradeUserToProvider(
  userId: string,
  businessName: string,
  // Optional at sign-up — null when left blank, never ''.
  businessEmail: string | null,
  extras?: {
    businessPhone?: string;
    instagram?: string;
    tiktok?: string;
    website?: string;
    businessType?: string;
    dobDay?: string;
    dobMonth?: string;
    dobYear?: string;
    serviceInterests?: string[];
    serviceLocations?: string[];
    yearsExperience?: string;
    priceRange?: string;
    priceBands?: string[];
    externalBookingUrl?: string;
    preferredContactMethods?: string[];
    accessibilityNotes?: string;
    languagesSpoken?: string[];
    specialties?: string[];
    preferredPaymentMethods?: string[];
    referralSource?: string;
  },
): Promise<void> {
  const dob =
    extras?.dobDay && extras?.dobMonth && extras?.dobYear
      ? `${extras.dobYear}-${extras.dobMonth.padStart(2, "0")}-${extras.dobDay.padStart(2, "0")}`
      : null;
  const { error } = await supabase
    .from("users")
    .update({
      role: "provider",
      business_name: businessName,
      business_email: businessEmail,
      ...(extras?.businessPhone
        ? { business_phone: extras.businessPhone }
        : {}),
      ...(extras?.instagram ? { instagram: extras.instagram } : {}),
      ...(extras?.tiktok ? { tiktok: extras.tiktok } : {}),
      ...(extras?.website ? { website: extras.website } : {}),
      ...(extras?.businessType ? { business_type: extras.businessType } : {}),
      ...(dob ? { dob } : {}),
      ...(extras?.serviceInterests?.length
        ? { service_interests: extras.serviceInterests }
        : {}),
      ...(extras?.serviceLocations?.length
        ? { service_locations: extras.serviceLocations }
        : {}),
      // Parsed to an INT — the users staging column is INT (mirrors
      // providers.years_experience). A blank/NaN answer is left unstaged.
      ...(extras?.yearsExperience && !Number.isNaN(parseInt(extras.yearsExperience, 10))
        ? { years_experience: parseInt(extras.yearsExperience, 10) }
        : {}),
      ...(extras?.externalBookingUrl
        ? { external_booking_url: extras.externalBookingUrl }
        : {}),
      ...(extras?.accessibilityNotes
        ? { accessibility_notes: extras.accessibilityNotes }
        : {}),
      ...(extras?.languagesSpoken?.length
        ? { languages_spoken: extras.languagesSpoken }
        : {}),
      ...(extras?.specialties?.length
        ? { specialties: extras.specialties }
        : {}),
      ...(extras?.referralSource
        ? { referral_source: extras.referralSource }
        : {}),
      ...(extras?.priceRange ? { price_range: extras.priceRange } : {}),
      ...(extras?.priceBands?.length ? { price_bands: extras.priceBands } : {}),
      ...(extras?.preferredContactMethods?.length
        ? { preferred_contact_methods: extras.preferredContactMethods }
        : {}),
      ...(extras?.preferredPaymentMethods?.length
        ? { preferred_payment_methods: extras.preferredPaymentMethods }
        : {}),
    })
    .eq("id", userId);
  if (error) throw error;

  // price_range/preferred_contact_methods are staged on `users` above (their
  // permanent home is `providers`.price_tier/preferred_contact_methods, see
  // supabase/provider_signup_business_fields.sql), so InfoRegScreen's own
  // first-save prefill is the primary path for both once a providers row
  // exists. This best-effort write additionally covers the one case that
  // isn't a "brand new, no providers row yet" upgrade: a provider who
  // already has a providers row (e.g. re-running the switch flow, or a
  // dual-hat account) sees these take effect immediately rather than
  // waiting on their next InfoRegScreen save.
  if (
    extras?.priceRange ||
    extras?.externalBookingUrl ||
    extras?.preferredContactMethods?.length ||
    extras?.preferredPaymentMethods?.length
  ) {
    const { error: providerRowError } = await supabase
      .from("providers")
      .update({
        ...(extras?.priceRange ? { price_tier: extras.priceRange } : {}),
        ...(extras?.priceBands?.length ? { price_bands: extras.priceBands } : {}),
        ...(extras?.externalBookingUrl
          ? { external_booking_url: extras.externalBookingUrl }
          : {}),
        ...(extras?.preferredContactMethods?.length
          ? { preferred_contact_methods: extras.preferredContactMethods }
          : {}),
        ...(extras?.preferredPaymentMethods?.length
          ? { preferred_payment_methods: extras.preferredPaymentMethods }
          : {}),
      })
      .eq("user_id", userId);
    if (providerRowError)
      logger.warn(
        "[upgradeUserToProvider] providers-row best-effort write failed:",
        providerRowError.message,
      );
  }

  // Keep auth metadata's `role` in step with users.role. It's only a mirror —
  // users.role stays the source of truth — but AuthContext falls back to
  // metadata when the profile fetch fails, and a stale 'user' there would
  // restore a provider into the client hat. Best-effort: the row write above is
  // what actually matters, so a metadata failure must not fail the upgrade.
  const { error: metaError } = await supabase.auth.updateUser({
    data: { role: "provider" },
  });
  if (metaError)
    logger.warn(
      "[upgradeUserToProvider] auth metadata role sync failed:",
      metaError.message,
    );
}

/** Update name and phone — called from AuthContext so in-memory user stays fresh */
/**
 * Update the contact details a user can edit about themselves.
 *
 * Only the keys actually passed are written, so a caller that has no notion of
 * a client address (the provider account-info screen) can't blank out one the
 * client saved from checkout.
 */
export async function updateUserContactDetails(
  userId: string,
  details: {
    name?: string;
    phone?: string;
    dob?: string | null;
    clientAddress?: string | null;
    clientArea?: string | null;
  },
): Promise<void> {
  const patch: {
    name?: string;
    phone?: string;
    dob?: string | null;
    client_address?: string | null;
    client_area?: string | null;
  } = {};
  if (details.name !== undefined) patch.name = details.name;
  if (details.phone !== undefined) patch.phone = details.phone;
  if (details.dob !== undefined) patch.dob = details.dob;
  if (details.clientAddress !== undefined)
    patch.client_address = details.clientAddress;
  if (details.clientArea !== undefined) patch.client_area = details.clientArea;
  if (Object.keys(patch).length === 0) return;

  // An UPDATE matching zero rows isn't an error, and the booking checklist lets
  // someone through on this call succeeding, so a write that landed nowhere has
  // to fail here.
  const { data, error } = await supabase
    .from("users")
    .update(patch)
    .eq("id", userId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(`updateUserContactDetails matched no row for user ${userId}`);
  }
}

/** Update the date-of-birth field for a user */
export async function updateUserDob(
  userId: string,
  dob: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ dob: dob || null })
    .eq("id", userId);
  if (error) throw error;
}

/** Update business_name and business_email on the users row */
export async function updateUserBusinessInfo(
  userId: string,
  businessName: string | null,
  businessEmail: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ business_name: businessName, business_email: businessEmail })
    .eq("id", userId);
  if (error) throw error;
}

/**
 * Writes provider answers onto the sign-up staging columns of the signed-in
 * user's own row. Used only while there is no providers row yet: Business Info
 * has nowhere else to put an edit, and the profile editor's first save reads
 * these same columns (getUserSignupPrefillInfo) to build that row — so the
 * edit is carried into the profile instead of being dropped.
 */
export async function updateMyStagedProviderAnswers(
  userId: string,
  answers: {
    external_booking_url?: string | null;
    instagram: string | null;
    website: string | null;
    accessibility_notes?: string | null;
    preferred_payment_methods?: string[] | null;
    business_type?: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update(answers)
    .eq("id", userId);
  if (error) throw error;
}

/** Sync beauty profile fields to the users table so providers can read them */
/**
 * Saves the Beauty Profile onto the signed-in client's own users row.
 *
 * An UPDATE, not an upsert: users.email and users.name are NOT NULL, and
 * Postgres checks those on the proposed insert row before ON CONFLICT ever
 * finds the existing one, so a partial upsert fails with 23502 for every
 * account. The row always exists by this point (signup creates it); zero rows
 * updated means RLS refused or the row is gone, which is a real failure.
 */
export async function updateUserBeautyProfile(
  userId: string,
  data: {
    hair_type?: string[] | null;
    skin_type?: string[] | null;
    skin_tone?: string | null;
    allergies?: string[];
    skin_concerns?: string[];
    sensitive_areas?: string[];
    style_vibe?: string[] | null;
    medical_notes?: string | null;
    photography_consent?: boolean;
    treatment_history?: string[];
    makeup_coverage?: string[] | null;
    makeup_finish?: string[] | null;
    makeup_eyes?: string[] | null;
    makeup_lips?: string[] | null;
    nail_length?: string[] | null;
    nail_shape?: string[] | null;
    nail_condition?: string[];
    nail_service?: string[];
    nail_style?: string[];
    nail_colours?: string[];
    style_aesthetics?: string[];
    style_occasions?: string[];
    style_routine?: string | null;
    lash_style?: string[] | null;
    lash_status?: string | null;
    brow_style?: string[] | null;
    brow_condition?: string[] | null;
    scalp_condition?: string[] | null;
    hair_goals?: string[];
    service_interests?: string[];
    gender?: string | null;
    has_kids?: boolean | null;
  },
): Promise<void> {
  const { data: rows, error } = await supabase
    .from("users")
    .update(data)
    .eq("id", userId)
    .select("id");
  if (error) throw error;
  if (!rows || rows.length === 0) {
    throw new Error("Beauty profile not saved: no users row was updated for this account");
  }
}

export interface UserBeautyProfileRow {
  hair_type: string[] | string | null;
  scalp_condition: string[] | string | null;
  hair_goals: string[];
  treatment_history: string[];
  /** text[] once 20261108240000 is applied; a single string on rows before it. Read through toPickList. */
  skin_type: string[] | string | null;
  skin_tone: string | null;
  skin_concerns: string[];
  sensitive_areas: string[];
  nail_length: string[] | string | null;
  nail_shape: string[] | string | null;
  nail_condition: string[] | null;
  nail_service: string[] | null;
  nail_style: string[] | null;
  nail_colours: string[] | null;
  style_aesthetics: string[] | null;
  style_occasions: string[] | null;
  style_routine: string | null;
  lash_style: string[] | string | null;
  lash_status: string | null;
  brow_style: string[] | string | null;
  brow_condition: string[] | string | null;
  makeup_coverage: string[] | string | null;
  makeup_finish: string[] | string | null;
  makeup_eyes: string[] | string | null;
  makeup_lips: string[] | string | null;
  /** Same transition as skin_type. */
  style_vibe: string[] | string | null;
  service_interests: string[];
  gender: string | null;
  has_kids: boolean | null;
  allergies: string[];
  medical_notes: string | null;
  photography_consent: boolean;
}

/** Current client's canonical beauty/health profile with an explicit projection. */
export async function getUserBeautyProfile(
  userId: string,
): Promise<UserBeautyProfileRow | null> {
  const { data, error } = await supabase
    .from("users")
    .select(
      "hair_type, scalp_condition, hair_goals, treatment_history, skin_type, skin_tone, skin_concerns, sensitive_areas, nail_length, nail_shape, nail_condition, nail_service, nail_style, nail_colours, lash_style, lash_status, brow_style, brow_condition, makeup_coverage, makeup_finish, makeup_eyes, makeup_lips, style_vibe, style_aesthetics, style_occasions, style_routine, service_interests, gender, has_kids, allergies, medical_notes, photography_consent",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as UserBeautyProfileRow | null;
}
