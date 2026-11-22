// Database access: User interactions and provider profile stats.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import { supabase } from "../../lib/supabase";
import type { DbProviderDailyStat, ProviderStatKind } from "../../types/database";
import { getSessionUser } from "./account";
import { UUID_RE } from "./social";

// ─────────────────────────────────────────────────────────
// USER INTERACTIONS — analytics / personalization
// ─────────────────────────────────────────────────────────

/** Record a user interaction for the personalization algorithm */
export async function trackUserInteraction(interaction: {
  type: "view" | "search" | "favorite" | "book" | "offer_view";
  providerId?: string;
  serviceCategory?: string;
  durationSeconds?: number;
}): Promise<void> {
  try {
    const {
      data: { user },
    } = await getSessionUser();
    if (!user) return;

    await supabase.from("user_interactions").insert({
      user_id: user.id,
      type: interaction.type,
      provider_id: interaction.providerId ?? null,
      service_category: interaction.serviceCategory ?? null,
      duration_seconds: interaction.durationSeconds ?? null,
    });
  } catch {
    // Silent — analytics must never block the UI
  }
}

// ─────────────────────────────────────────────────────────
// PROVIDER PROFILE STATS — link-only Analytics counters
// ─────────────────────────────────────────────────────────

/** Count one event for each provider. Search passes its whole result page in
 *  one call (≤200). The server skips providers that aren't live and the
 *  caller's own profile, and does nothing for a signed-out caller. */
export async function recordProviderStat(
  providerIds: readonly string[],
  kind: ProviderStatKind,
): Promise<void> {
  const ids = Array.from(new Set(providerIds.filter((id) => UUID_RE.test(id)))).slice(0, 200);
  if (ids.length === 0) return;
  const { error } = await supabase.rpc("record_provider_stat", {
    p_provider_ids: ids,
    p_kind: kind,
  });
  if (error) throw error;
}

/** The calling provider's own daily counters for the last `days` days. */
export async function getMyProviderDailyStats(days: number): Promise<DbProviderDailyStat[]> {
  const { data, error } = await supabase.rpc("get_my_provider_daily_stats", {
    p_days: days,
  });
  if (error) throw error;
  return (data ?? []) as DbProviderDailyStat[];
}

export interface LinkOnlyDashboardExtras {
  /** Distinct clients who answered "Yes" to "Did you book?" in the last 7 UK days. */
  saidBookedWeek: number;
  /** The same for the 7 days before that, for the trend. */
  saidBookedLastWeek: number;
  /** Distinct clients who saved the provider in the last 7 UK days. */
  newSaversWeek: number;
  /** Their portfolio photo in the most clients' saved lists (all time). */
  topPhoto: { id: string; imageUrl: string; label: string | null; saves: number } | null;
}

/** Counts across other people's rows for the link-only Dashboard, done
 *  server-side — see 20261019234000_link_only_dashboard_extras.sql. Null when
 *  the caller has no provider row. */
export async function getMyLinkOnlyDashboardExtras(): Promise<LinkOnlyDashboardExtras | null> {
  const { data, error } = await supabase.rpc("get_my_link_only_dashboard_extras");
  if (error) throw error;
  const row = ((data ?? []) as {
    said_booked_week: number;
    said_booked_last_week: number;
    new_savers_week: number;
    top_photo_id: string | null;
    top_photo_url: string | null;
    top_photo_label: string | null;
    top_photo_saves: number | null;
  }[])[0];
  if (!row) return null;
  return {
    saidBookedWeek: row.said_booked_week,
    saidBookedLastWeek: row.said_booked_last_week,
    newSaversWeek: row.new_savers_week,
    topPhoto:
      row.top_photo_id && row.top_photo_url
        ? { id: row.top_photo_id, imageUrl: row.top_photo_url, label: row.top_photo_label, saves: row.top_photo_saves ?? 0 }
        : null,
  };
}

/** How many clients saved (bookmarked) the calling provider. Server-side
 *  because bookmarks RLS only shows a user their own rows. */
export async function getMyProviderSaverCount(): Promise<number> {
  const { data, error } = await supabase.rpc("get_my_provider_saver_count");
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}
