// Database access: Promotions and promo codes.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import { supabase } from "../../lib/supabase";
import type { ClientPromotion, DbPromotion, DbService, PublicPromotionWithProvider } from "../../types/database";
import { ukTodayYMD } from "../../utils/bookingHorizon";
import { getSessionUser, ownProviderIdExclusion } from "./account";
import { DEFAULT_PROVIDER_QUERY_LIMIT } from "./providers";

// ─────────────────────────────────────────────────────────
// PROMOTIONS
// ─────────────────────────────────────────────────────────

/** Fetch active, non-expired promotions with provider info. Optionally filter by service category. */
export async function getActivePromotions(
  category?: string,
): Promise<PublicPromotionWithProvider[]> {
  let query = supabase
    .from("promotions")
    .select(
      "id, provider_id, title, description, discount_text, discount_percent, discount_amount, service_category, service_ids, promo_code, valid_from, valid_until, is_active, image_url, created_at, providers!inner(display_name, logo_url, logo_framing, slug)",
    )
    .eq("providers.is_active", true)
    .eq("providers.has_gone_live", true)
    .eq("is_active", true)
    // A provider's own offer is not an offer to them (see
    // ownProviderIdExclusion).
    .not("provider_id", "in", await ownProviderIdExclusion())
    .gte("valid_until", new Date().toISOString().split("T")[0])
    .order("created_at", { ascending: false })
    .limit(DEFAULT_PROVIDER_QUERY_LIMIT);

  if (category && category !== "ALL") {
    query = query.eq("service_category", category);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as PublicPromotionWithProvider[];
}

/** Provider ids with a live offer, for lightweight badges on provider cards. */
export async function getProviderIdsWithActivePromotions(): Promise<string[]> {
  const { data, error } = await supabase
    .from("promotions")
    .select("provider_id, providers!inner(id)")
    .eq("providers.is_active", true)
    .eq("providers.has_gone_live", true)
    .eq("is_active", true)
    // Kept in step with getActivePromotions — this badges the cards that
    // list surfaces the offer on, and those cards are already gone.
    .not("provider_id", "in", await ownProviderIdExclusion())
    .gte("valid_until", new Date().toISOString().split("T")[0])
    .limit(DEFAULT_PROVIDER_QUERY_LIMIT);
  if (error) throw error;
  return [...new Set((data ?? []).map((row) => row.provider_id))];
}

/** Fetch active, non-expired promotions for a specific provider UUID (client-facing) */
export async function getProviderActivePromotions(
  providerDbId: string,
): Promise<ClientPromotion[]> {
  const { data, error } = await supabase
    .from("promotions")
    .select(
      "id, provider_id, title, description, discount_text, discount_percent, discount_amount, service_category, service_ids, promo_code, valid_from, valid_until, is_active, image_url, created_at",
    )
    .eq("provider_id", providerDbId)
    .eq("is_active", true)
    .gte("valid_until", new Date().toISOString().split("T")[0])
    .order("valid_from", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as ClientPromotion[];
}

/** Fetch all promotions belonging to the currently signed-in provider */
export async function getMyPromotions(): Promise<DbPromotion[]> {
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) throw new Error("Not authenticated");

  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!provider) return [];

  const { data, error } = await supabase
    .from("promotions")
    .select(
      "id, provider_id, title, description, discount_text, discount_percent, discount_amount, service_category, service_ids, promo_code, valid_from, valid_until, is_active, image_url, scheduled_notify_at, notify_sent_at, created_at",
    )
    .eq("provider_id", provider.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return data ?? [];
}

export interface UpsertPromotionInput {
  id?: string;
  title: string;
  description?: string;
  discount_text?: string;
  discount_percent?: number;
  discount_amount?: number;
  service_category?: string;
  service_ids?: string[] | null;
  promo_code?: string | null;
  valid_from: string;
  valid_until: string;
  is_active?: boolean;
  image_url?: string | null;
  scheduled_notify_at?: string | null;
  notify_sent_at?: string | null;
}

/** Create or update a promotion for the currently signed-in provider */
export async function upsertPromotion(
  input: UpsertPromotionInput,
): Promise<DbPromotion> {
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) throw new Error("Not authenticated");

  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!provider) throw new Error("No provider profile found");

  const row = {
    ...input,
    provider_id: provider.id,
    is_active: input.is_active ?? true,
  };

  const { data, error } = await supabase
    .from("promotions")
    .upsert(row, { onConflict: "id" })
    .select()
    .single();

  if (error) throw error;
  return data as DbPromotion;
}

/** Toggle the is_active flag on a promotion */
export async function togglePromotion(
  id: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("promotions")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw error;
}

/** Permanently delete a promotion */
export async function deletePromotion(id: string): Promise<void> {
  const { error } = await supabase.from("promotions").delete().eq("id", id);
  if (error) throw error;
}

/** Partial update — only the fields provided are changed, no full replace */
export async function patchPromotion(
  id: string,
  patch: Partial<UpsertPromotionInput>,
): Promise<void> {
  const { error } = await supabase
    .from("promotions")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

/** Fetch active services for the currently signed-in provider */
export async function getMyProviderServices(): Promise<
  import("../../types/database").DbService[]
> {
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) throw new Error("Not authenticated");

  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!provider) return [];

  const { data, error } = await supabase
    .from("services")
    .select(
      "id, provider_id, category_name, category_description, name, description, price, price_max, duration_minutes, buffer_before_mins, buffer_after_mins, is_active, sort_order, created_at, tags, technique_tags, outcome_tags, occasion_tags, trend_names, is_pregnancy_safe, patch_test_required, min_age, contraindications, hair_types_suitable, skin_tones_suitable, audience, aftercare_notes, service_type, service_add_ons ( id, service_id, name, price, description, is_active, extra_minutes, provider_add_on_id )",
    )
    .eq("provider_id", provider.id)
    .eq("is_active", true)
    .eq("service_add_ons.is_active", true)
    .order("sort_order", { ascending: true })
    .limit(200)
    .limit(50, { referencedTable: "service_add_ons" });

  if (error) throw error;
  return (data ?? []).map((s: any) => ({
    ...s,
    add_ons: (s.service_add_ons ?? []).filter((a: any) => a.is_active),
  }));
}

// ─────────────────────────────────────────────────────────
// PROMO CODES (client redemption at checkout)
// ─────────────────────────────────────────────────────────

/** Look up a live promotion by promo code for a provider (by display name).
 *  Returns null when the code doesn't exist, is inactive, or is outside its
 *  validity window. */
export async function validatePromoCode(
  providerDisplayName: string,
  code: string,
): Promise<DbPromotion | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("display_name", providerDisplayName)
    .maybeSingle();
  if (!provider) return null;

  // UK date, as prepare_checkout uses: the UTC date would call a code that
  // ended at midnight valid until 1am in summer, and the server would refuse it.
  const today = ukTodayYMD();
  const { data } = await supabase
    .from("promotions")
    .select("*")
    .eq("provider_id", (provider as any).id)
    .ilike("promo_code", trimmed)
    .eq("is_active", true)
    .lte("valid_from", today)
    .gte("valid_until", today)
    // Newest first, the same row prepare_checkout picks if a provider ever
    // has two live promotions with one code.
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as DbPromotion) ?? null;
}
