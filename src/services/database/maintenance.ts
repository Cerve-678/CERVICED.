// Database access: Beauty maintenance (client hat).
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import type { MaintenanceBookingContext, MaintenanceBookingNote, MaintenanceIntervalSource, MaintenanceItem, MaintenanceItemKind, MaintenanceItemOrigin, MaintenanceSettings, NewMaintenanceItem, ProtectiveStyle, RebookTarget } from "../../types/maintenance";
import { getMaintenanceServiceType, type MaintenanceTypeKey } from "../../constants/maintenanceServiceTypes";
import { dateToYMD } from "../../utils/dateUtils";
import { supabase } from "../../lib/supabase";
import { getSessionUser } from "./account";
import { DEFAULT_PROVIDER_QUERY_LIMIT } from "./providers";

// ─────────────────────────────────────────────────────────
// BEAUTY MAINTENANCE (client hat) — owner-only tables from
// supabase/migrations/20261018180000_beauty_maintenance.sql.
// None of this is readable by providers, and none of it feeds Becca,
// analytics, search or any provider-facing path.
// ─────────────────────────────────────────────────────────

/** A client's maintenance list is short by nature; this is a safety cap. */
const MAINTENANCE_ITEMS_LIMIT = 200;

const MAINTENANCE_ITEM_COLUMNS =
  "id, kind, origin, title, type_key, provider_id, service_id, provider_name, repeat_weeks, interval_edited, interval_source, learned_days, learned_from, last_done_on, due_on, event_on, paused, note, created_at";

interface MaintenanceItemRow {
  id: string;
  kind: MaintenanceItemKind;
  origin: MaintenanceItemOrigin;
  title: string;
  type_key: string | null;
  provider_id: string | null;
  service_id: string | null;
  provider_name: string | null;
  repeat_weeks: number | null;
  interval_edited: boolean;
  interval_source: MaintenanceIntervalSource;
  learned_days: number | null;
  learned_from: number | null;
  last_done_on: string | null;
  due_on: string | null;
  event_on: string | null;
  paused: boolean;
  note: string | null;
  created_at: string;
}

function mapMaintenanceItem(r: MaintenanceItemRow): MaintenanceItem {
  return {
    id: r.id,
    kind: r.kind,
    origin: r.origin,
    title: r.title,
    // A key this build doesn't know (written by a newer one) degrades to null.
    typeKey: (getMaintenanceServiceType(r.type_key)?.key ?? null) as MaintenanceTypeKey | null,
    providerId: r.provider_id,
    serviceId: r.service_id,
    providerName: r.provider_name,
    repeatWeeks: r.repeat_weeks,
    intervalEdited: r.interval_edited,
    intervalSource: r.interval_source,
    learnedDays: r.learned_days,
    learnedFrom: r.learned_from,
    lastDoneOn: r.last_done_on,
    dueOn: r.due_on,
    eventOn: r.event_on,
    paused: r.paused,
    note: r.note,
    createdAt: r.created_at,
  };
}

async function requireSessionUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await getSessionUser();
  if (error) throw error;
  if (!user) throw new Error("Not signed in");
  return user.id;
}

/** The signed-in client's maintenance items, soonest due first. */
export async function getMaintenanceItems(): Promise<MaintenanceItem[]> {
  const userId = await requireSessionUserId();
  const { data, error } = await supabase
    .from("maintenance_items")
    .select(MAINTENANCE_ITEM_COLUMNS)
    .eq("user_id", userId)
    .order("due_on", { ascending: true })
    .limit(MAINTENANCE_ITEMS_LIMIT);
  if (error) throw error;
  return ((data ?? []) as MaintenanceItemRow[]).map(mapMaintenanceItem);
}

/** Add client-made items (setup suggestions, "Add my own reminder"). */
export async function addMaintenanceItems(items: NewMaintenanceItem[]): Promise<MaintenanceItem[]> {
  if (items.length === 0) return [];
  const userId = await requireSessionUserId();
  const { data, error } = await supabase
    .from("maintenance_items")
    .insert(
      items.map((i) => ({
        user_id: userId,
        kind: i.kind,
        origin: "client" as const,
        title: i.title.trim(),
        type_key: i.typeKey,
        provider_id: i.providerId,
        service_id: i.serviceId,
        provider_name: i.providerName,
        repeat_weeks: i.repeatWeeks,
        last_done_on: i.lastDoneOn,
        due_on: i.dueOn,
        event_on: i.eventOn,
        note: i.note?.trim() || null,
      })),
    )
    .select(MAINTENANCE_ITEM_COLUMNS);
  if (error) throw error;
  return ((data ?? []) as MaintenanceItemRow[]).map(mapMaintenanceItem);
}

/** What the item menu can change. Column grants on the table allow exactly
 *  these; origin, provider, service and push bookkeeping are server-owned. */
export interface MaintenanceItemPatch {
  repeatWeeks?: number;
  /** Set alongside repeatWeeks: a later completed booking keeps this interval. */
  intervalEdited?: boolean;
  dueOn?: string;
  lastDoneOn?: string;
  paused?: boolean;
  /** Empty or whitespace clears it. */
  note?: string;
}

export async function updateMaintenanceItem(
  id: string,
  patch: MaintenanceItemPatch,
): Promise<MaintenanceItem> {
  const userId = await requireSessionUserId();
  const row: {
    repeat_weeks?: number;
    interval_edited?: boolean;
    due_on?: string;
    last_done_on?: string;
    paused?: boolean;
    note?: string | null;
  } = {};
  if (patch.repeatWeeks !== undefined) row.repeat_weeks = patch.repeatWeeks;
  if (patch.intervalEdited !== undefined) row.interval_edited = patch.intervalEdited;
  if (patch.dueOn !== undefined) row.due_on = patch.dueOn;
  if (patch.lastDoneOn !== undefined) row.last_done_on = patch.lastDoneOn;
  if (patch.paused !== undefined) row.paused = patch.paused;
  if (patch.note !== undefined) row.note = patch.note.trim() || null;
  const { data, error } = await supabase
    .from("maintenance_items")
    .update(row)
    .eq("id", id)
    .eq("user_id", userId)
    .select(MAINTENANCE_ITEM_COLUMNS)
    .single();
  if (error) throw error;
  return mapMaintenanceItem(data as MaintenanceItemRow);
}

/** Hard delete. Throws if nothing was removed, so a silent RLS no-op can't
 *  read as success. */
export async function deleteMaintenanceItem(id: string): Promise<void> {
  const userId = await requireSessionUserId();
  const { data, error } = await supabase
    .from("maintenance_items")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Reminder was not deleted");
}

interface MaintenanceSettingsRow {
  protective_style: ProtectiveStyle | null;
  protective_wear_weeks: number | null;
  last_patch_test_on: string | null;
  setup_completed_at: string | null;
}

/** The client's setup answers, or null before they've set anything up. */
export async function getMaintenanceSettings(): Promise<MaintenanceSettings | null> {
  const userId = await requireSessionUserId();
  const { data, error } = await supabase
    .from("maintenance_settings")
    .select("protective_style, protective_wear_weeks, last_patch_test_on, setup_completed_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as MaintenanceSettingsRow;
  return {
    protectiveStyle: r.protective_style,
    protectiveWearWeeks: r.protective_wear_weeks,
    lastPatchTestOn: r.last_patch_test_on,
    setupCompletedAt: r.setup_completed_at,
  };
}

export async function saveMaintenanceSettings(settings: MaintenanceSettings): Promise<void> {
  const userId = await requireSessionUserId();
  const { error } = await supabase.from("maintenance_settings").upsert(
    {
      user_id: userId,
      protective_style: settings.protectiveStyle,
      protective_wear_weeks: settings.protectiveWearWeeks,
      last_patch_test_on: settings.lastPatchTestOn,
      setup_completed_at: settings.setupCompletedAt,
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

interface MaintenanceBookingRow {
  id: string;
  provider_id: string;
  service_id: string | null;
  status: string;
  booking_date: string;
  booking_time: string;
  service_name_snapshot: string;
  provider_name_snapshot: string;
}

/** How far back a completed booking's aftercare stays in "Around your bookings". */
const AFTERCARE_WINDOW_DAYS = 3;
/** Prep shows for appointments today and tomorrow. */
const PREP_WINDOW_DAYS = 1;
/** Completed bookings scanned for past providers. */
const PAST_BOOKINGS_LIMIT = 200;

function addDaysYMD(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return dateToYMD(d);
}

/**
 * Everything the Maintenance screen needs from the client's bookings: prep
 * and aftercare notes (provider-written, quoted as-is), which upcoming
 * bookings already cover an item, and providers to link a reminder to.
 * Three reads in parallel, then one batched read each for the notes.
 */
export async function getMaintenanceBookingContext(): Promise<MaintenanceBookingContext> {
  const userId = await requireSessionUserId();
  const today = dateToYMD(new Date());
  const columns =
    "id, provider_id, service_id, status, booking_date, booking_time, service_name_snapshot, provider_name_snapshot";

  // client_bookings: the address-gated view, filtered to the client side
  // explicitly (see getMyBookings for why a dual-hat account needs that).
  const [upcomingRes, completedRes] = await Promise.all([
    supabase
      .from("client_bookings")
      .select(columns)
      .eq("user_id", userId)
      .in("status", ["pending", "confirmed", "in_progress"])
      .gte("booking_date", today)
      .order("booking_date", { ascending: true })
      .limit(DEFAULT_PROVIDER_QUERY_LIMIT),
    supabase
      .from("client_bookings")
      .select(columns)
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("booking_date", { ascending: false })
      .limit(PAST_BOOKINGS_LIMIT),
  ]);
  if (upcomingRes.error) throw upcomingRes.error;
  if (completedRes.error) throw completedRes.error;
  const upcoming = (upcomingRes.data ?? []) as MaintenanceBookingRow[];
  const completed = (completedRes.data ?? []) as MaintenanceBookingRow[];

  const prepLimit = addDaysYMD(PREP_WINDOW_DAYS);
  const prepBookings = upcoming.filter((b) => b.booking_date <= prepLimit && b.status !== "pending");
  const aftercareFrom = addDaysYMD(-AFTERCARE_WINDOW_DAYS);
  const aftercareBookings = completed.filter((b) => b.booking_date >= aftercareFrom && b.service_id);
  const aftercareServiceIds = [...new Set(aftercareBookings.map((b) => b.service_id as string))];

  const [packsRes, servicesRes] = await Promise.all([
    prepBookings.length > 0
      ? supabase
          .from("booking_info_packs")
          .select("booking_id, title, content, created_at")
          .eq("client_user_id", userId)
          .in("booking_id", prepBookings.map((b) => b.id))
          .order("created_at", { ascending: true })
          .limit(DEFAULT_PROVIDER_QUERY_LIMIT)
      : Promise.resolve({ data: [], error: null }),
    // services_public_read only exposes live providers' active services, so a
    // provider who has gone offline shows no aftercare — never a fallback.
    aftercareServiceIds.length > 0
      ? supabase.from("services").select("id, aftercare_notes").in("id", aftercareServiceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (packsRes.error) throw packsRes.error;
  if (servicesRes.error) throw servicesRes.error;

  const packsByBooking = new Map<string, MaintenanceBookingNote["notes"]>();
  for (const p of (packsRes.data ?? []) as { booking_id: string; title: string | null; content: string | null; created_at: string }[]) {
    const text = p.content?.trim();
    if (!text) continue;
    const list = packsByBooking.get(p.booking_id) ?? [];
    list.push({ title: p.title, text, sentAt: p.created_at });
    packsByBooking.set(p.booking_id, list);
  }
  const aftercareByService = new Map<string, string>();
  for (const s of (servicesRes.data ?? []) as { id: string; aftercare_notes: string | null }[]) {
    const text = s.aftercare_notes?.trim();
    if (text) aftercareByService.set(s.id, text);
  }

  const toNote = (b: MaintenanceBookingRow, notes: MaintenanceBookingNote["notes"]): MaintenanceBookingNote => ({
    bookingId: b.id,
    providerId: b.provider_id,
    providerName: b.provider_name_snapshot,
    serviceName: b.service_name_snapshot,
    bookingDate: b.booking_date,
    bookingTime: b.booking_time,
    notes,
  });

  // Group bookings complete one row per guest for the same service; show
  // that service's aftercare once.
  const seenAftercare = new Set<string>();
  const aftercare: MaintenanceBookingNote[] = [];
  for (const b of aftercareBookings) {
    const text = aftercareByService.get(b.service_id as string);
    const key = `${b.service_id}:${b.booking_date}`;
    if (!text || seenAftercare.has(key)) continue;
    seenAftercare.add(key);
    // The provider's CURRENT note (services has no edit timestamp, so
    // sentAt is null and the card dates it by the appointment instead).
    aftercare.push(toNote(b, [{ title: null, text, sentAt: null }]));
  }

  const pastProviders = new Map<string, string>();
  for (const b of completed) {
    if (!pastProviders.has(b.provider_id)) pastProviders.set(b.provider_id, b.provider_name_snapshot);
  }

  return {
    prep: prepBookings
      .filter((b) => packsByBooking.has(b.id))
      .map((b) => toNote(b, packsByBooking.get(b.id)!)),
    aftercare,
    upcomingServiceIds: [...new Set(upcoming.map((b) => b.service_id).filter((id): id is string => !!id))],
    upcomingProviderIds: [...new Set(upcoming.map((b) => b.provider_id))],
    pastProviders: [...pastProviders].map(([providerId, name]) => ({ providerId, name })),
  };
}

/**
 * Which services and providers the client already has an upcoming booking
 * with — what makes a maintenance item "booked" rather than due. One light
 * query for the Profile tab's "N due" badge.
 */
export async function getUpcomingMaintenanceCoverage(): Promise<{ serviceIds: string[]; providerIds: string[] }> {
  const userId = await requireSessionUserId();
  const { data, error } = await supabase
    .from("client_bookings")
    .select("service_id, provider_id")
    .eq("user_id", userId)
    .in("status", ["pending", "confirmed", "in_progress"])
    .gte("booking_date", dateToYMD(new Date()))
    .limit(DEFAULT_PROVIDER_QUERY_LIMIT);
  if (error) throw error;
  const rows = (data ?? []) as { service_id: string | null; provider_id: string }[];
  return {
    serviceIds: [...new Set(rows.map((r) => r.service_id).filter((id): id is string => !!id))],
    providerIds: [...new Set(rows.map((r) => r.provider_id))],
  };
}

/**
 * Where "Rebook" can go for an item: the provider's public slug when they're
 * live and active (client-facing — has_gone_live gated), plus the service when
 * it's still offered. Null sends the client to Search instead.
 */
export async function getMaintenanceRebookTarget(
  providerId: string,
  serviceId: string | null,
): Promise<RebookTarget | null> {
  const [providerRes, serviceRes] = await Promise.all([
    supabase
      .from("providers")
      .select("slug")
      .eq("id", providerId)
      .eq("has_gone_live", true)
      .eq("is_active", true)
      .maybeSingle(),
    serviceId
      ? supabase
          .from("services")
          .select("id")
          .eq("id", serviceId)
          .eq("provider_id", providerId)
          .eq("is_active", true)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (providerRes.error) throw providerRes.error;
  if (serviceRes.error) throw serviceRes.error;
  const slug = (providerRes.data as { slug: string | null } | null)?.slug;
  if (!slug) return null;
  return { providerSlug: slug, serviceId: (serviceRes.data as { id: string } | null)?.id ?? null };
}

/** Upsert the full user profile row immediately after email OTP verification */
export async function upsertUserAfterVerification(data: {
  id: string;
  email: string;
  name: string;
  phone: string;
  dob: string | null;
  role: string;
  login_method: string;
  service_interests: string[];
  business_name: string | null;
  business_email: string | null;
  business_phone: string | null;
  instagram: string | null;
  tiktok: string | null;
  website: string | null;
  hair_type: string[] | null;
  skin_type: string[] | null;
  allergies: string[];
  skin_concerns: string[];
  style_vibe: string[] | null;
  treatment_history: string[];
  medical_notes: string | null;
  photography_consent: boolean;
  service_locations: string[];
  maintenance_frequency: string | null;
  referral_source: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from("users")
    .upsert(data, { onConflict: "id" });
  if (error) throw error;
}
