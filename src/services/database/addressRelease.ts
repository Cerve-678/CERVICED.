// Database access: When a provider's full address is released to a client.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import { supabase } from "../../lib/supabase";
import type { BusinessType } from "../../types/database";
import type { AddressReleasePolicy } from "../../features/business-details/options";
import { getSessionUser } from "./account";
import { DEFAULT_PROVIDER_QUERY_LIMIT, getMyProviderProfile } from "./providers";

// ─────────────────────────────────────────────────────────
// ADDRESS RELEASE POLICY
// ─────────────────────────────────────────────────────────

export interface ProviderAddressPolicy {
  business_type: BusinessType | null;
  address_release_policy: AddressReleasePolicy | null;
}

export interface PublicProviderAddress {
  fullAddress: string;
  latitude: number | null;
  longitude: number | null;
}

/**
 * A provider's full address for their public profile — only for a live salon
 * or studio that chose "Always visible". get_public_provider_address decides
 * that server-side and returns no row for anyone else, so null here means
 * "show the area only", never "not loaded".
 */
export async function getPublicProviderAddress(
  providerId: string,
): Promise<PublicProviderAddress | null> {
  const { data, error } = await supabase.rpc("get_public_provider_address", {
    p_provider_id: providerId,
  });
  if (error) throw error;
  const row = (data as { full_address: string; latitude: number | string | null; longitude: number | string | null }[] | null)?.[0];
  if (!row) return null;
  return {
    fullAddress: row.full_address,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
  };
}

/**
 * The calling provider's own private street address.
 * RLS on provider_private_details scopes this to the owner — it cannot return
 * anyone else's, regardless of what id is passed anywhere else in the app.
 */
export async function getMyProviderFullAddress(): Promise<string | null> {
  const provider = await getMyProviderProfile();
  if (!provider) return null;
  const { data } = await supabase
    .from("provider_private_details")
    .select("full_address")
    .eq("provider_id", provider.id)
    .maybeSingle();
  return (
    (data as { full_address?: string | null } | null)?.full_address ?? null
  );
}

/**
 * Whether the calling provider's own private address satisfies the *same*
 * condition the server enforces before it will flip `has_gone_live` — see
 * check_and_set_provider_live(), which requires a non-blank `full_address`
 * AND real geocoded `latitude`/`longitude`.
 *
 * The go-live checklist must test exactly this, not just the address string:
 * an address saved without coordinates let the checklist tick its last box
 * and disappear while the database still refused to publish the provider,
 * leaving them with nothing on screen explaining why they weren't live.
 */
export async function hasMyProviderGoLiveAddress(
  knownProviderId?: string,
): Promise<boolean> {
  // Callers that already hold the provider row pass its id straight through —
  // re-resolving it here would mean a second auth lookup plus a second
  // providers read for a caller that fetched both a moment ago.
  let providerId = knownProviderId;
  if (!providerId) {
    const provider = await getMyProviderProfile();
    if (!provider) return false;
    providerId = provider.id;
  }
  const { data, error } = await supabase
    .from("provider_private_details")
    .select("full_address, latitude, longitude")
    .eq("provider_id", providerId)
    .maybeSingle();
  if (error) throw error;
  const row = data as {
    full_address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  return (
    !!row &&
    (row.full_address ?? "").trim() !== "" &&
    row.latitude != null &&
    row.longitude != null
  );
}

/**
 * Save the calling provider's own private street address, plus the real
 * coordinates it geocoded to (see providerRegistrationService.ts's
 * geocodeAndValidateUkAddress) — used by stamp_booking_address_snapshot() to
 * stamp a released booking's map pin with the real location instead of the
 * approximate location_text geocode. Pass null coordinates only for an
 * address being cleared, never for one that's being set.
 */
export async function setMyProviderFullAddress(
  providerId: string,
  fullAddress: string | null,
  latitude: number | null = null,
  longitude: number | null = null,
  howToGetThere: string | null = null,
): Promise<void> {
  const { error } = await supabase.from("provider_private_details").upsert(
    {
      provider_id: providerId,
      full_address: fullAddress,
      latitude,
      longitude,
      how_to_get_there: howToGetThere,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider_id" },
  );
  if (error) throw error;
}

/** Client-safe: release policy by provider id (stable), no address leaked. */
export async function getProviderAddressPolicy(
  providerId: string,
): Promise<ProviderAddressPolicy | null> {
  const { data, error } = await supabase
    .from("providers")
    .select("business_type, address_release_policy")
    .eq("id", providerId)
    .maybeSingle();
  // Throws rather than reading as "no policy": a failed read used to make a
  // mobile provider look like a venue, so their booking showed their own
  // address as the appointment's location.
  if (error) throw error;
  return data ? (data as ProviderAddressPolicy) : null;
}

/** Client-safe fallback: release policy by display name, no address leaked. */
export async function getProviderAddressPolicyByDisplayName(
  displayName: string,
): Promise<ProviderAddressPolicy | null> {
  const { data } = await supabase
    .from("providers")
    .select("business_type, address_release_policy")
    .eq("display_name", displayName)
    .eq("is_claimed", true) // never an imported directory listing
    .maybeSingle();
  return data ? (data as ProviderAddressPolicy) : null;
}

export interface ClientBookingSummary {
  id: string;
  service_name_snapshot: string;
  booking_date: string;
  booking_time: string;
  client_address: string | null;
}

/** Client's upcoming/pending bookings with a given (mobile) provider — used to pick which booking an address applies to when sending it via chat. */
export async function getClientBookingsForAddressShare(
  providerId: string,
): Promise<ClientBookingSummary[]> {
  // The address lives in booking_client_addresses since 20260827161000 --
  // bookings.client_address is a write-only funnel and is always NULL at rest,
  // so selecting it here would hand every caller an empty field. The client
  // owns their own address row outright (policy bca_client_all), so this embed
  // resolves for the person picking which booking to send it to.
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, service_name_snapshot, booking_date, booking_time, booking_client_addresses ( address )",
    )
    .eq("provider_id", providerId)
    // DB statuses, not app ones. 'upcoming' is a BookingStatus enum value
    // (src/types/booking.ts) that mapDbBookingStatus PRODUCES from 'confirmed'
    // — it is never a value in bookings.status, so this filter matched only
    // 'pending' and silently dropped every accepted booking. A client whose
    // provider had confirmed could no longer send them an address at all,
    // which is the half of "I never got the address" that lives on the
    // client's side.
    .in("status", ["pending", "confirmed", "in_progress"])
    .order("booking_date", { ascending: true })
    .order("booking_time", { ascending: true })
    .limit(DEFAULT_PROVIDER_QUERY_LIMIT);
  if (error) throw error;
  // booking_id is that table's PRIMARY KEY so PostgREST returns one object,
  // but a to-one embed is indistinguishable from to-many by the foreign key
  // alone -- handle both rather than guess, exactly as bookingService does.
  return (data ?? []).map((row): ClientBookingSummary => {
    const embed: unknown = row.booking_client_addresses;
    const first = Array.isArray(embed) ? (embed[0] as unknown) : embed;
    const address =
      typeof (first as { address?: unknown } | null)?.address === "string"
        ? ((first as { address: string }).address)
        : null;
    return {
      id: row.id,
      service_name_snapshot: row.service_name_snapshot,
      booking_date: row.booking_date,
      booking_time: row.booking_time,
      client_address: address,
    };
  });
}

/**
 * The address this client last gave for a mobile booking, so the checkout
 * "Confirm Your Details" step can prefill it instead of making them retype
 * their home address on every order.
 *
 * Reads the gated `client_bookings` view, not the base table — clients have no
 * direct SELECT on `bookings` (see getMyBookings). Best-effort by nature: a
 * client with no prior mobile booking simply gets an empty field.
 */
export async function getMyLastClientAddress(): Promise<string | null> {
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("client_bookings")
    .select("client_address")
    .eq("user_id", user.id)
    .not("client_address", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data?.client_address as string | undefined) ?? null;
}

/** Save the address a client sends their mobile provider, for a specific booking.
 *  Routed through a SECURITY DEFINER RPC — see fix_bookings_client_update_bypass.sql.
 *  The general "clients can update their own booking row" policy was dropped, so a
 *  raw .update() here would now fail RLS. */
export async function setBookingClientAddress(
  bookingId: string,
  address: string,
): Promise<void> {
  const { error } = await supabase.rpc("set_booking_client_address", {
    p_booking_id: bookingId,
    p_address: address,
  });
  if (error) throw error;
}

/**
 * Manually release the full address for a specific booking to the client.
 * Sends exactly ONE "Address Now Available" notification — the RPC sends it
 * server-side via notify_address_released(), so every release path
 * (on_confirmation trigger, time-based cron, manual) shares one notification
 * implementation — see consolidate_address_release_notification*.sql.
 */
export async function releaseBookingAddress(bookingId: string): Promise<void> {
  // Routed through a SECURITY DEFINER RPC that can only touch
  // address_released_at — see fix_bookings_provider_update_bypass.sql and
  // consolidate_address_release_notification_manual.sql.
  const { error } = await supabase.rpc("provider_release_booking_address", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
}

/** Fetch the address_released_at timestamp for a booking. */
export async function getBookingAddressReleasedAt(
  bookingId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("bookings")
    .select("address_released_at")
    .eq("id", bookingId)
    .single();
  return (
    (data as { address_released_at: string | null } | null)
      ?.address_released_at ?? null
  );
}
