// Database access: A provider's own account writes and claimable profiles.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import { supabase } from "../../lib/supabase";
import type { BusinessType, ServiceCategory } from "../../types/database";
import type { AddressReleasePolicy } from "../../features/business-details/options";
import { sanitizeIlikeTerm } from "./account";

// ─────────────────────────────────────────────────────────
// PROVIDERS — additional writes
// ─────────────────────────────────────────────────────────

/** Persist provider branding choices, including the public business-name font. */
export async function updateProviderBranding(
  providerId: string,
  data: {
    gradient: string[];
    accent_color: string;
    background_image_url: string | null;
    profile_theme: string;
    brand_font: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("providers")
    .update(data)
    .eq("id", providerId);
  if (error) throw error;
}

/** Update provider contact details. Only the fields present in patch are changed. */
export async function updateProviderContactDetails(
  providerId: string,
  patch: {
    /**
     * The provider's public business name. Changeable, but not again for 14
     * days — enforced by the providers_display_name_cooldown trigger (see
     * supabase/migrations/20260820191958_provider_display_name_change_cooldown.sql),
     * NOT by whichever screen happens to be writing. A change inside the
     * window throws with a plain-English message naming the date it reopens;
     * surface that message rather than a generic one.
     */
    display_name?: string;
    email?: string | null;
    whatsapp_number?: string | null;
    preferred_contact_methods?: string[] | null;
    online_consultations_available?: boolean;
    consultation_required_new_clients?: boolean;
    external_booking_url?: string | null;
    instagram?: string | null;
    website?: string | null;
    price_tier?: "budget" | "mid" | "premium" | "luxury" | null;
    price_bands?: string[];
    accessibility_notes?: string | null;
    languages_spoken?: string[] | null;
    // "Areas you cover" (About You, mobile providers only). Matched by the
    // client Search City filter — see src/utils/providerCity.ts.
    service_locations?: string[];
    // Mirrors the live CHECK constraint providers_team_size_check
    // ('solo' | 'small_team' | 'large_team'). Clear with null — an empty string
    // violates the constraint and the update throws.
    team_size?: "solo" | "small_team" | "large_team" | null;
    // Canonical lowercase values only ('card' | 'cash' | 'bank_transfer'), for
    // the same reason preferred_contact_methods is lowercase — capitalized
    // variants desynced this table once already. This is a stated preference
    // shown on the profile; it does NOT mean the app collects, tracks or
    // attests to any off-app payment.
    preferred_payment_methods?: string[] | null;
    // ── Practice details ──────────────────────────────────────────────────
    // Promoted out of device-local AsyncStorage ('@provider_extras') by
    // supabase/provider_practice_details_columns.sql. Mirror the live CHECK
    // constraints exactly — clear with null, never '' (an empty string fails
    // the constraint and the update throws, the same trap as team_size above).
    //
    // is_insured_self_declared / dbs_checked_self_declared are provider
    // SELF-ATTESTATIONS. Cerviced does not verify either — never surface them
    // to clients as platform-verified credentials.
    patch_test_policy?:
      | "always"
      | "new_clients"
      | "optional"
      | "not_needed"
      | null;
    qualifications?: string | null;
    is_insured_self_declared?: boolean;
    dbs_checked_self_declared?: boolean;
    clientele?: string[] | null;
    // Provider-level hair types catered to (HAIR_TYPES vocabulary). Empty/null
    // = caters to all, same semantics as services.hair_types_suitable, so an
    // untouched value is a valid answer rather than an incomplete profile.
    hair_types_catered?: string[] | null;
    skin_tones_catered?: string[] | null;
    availability_windows?: string[] | null;
    accepts_new_clients?: "yes" | "waitlist" | "no" | null;
    walk_ins_welcome?: boolean;
    group_bookings_available?: boolean;
    style_tags?: string[] | null;
    products_used?: string | null;
    vegan_cruelty_free?: boolean;
    // Editable from BusinessInfoScreen, locked in InfoReg post-first-save. Decides whether
    // a private address is required and drives address-release timing below.
    // Write these two together: business_type gates which address_release_policy
    // values are valid, so changing the type alone can leave a stale timing the
    // new type never offers. See reconcileAddressReleasePolicy in
    // src/features/business-details/options.ts.
    business_type?: BusinessType | null;
    address_release_policy?: AddressReleasePolicy | null;
    years_experience?: number | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("providers")
    .update(patch)
    .eq("id", providerId);
  if (error) throw error;
}

/**
 * Change a provider's headline service type.
 *
 * Deliberately its own function rather than another key on
 * updateProviderContactDetails: this is the one write on `providers` with a
 * cascade behind it, and it must not be reachable by accident from a screen
 * saving unrelated contact fields.
 *
 * Three things are enforced by the DB, not here (see
 * supabase/migrations/20260907000413_provider_service_category_change_cooldown.sql):
 *   - a 90-day cooldown, which throws with a plain-English message naming the
 *     date it reopens — surface that message rather than a generic one;
 *   - custom_service_type cleared unless the new type is OTHER;
 *   - portfolio photos still carrying the old headline category re-stamped to
 *     the new one, and provider_specialties dropped (the old set comes from a
 *     pool the new type doesn't offer, so nothing in the UI could clear it).
 *
 * Callers must warn about that cascade BEFORE calling. It is not reversible by
 * calling again with the old value — the cooldown will refuse, and the
 * specialties are already gone.
 */
export async function updateMyServiceCategory(
  providerId: string,
  category: ServiceCategory,
  customServiceType: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("providers")
    .update({
      service_category: category,
      // Only meaningful for OTHER; the trigger nulls it for every other
      // category regardless, so sending it here is belt-and-braces for the
      // OTHER -> OTHER-with-a-new-label case the trigger doesn't fire on.
      custom_service_type: category === "OTHER" ? customServiceType : null,
    })
    .eq("id", providerId);
  if (error) throw error;
}

/** Fetch just the specialty list for a provider (settings screen prefill) */
export async function getProviderSpecialties(
  providerId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("provider_specialties")
    .select("specialty")
    .eq("provider_id", providerId);
  if (error) throw error;
  return (data ?? []).map((row) => row.specialty as string);
}

/**
 * Replace the full specialty set for the calling provider (not a merge).
 * Goes through a SECURITY DEFINER RPC (not a client-side delete+insert) so
 * the swap is one transaction — a plain two-step delete-then-insert would
 * leave a provider with zero specialties if the insert failed after the
 * delete had already committed.
 */
export async function replaceMyProviderSpecialties(
  specialties: string[],
): Promise<void> {
  const { error } = await supabase.rpc("replace_my_provider_specialties", {
    p_specialties: specialties,
  });
  if (error) throw error;
}

export interface ProviderMessageTemplate {
  id: string;
  label: string;
  content: string;
  sort_order: number;
}

/** Provider-only templates: never exposed to clients or included in chats. */
export async function getMyProviderMessageTemplates(): Promise<
  ProviderMessageTemplate[]
> {
  const { data, error } = await supabase
    .from("provider_message_templates")
    .select("id, label, content, sort_order")
    .order("sort_order")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as ProviderMessageTemplate[];
}

/** Replaces the caller's private template set atomically in the database. */
export async function replaceMyProviderMessageTemplates(
  templates: Pick<ProviderMessageTemplate, "label" | "content">[],
): Promise<void> {
  const { error } = await supabase.rpc(
    "replace_my_provider_message_templates",
    {
      p_templates: templates.map((template) => ({
        label: template.label.trim(),
        content: template.content.trim(),
      })),
    },
  );
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────
// CLAIMABLE PROVIDER PROFILES
//   Search/preview for the pre-signup "claim your business" flow — see
//   providerClaimService.ts and src/screens/auth/ClaimProviderScreen.tsx.
//   Everything else about the claim flow (OTP send, claim_provider_profile
//   RPC) goes through Edge Functions / .rpc(), not this file.
// ─────────────────────────────────────────────────────────

export interface UnclaimedProviderSearchRow {
  id: string;
  display_name: string;
  service_category: string;
  location_text: string | null;
  logo_url: string | null;
  scraped_fields: string[];
}

/**
 * Search unclaimed (is_claimed = false), scraped provider listings by
 * business name or location text.
 *
 * Unclaimed rows (is_claimed = false) are always has_gone_live = false by
 * construction — they've never been onboarded. This intentionally skips
 * the has_gone_live filter used elsewhere, scoped narrowly to pre-signup
 * claim discovery, not general client browse. The real safety gate here is
 * `is_claimed = false`, not RLS — has_gone_live has no RLS backing
 * anywhere in this schema.
 */
export async function searchUnclaimedProviders(
  query: string,
): Promise<UnclaimedProviderSearchRow[]> {
  const safeQuery = sanitizeIlikeTerm(query.trim());
  if (safeQuery.length < 2) return [];
  const { data, error } = await supabase
    .from("providers")
    .select(
      "id, display_name, service_category, location_text, logo_url, scraped_fields",
    )
    .eq("is_claimed", false)
    .or(
      `display_name.ilike.%${safeQuery}%,location_text.ilike.%${safeQuery}%`,
    )
    .limit(20);

  if (error) throw error;
  return data ?? [];
}

export interface UnclaimedProviderDetailRow extends UnclaimedProviderSearchRow {
  about_text: string | null;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  website: string | null;
}

/**
 * Fuller row for the claim preview step, once one search result has been
 * picked. Same is_claimed = false gate as searchUnclaimedProviders above —
 * see that function's comment for why has_gone_live isn't checked here.
 */
export async function getUnclaimedProviderDetail(
  id: string,
): Promise<UnclaimedProviderDetailRow | null> {
  const { data, error } = await supabase
    .from("providers")
    .select(
      "id, display_name, service_category, location_text, logo_url, scraped_fields, about_text, phone, email, instagram, website",
    )
    .eq("id", id)
    .eq("is_claimed", false)
    .maybeSingle();

  if (error) throw error;
  return data;
}
