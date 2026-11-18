// Database access: Notifications and notification preferences.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import type { LiveServiceDescription } from "../../features/providers/descriptionTopics";
import type { SpecialityUse } from "../../utils/learnedSpecialities";
import { clearCachedReads, supabase } from "../../lib/supabase";
import type { DbNotification, NotificationType } from "../../types/database";
import { logger } from "../../utils/logger";
import type { ProviderAchievements } from "../../types/achievements";
import { getSessionUser } from "./account";
import { DEFAULT_LIFETIME_BOOKINGS_QUERY_LIMIT, getMyProviderProfile, LIVE_SERVICE_DESCRIPTIONS_QUERY_LIMIT, SPECIALITY_USES_QUERY_LIMIT } from "./providers";

// ─────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────

/** Fetch all notifications for the current user */
export async function getMyNotifications(
  role: "provider" | "client",
  limit = 50,
): Promise<DbNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select(
      "id, user_id, type, title, message, priority, is_read, is_actionable, booking_id, provider_id, metadata, created_at, recipient_role",
    )
    .eq("recipient_role", role)
    .order("created_at", { ascending: false })
    // The notification drawer is an inbox preview, not an archive. A smaller
    // first page gets the recent, actionable items onto screen faster; older
    // history remains available through the notification centre's pagination
    // when that is added.
    .limit(Math.min(Math.max(Math.trunc(limit), 1), 100));

  if (error) throw error;
  return data ?? [];
}

/** Realtime notification changes for one authenticated user. */
export function subscribeToNotificationChanges(
  userId: string,
  onInsert: (notification: DbNotification) => void,
  onUpdate: (notification: DbNotification) => void,
): () => void {
  const channel = supabase
    .channel(`notifications-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        clearCachedReads();
        onInsert(payload.new as DbNotification);
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        clearCachedReads();
        onUpdate(payload.new as DbNotification);
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Mark a notification as read. Routed through a SECURITY DEFINER RPC that can
 *  only touch is_read — see fix_notifications_update_bypass.sql. */
export async function markNotificationRead(
  notificationId: string,
): Promise<void> {
  const { error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: notificationId,
  });

  if (error) throw error;
}

/** Mark all notifications as read */
export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) throw error;
}

/** Notify the provider for a booking owned by the signed-in client. */
export async function insertProviderNotification(params: {
  provider_id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority?: "high" | "medium" | "low";
  is_actionable?: boolean;
  booking_id?: string;
}): Promise<void> {
  if (!params.booking_id) {
    throw new Error("A booking is required when notifying a provider");
  }

  const { error } = await supabase.rpc(
    "send_client_provider_booking_notification",
    {
      p_booking_id: params.booking_id,
      p_type: params.type,
      p_title: params.title,
      p_message: params.message,
      p_priority: params.priority ?? "medium",
      p_is_actionable: params.is_actionable ?? false,
      p_metadata: {},
    },
  );
  if (error) {
    // Surface the failure — callers decide whether it's fatal. Swallowing it
    // here is how RLS-blocked inserts went unnoticed.
    logger.warn("[insertProviderNotification] insert failed:", error.message);
    throw error;
  }
}

/** Count unread notifications for the given recipient role */
const unreadNotificationCountCache = new Map<"provider" | "client", {
  value: number;
  fetchedAt: number;
}>();
const UNREAD_NOTIFICATION_COUNT_TTL_MS = 15_000;

export async function getUnreadNotificationCount(
  role: "provider" | "client",
): Promise<number> {
  const cached = unreadNotificationCountCache.get(role);
  if (cached && Date.now() - cached.fetchedAt < UNREAD_NOTIFICATION_COUNT_TTL_MS) {
    return cached.value;
  }
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false)
    .eq("recipient_role", role);
  if (error) return 0;
  const value = count ?? 0;
  unreadNotificationCountCache.set(role, { value, fetchedAt: Date.now() });
  return value;
}

// ─────────────────────────────────────────────────────────
// NOTIFICATION PREFERENCES
// ─────────────────────────────────────────────────────────

export interface NotificationPreferences {
  bookingConfirm: boolean;
  bookingReminder: boolean;
  bookingUpdates: boolean;
  promotions: boolean;
  newProviders: boolean;
  weeklySummary: boolean;
  /** Beauty Maintenance pushes (due reminders, aftercare notices). OFF until
   *  the client opts in — the server writes no maintenance notification at all
   *  while this is false. Booking reminders stay under bookingReminder. */
  maintenanceReminders: boolean;
}

export const DEFAULT_NOTIF_PREFS: NotificationPreferences = {
  bookingConfirm: true,
  bookingReminder: true,
  bookingUpdates: true,
  promotions: false,
  newProviders: true,
  weeklySummary: false,
  maintenanceReminders: false,
};

/**
 * The provider hat's push switches. Same users.notification_preferences column
 * as the client's, under keys of their own, so a dual-hat account's two
 * screens never switch each other's notifications off. The edge function only
 * reads these for notifications addressed to the provider role.
 */
export interface ProviderNotificationPreferences {
  providerNewBookings: boolean;
  providerBookingChanges: boolean;
  providerReminders: boolean;
  providerForms: boolean;
  providerMessages: boolean;
  providerPayments: boolean;
  providerReviews: boolean;
  providerDailyRecap: boolean;
  providerFullyBooked: boolean;
  providerSaves: boolean;
  providerWaitlist: boolean;
}

export const DEFAULT_PROVIDER_NOTIF_PREFS: ProviderNotificationPreferences = {
  providerNewBookings: true,
  providerBookingChanges: true,
  providerReminders: true,
  providerForms: true,
  providerMessages: true,
  providerPayments: true,
  providerReviews: true,
  providerDailyRecap: true,
  providerFullyBooked: true,
  providerSaves: true,
  providerWaitlist: true,
};

/** The signed-in user's whole stored preferences object, both hats' keys. */
async function readStoredNotificationPreferences(): Promise<{ userId: string; stored: Record<string, unknown> }> {
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("users")
    .select("notification_preferences")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  const stored = data?.notification_preferences;
  return { userId: user.id, stored: stored && typeof stored === "object" ? stored as Record<string, unknown> : {} };
}

/** Only the keys `defaults` names, each falling back to its default. */
function pickPreferences<T extends { [K in keyof T]: boolean }>(defaults: T, stored: Record<string, unknown>): T {
  const picked = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const value = stored[key as string];
    if (typeof value === "boolean") picked[key] = value as T[keyof T];
  }
  return picked;
}

/** Write one hat's keys without touching the other hat's (read-merge-write). */
async function mergeNotificationPreferences(patch: object): Promise<void> {
  const { userId, stored } = await readStoredNotificationPreferences();
  const { error } = await supabase
    .from("users")
    .update({ notification_preferences: { ...stored, ...patch } })
    .eq("id", userId);
  if (error) throw error;
}

/** Load the user's notification preferences from Supabase */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const { stored } = await readStoredNotificationPreferences();
  return pickPreferences(DEFAULT_NOTIF_PREFS, stored);
}

/** Persist the user's notification preferences to Supabase */
export async function saveNotificationPreferences(
  prefs: NotificationPreferences,
): Promise<void> {
  await mergeNotificationPreferences(pickPreferences(DEFAULT_NOTIF_PREFS, prefs as unknown as Record<string, unknown>));
}

/** Load the provider hat's notification switches. */
export async function getProviderNotificationPreferences(): Promise<ProviderNotificationPreferences> {
  const { stored } = await readStoredNotificationPreferences();
  return pickPreferences(DEFAULT_PROVIDER_NOTIF_PREFS, stored);
}

/** The newest time the signed-in provider's schedule filled that they haven't
 *  seen the certificate for. Null when there's nothing to show. */
export type UnseenFullyBooked = { fillId: string; filledAt: string; throughDate: string };

export async function getMyUnseenFullyBooked(): Promise<UnseenFullyBooked | null> {
  const { data, error } = await supabase.rpc("get_my_unseen_fully_booked");
  if (error) throw error;
  const row = (data as Array<{ fill_id: string; filled_at: string; through_date: string }> | null)?.[0];
  return row ? { fillId: row.fill_id, filledAt: row.filled_at, throughDate: row.through_date } : null;
}

/** Marks this fill, and any older unseen ones, as seen, so the certificate shows once. */
export async function markFullyBookedSeen(fillId: string): Promise<void> {
  const { error } = await supabase.rpc("mark_fully_booked_seen", { p_fill_id: fillId });
  if (error) throw error;
}

/** The signed-in provider's achievements. The server owns the rules and records
 *  anything newly earned as part of this call. */
export async function getMyProviderAchievements(): Promise<ProviderAchievements> {
  const { data, error } = await supabase.rpc('get_my_provider_achievements');
  if (error) throw error;
  return data as ProviderAchievements;
}

/** Persist the provider hat's notification switches, leaving the client's alone. */
export async function saveProviderNotificationPreferences(
  prefs: ProviderNotificationPreferences,
): Promise<void> {
  await mergeNotificationPreferences(pickPreferences(DEFAULT_PROVIDER_NOTIF_PREFS, prefs as unknown as Record<string, unknown>));
}

/** Turn Beauty Maintenance pushes on or off without touching any other
 *  notification setting (read-merge-write on the one JSON column). */
export async function setMaintenanceRemindersOptIn(enabled: boolean): Promise<void> {
  const current = await getNotificationPreferences();
  await saveNotificationPreferences({ ...current, maintenanceReminders: enabled });
}

/** Count how many users have bookmarked the currently logged-in provider */
export async function getMyBookmarkCount(): Promise<number> {
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) return 0;
  const { data: providerRow } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!providerRow) return 0;
  const { count, error } = await supabase
    .from("bookmarks")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", providerRow.id);
  if (error) throw error;
  return count ?? 0;
}

/** The provider's own bookings by service and date, from `sinceDaysAgo` on, for
 *  the dashboard's graphs.
 *
 *  Reads the snapshot name and date only, not the bookings themselves, so the
 *  dashboard costs one narrow query rather than the full booking history the
 *  analytics screen pulls. Counts confirmed and completed appointments: a
 *  cancellation is not evidence of popularity. */
export async function getMyServiceBookingRows(
  sinceDaysAgo: number,
): Promise<{ name: string; date: string }[]> {
  const provider = await getMyProviderProfile();
  if (!provider) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - sinceDaysAgo);

  const { data, error } = await supabase
    .from("bookings")
    .select("service_name_snapshot, booking_date")
    .eq("provider_id", provider.id)
    .in("status", ["completed", "confirmed"])
    .gte("booking_date", cutoff.toISOString().split("T")[0])
    .limit(DEFAULT_LIFETIME_BOOKINGS_QUERY_LIMIT);
  if (error) throw error;

  return ((data ?? []) as { service_name_snapshot: string | null; booking_date: string }[])
    .filter((row) => !!row.service_name_snapshot)
    .map((row) => ({ name: row.service_name_snapshot as string, date: row.booking_date }));
}

/** What live providers list as their specialities, for learning new terms.
 *  has_gone_live: only what's already public on a profile counts. */
export async function getSpecialityUses(): Promise<SpecialityUse[]> {
  const { data, error } = await supabase
    .from("provider_specialties")
    .select("specialty, provider_id, providers!inner(service_categories, has_gone_live, is_active)")
    .eq("providers.has_gone_live", true)
    .eq("providers.is_active", true)
    .limit(SPECIALITY_USES_QUERY_LIMIT);
  if (error) throw error;
  type Row = {
    specialty: string;
    provider_id: string;
    providers: { service_categories: string[] | null } | { service_categories: string[] | null }[];
  };
  return ((data ?? []) as unknown as Row[]).map((row) => {
    const provider = Array.isArray(row.providers) ? row.providers[0] : row.providers;
    return {
      specialty: row.specialty,
      providerId: row.provider_id,
      categories: provider?.service_categories ?? [],
    };
  });
}

/** Live providers' service names and descriptions, for learning what similar
 *  services tend to mention. has_gone_live: only what's already public counts. */
export async function getLiveServiceDescriptions(): Promise<LiveServiceDescription[]> {
  const { data, error } = await supabase
    .from("services")
    .select("name, description, provider_id, providers!inner(has_gone_live, is_active)")
    .eq("is_active", true)
    .eq("providers.has_gone_live", true)
    .eq("providers.is_active", true)
    .not("description", "is", null)
    .limit(LIVE_SERVICE_DESCRIPTIONS_QUERY_LIMIT);
  if (error) throw error;
  return ((data ?? []) as { name: string | null; description: string | null; provider_id: string }[])
    .filter((row) => !!row.name && !!row.description?.trim())
    .map((row) => ({ name: row.name as string, description: row.description as string, providerId: row.provider_id }));
}

/** Update the maximum number of confirmed bookings a provider accepts per day (0 = unlimited) */
export async function updateProviderMaxBookingsPerDay(
  providerId: string,
  maxPerDay: number,
): Promise<void> {
  const { error } = await supabase
    .from("providers")
    .update({ max_bookings_per_day: maxPerDay })
    .eq("id", providerId);
  if (error) throw error;
}

/**
 * Fetch a provider's auto-accept flag and daily booking cap.
 * Returns defaults (false, 0) on any error so callers can treat it as safe.
 */
export async function getProviderBookingCapSettings(
  providerId: string,
): Promise<{ auto_accept: boolean; max_per_day: number }> {
  const { data, error } = await supabase
    .from("providers")
    .select("auto_accept_bookings, max_bookings_per_day")
    .eq("id", providerId)
    .single();
  if (error || !data) return { auto_accept: false, max_per_day: 0 };
  return {
    auto_accept: (data as any).auto_accept_bookings ?? false,
    max_per_day: (data as any).max_bookings_per_day ?? 0,
  };
}

/**
 * Batched form of getProviderBookingCapSettings, keyed by provider id.
 * Providers not returned (deleted/RLS) are omitted — callers should fall
 * back to the same {auto_accept: false, max_per_day: 0} default.
 */
export async function getProviderBookingCapSettingsForProviders(
  providerIds: string[],
): Promise<Record<string, { auto_accept: boolean; max_per_day: number }>> {
  if (providerIds.length === 0) return {};

  const { data, error } = await supabase
    .from("providers")
    .select("id, auto_accept_bookings, max_bookings_per_day")
    .in("id", providerIds);

  if (error || !data) return {};

  const result: Record<string, { auto_accept: boolean; max_per_day: number }> =
    {};
  for (const p of data as any[]) {
    result[p.id] = {
      auto_accept: p.auto_accept_bookings ?? false,
      max_per_day: p.max_bookings_per_day ?? 0,
    };
  }
  return result;
}

/**
 * Count non-cancelled, non-no_show bookings for a provider on a given date.
 * Used to enforce max_bookings_per_day.
 */
export async function countProviderBookingsOnDate(
  providerId: string,
  date: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", providerId)
    .eq("booking_date", date)
    .not("status", "in", '("cancelled","no_show")');
  if (error) throw error;
  return count ?? 0;
}

/**
 * Batched form of countProviderBookingsOnDate for multiple (providerId, date)
 * pairs at once — one query per unique date rather than one per cart item,
 * since Supabase can't OR-combine per-pair filters in a single round trip.
 * Keyed by `${providerId}|${date}`.
 */
export async function countProviderBookingsOnDates(
  pairs: { providerId: string; date: string }[],
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  if (pairs.length === 0) return result;

  const uniqueDates = [...new Set(pairs.map((p) => p.date))];
  const uniqueProviderIds = [...new Set(pairs.map((p) => p.providerId))];

  const { data, error } = await supabase
    .from("bookings")
    .select("provider_id, booking_date")
    .in("provider_id", uniqueProviderIds)
    .in("booking_date", uniqueDates)
    .not("status", "in", '("cancelled","no_show")');
  if (error) throw error;

  for (const row of (data ?? []) as {
    provider_id: string;
    booking_date: string;
  }[]) {
    const key = `${row.provider_id}|${row.booking_date}`;
    result[key] = (result[key] ?? 0) + 1;
  }
  // Ensure every requested pair has a key, even with zero matches.
  for (const { providerId, date } of pairs) {
    const key = `${providerId}|${date}`;
    if (!(key in result)) result[key] = 0;
  }
  return result;
}

// ─────────────────────────────────────────────────────────
// NOTIFICATIONS — delete
// ─────────────────────────────────────────────────────────

/** Permanently delete a notification row (swipe-to-delete in NotificationsScreen).
 *  Routed through delete_own_notification() — notifications has no client-side
 *  DELETE policy, so a plain .delete() silently matches zero rows. */
export async function deleteNotification(
  notificationId: string,
): Promise<void> {
  const { error } = await supabase.rpc("delete_own_notification", {
    p_notification_id: notificationId,
  });
  if (error) throw error;
}
