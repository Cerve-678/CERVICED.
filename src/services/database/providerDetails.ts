// Database access: Provider contact methods and locations.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import { supabase } from "../../lib/supabase";
import { logger } from "../../utils/logger";
import { ADDRESS_PENDING_PLACEHOLDER, PHONE_PENDING_PLACEHOLDER } from "../../types/booking";
import { getSessionUser } from "./account";
import type { IntakeForm } from "./forms";

// ─────────────────────────────────────────────────────────
// PROVIDER CONTACT METHODS (for client-side contact sheet)
// ─────────────────────────────────────────────────────────

export interface ProviderContactInfo {
  preferred_contact_methods: string[];
  whatsapp_number: string | null;
  email: string | null;
  phone: string | null;
}

function mapContactRow(data: any): ProviderContactInfo | null {
  if (!data) return null;
  return {
    preferred_contact_methods: (data as any).preferred_contact_methods ?? [
      "in_app",
    ],
    whatsapp_number: (data as any).whatsapp_number ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
  };
}

export async function getProviderContactByDisplayName(
  displayName: string,
): Promise<ProviderContactInfo | null> {
  const { data } = await supabase
    .from("providers")
    .select("preferred_contact_methods, whatsapp_number, email, phone")
    .eq("display_name", displayName)
    .eq("is_claimed", true) // never an imported directory listing
    .maybeSingle();
  return mapContactRow(data);
}

/**
 * How the client on `bookingId` can reach that booking's provider — the
 * Contact sheet in Booking Details / Bookings.
 *
 * Server-side (get_booked_client_contact): returns a row only to the client on
 * that booking while it's pending / confirmed / in progress, only for the
 * channels the provider switched on, and with the provider's booked-client
 * details (provider_booked_contact) in place of their public ones wherever
 * they set one. No row → in-app only, never an error.
 */
export async function getBookedClientContact(
  bookingId: string,
): Promise<ProviderContactInfo> {
  const { data, error } = await supabase.rpc("get_booked_client_contact", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | ProviderContactInfo
    | null
    | undefined;
  return (
    mapContactRow(row) ?? {
      preferred_contact_methods: ["in_app"],
      whatsapp_number: null,
      email: null,
      phone: null,
    }
  );
}

/**
 * The calling provider's booked-client contact details — what clients with a
 * booking see instead of the public ones. A null field means "use my public
 * detail" (providers.email / phone / whatsapp_number). Owner-only by RLS.
 */
export interface BookedClientContactDetails {
  email: string | null;
  phone: string | null;
  whatsapp_number: string | null;
}

export async function getMyBookedClientContact(
  providerId: string,
): Promise<BookedClientContactDetails> {
  const { data, error } = await supabase
    .from("provider_booked_contact")
    .select("email, phone, whatsapp_number")
    .eq("provider_id", providerId)
    .maybeSingle();
  if (error) throw error;
  const row = data as BookedClientContactDetails | null;
  return {
    email: row?.email ?? null,
    phone: row?.phone ?? null,
    whatsapp_number: row?.whatsapp_number ?? null,
  };
}

/** Save all three at once; pass null to fall back to the public detail. */
export async function setMyBookedClientContact(
  providerId: string,
  details: BookedClientContactDetails,
): Promise<void> {
  const { error } = await supabase.from("provider_booked_contact").upsert(
    {
      provider_id: providerId,
      email: details.email,
      phone: details.phone,
      whatsapp_number: details.whatsapp_number,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider_id" },
  );
  if (error) throw error;
}

export function mapIntakeForm(d: any): IntakeForm {
  return {
    id: d.id,
    bookingId: d.booking_id,
    providerId: d.provider_id,
    clientUserId: d.client_user_id,
    title: d.title,
    questions: d.questions ?? [],
    answers: d.answers ?? null,
    status: d.status,
    sentAt: d.sent_at,
    completedAt: d.completed_at ?? null,
    requiresSignature: d.requires_signature ?? false,
    clientSignature: d.client_signature ?? null,
    libraryFormId: d.library_form_id ?? null,
    dueAt: d.due_at ?? null,
  };
}

// ─────────────────────────────────────────────────────────
// PROVIDER LOCATIONS — real coordinates from DB
// ─────────────────────────────────────────────────────────

export interface ProviderLocationData {
  address: string;
  coordinates: { latitude: number; longitude: number };
  phone: string;
}

/** Fetch location data for a set of providers by their display names */
export async function getProviderLocationsByDisplayNames(
  displayNames: string[],
): Promise<Record<string, ProviderLocationData>> {
  if (displayNames.length === 0) return {};

  const { data, error } = await supabase
    .from("providers")
    .select("display_name, location_text, latitude, longitude, phone")
    .in("display_name", displayNames)
    .eq("is_claimed", true); // never an imported directory listing

  if (error || !data) return {};

  const result: Record<string, ProviderLocationData> = {};
  // display_name is NOT unique. Letting the last row win would stamp a booking
  // with the WRONG provider's address and coordinates — a silent, permanent
  // error, since these get snapshotted onto the booking. So an ambiguous name
  // resolves to nothing instead: the booking falls back to the "pending"
  // sentinel, which is recoverable where a wrong address is not.
  const ambiguous = new Set<string>();
  for (const p of data) {
    if (p.latitude == null || p.longitude == null) continue;
    if (result[p.display_name]) {
      ambiguous.add(p.display_name);
      continue;
    }
    result[p.display_name] = {
      address: p.location_text ?? ADDRESS_PENDING_PLACEHOLDER,
      coordinates: {
        latitude: Number(p.latitude),
        longitude: Number(p.longitude),
      },
      phone: p.phone ?? PHONE_PENDING_PLACEHOLDER,
    };
  }
  for (const name of ambiguous) {
    logger.warn(
      `[getProviderLocationsByDisplayNames] "${name}" matches multiple providers with coordinates — omitting rather than risk the wrong address`,
    );
    delete result[name];
  }
  return result;
}

/**
 * Returns a set of display names that belong to mobile providers.
 *
 * Client-facing (Becca answers "do they travel?" from it), so it carries the
 * same has_gone_live/is_active gate as every other client-facing provider
 * query — it was the one mobile-provider lookup missing it, while the
 * checkout-side getProviderCheckoutMetadata already had it.
 */
export async function getMobileProviderDisplayNames(
  displayNames: string[],
): Promise<Set<string>> {
  if (displayNames.length === 0) return new Set();
  const { data, error } = await supabase
    .from("providers")
    .select("display_name, business_type")
    .eq("has_gone_live", true)
    .eq("is_active", true)
    .in("display_name", [...new Set(displayNames)].slice(0, 50));
  if (error || !data) return new Set();
  return new Set(
    (data as { display_name: string; business_type: string | null }[])
      .filter((p) => p.business_type === "mobile")
      .map((p) => p.display_name),
  );
}

/**
 * Of the given provider ids, which ones are live and active — i.e. a client
 * can still open their profile and book them. Used to drop a saved cart's
 * items from providers who went offline while the cart sat in storage.
 * Throws on error so the caller can tell "not live" apart from "couldn't check".
 */
export async function getLiveProviderIds(
  providerIds: string[],
): Promise<Set<string>> {
  if (providerIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("providers")
    .select("id")
    .in("id", providerIds)
    .eq("is_active", true)
    .eq("has_gone_live", true)
    .limit(providerIds.length);
  if (error) throw error;
  return new Set(((data ?? []) as { id: string }[]).map((p) => p.id));
}

/** Of the given provider ids, which ones require a consultation before a new client's first booking. */
export async function getConsultationRequiredProviderIds(
  providerIds: string[],
): Promise<Set<string>> {
  if (providerIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("providers")
    .select("id, consultation_required_new_clients")
    .in("id", providerIds);
  if (error || !data) return new Set();
  return new Set(
    (
      data as {
        id: string;
        consultation_required_new_clients: boolean | null;
      }[]
    )
      .filter((p) => p.consultation_required_new_clients)
      .map((p) => p.id),
  );
}

/** Of the given provider ids, which ones the current client already has a real (non-cancelled) booking with. */
export async function getProviderIdsWithBookingHistory(
  providerIds: string[],
): Promise<Set<string>> {
  if (providerIds.length === 0) return new Set();
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) return new Set();
  const { data, error } = await supabase
    .from("bookings")
    .select("provider_id")
    .eq("user_id", user.id)
    .in("provider_id", providerIds)
    .neq("status", "cancelled");
  if (error || !data) return new Set();
  return new Set((data as { provider_id: string }[]).map((b) => b.provider_id));
}

/** Whether the current client has a real (non-cancelled) booking, of any status/date, with this specific provider. */
export async function hasBookingHistoryWithProvider(
  providerId: string,
): Promise<boolean> {
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from("bookings")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider_id", providerId)
    .neq("status", "cancelled")
    .limit(1);
  if (error || !data) return false;
  return data.length > 0;
}

/** Of the given service ids, which ones are consultation-type services. */
export async function getConsultationServiceIds(
  serviceIds: string[],
): Promise<Set<string>> {
  if (serviceIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("services")
    .select("id, service_type")
    .in("id", serviceIds);
  if (error || !data) return new Set();
  return new Set(
    (data as { id: string; service_type: string | null }[])
      .filter((s) => s.service_type === "consultation")
      .map((s) => s.id),
  );
}

export interface ProviderConsultationService {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  description: string;
  categoryName: string;
  imageUrl: string | null;
}

/** The provider's bookable consultation service, if they have one — used by
 *  Becca's "do I need a consultation first" answer to point at a real
 *  bookable service instead of guessing. */
export async function getProviderConsultationService(
  providerId: string,
): Promise<ProviderConsultationService | null> {
  const { data, error } = await supabase
    .from("services")
    .select(
      "id, name, price, duration_minutes, description, category_name, service_images ( url, sort_order )",
    )
    .eq("provider_id", providerId)
    .eq("service_type", "consultation")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const images = ((data as any).service_images ?? []) as {
    url: string;
    sort_order: number;
  }[];
  const firstImage = images.sort((a, b) => a.sort_order - b.sort_order)[0];
  return {
    id: data.id,
    name: data.name,
    price: Number(data.price),
    durationMinutes: data.duration_minutes,
    description: data.description ?? "",
    categoryName: data.category_name,
    imageUrl: firstImage?.url ?? null,
  };
}
