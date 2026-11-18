// Database access: Waitlist places and offers.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import { supabase } from "../../lib/supabase";

// ─────────────────────────────────────────────────────────
// WAITLIST
// ─────────────────────────────────────────────────────────

export type WaitlistStatus = "waiting" | "notified" | "booked" | "expired" | "cancelled";

export interface WaitlistEntry {
  id: string;
  provider_id: string;
  user_id: string;
  service_id: string | null;
  service_name_snapshot: string;
  provider_name_snapshot: string;
  user_name_snapshot: string | null;
  // [0] = range start, [1] = range end (absent = open-ended). NULL = any date.
  preferred_dates: string[] | null;
  notes: string | null;
  status: WaitlistStatus;
  position: number;
  created_at: string;
  notified_at: string | null;
  /** The slot last offered to this client (a 10-minute hold), and when that
   *  hold ends or ended. offer_expires_at is the hold's real end, not an
   *  estimate. See 20261113210000_waitlist_pays_at_confirm.sql. */
  offered_booking_id: string | null;
  offered_date: string | null;
  offered_time: string | null;
  offer_expires_at: string | null;
  offer_ended_at: string | null;
}

/** One of the signed-in client's waitlist places, from get_my_waitlist().
 *  placeInLine is counted, not the raw position (which isn't renumbered when
 *  someone ahead leaves). holdBookingId is set only while a slot is held for
 *  them. An 'expired' place is one whose hold ended in the last 30 days:
 *  they've come off the waitlist and can rejoin. */
export interface MyWaitlistPlace {
  id: string;
  providerId: string;
  serviceId: string | null;
  serviceName: string;
  providerName: string;
  preferredDates: string[] | null;
  notes: string | null;
  status: WaitlistStatus;
  placeInLine: number | null;
  createdAt: string;
  holdBookingId: string | null;
  offeredBookingId: string | null;
  offeredDate: string | null;
  offeredTime: string | null;
  offerExpiresAt: string | null;
  offerEndedAt: string | null;
}

interface MyWaitlistRow {
  id: string;
  provider_id: string;
  service_id: string | null;
  service_name_snapshot: string;
  provider_name_snapshot: string;
  preferred_dates: string[] | null;
  notes: string | null;
  status: WaitlistStatus;
  place_in_line: number | null;
  created_at: string;
  hold_booking_id: string | null;
  offered_booking_id: string | null;
  offered_date: string | null;
  offered_time: string | null;
  offer_expires_at: string | null;
  offer_ended_at: string | null;
}

export interface JoinWaitlistParams {
  providerId: string;
  userId: string;
  serviceId: string | null;
  serviceNameSnapshot: string;
  providerNameSnapshot: string;
  userNameSnapshot?: string;
  preferredDates?: string[];
  notes?: string;
}

/** Join a provider's waitlist, at the back of the line. Removes any old row
 *  for the same provider+service first (a lapsed one, after "Rejoin"). */
export async function joinWaitlist(
  params: JoinWaitlistParams,
): Promise<WaitlistEntry> {
  const staleQuery = supabase
    .from("provider_waitlist")
    .delete()
    .eq("provider_id", params.providerId)
    .eq("user_id", params.userId);
  const { error: staleError } = params.serviceId
    ? await staleQuery.eq("service_id", params.serviceId)
    : await staleQuery.is("service_id", null);
  if (staleError) throw staleError;

  const { data, error } = await supabase
    .from("provider_waitlist")
    .insert({
      provider_id: params.providerId,
      user_id: params.userId,
      service_id: params.serviceId,
      service_name_snapshot: params.serviceNameSnapshot,
      provider_name_snapshot: params.providerNameSnapshot,
      user_name_snapshot: params.userNameSnapshot ?? null,
      preferred_dates: params.preferredDates ?? null,
      notes: params.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as WaitlistEntry;
}

/** The client leaves a waitlist (or dismisses one they've come off). Not
 *  while a slot is held for them: they pass on it first. */
export async function leaveWaitlist(entryId: string): Promise<void> {
  const { error } = await supabase
    .from("provider_waitlist")
    .delete()
    .eq("id", entryId);
  if (error) throw error;
}

/** The signed-in client's waitlist places with their real place in line. */
export async function getMyWaitlist(): Promise<MyWaitlistPlace[]> {
  const { data, error } = await supabase.rpc("get_my_waitlist");
  if (error) throw error;
  return ((data ?? []) as MyWaitlistRow[]).map((row) => ({
    id: row.id,
    providerId: row.provider_id,
    serviceId: row.service_id,
    serviceName: row.service_name_snapshot,
    providerName: row.provider_name_snapshot,
    preferredDates: row.preferred_dates,
    notes: row.notes,
    status: row.status,
    placeInLine: row.place_in_line,
    createdAt: row.created_at,
    holdBookingId: row.hold_booking_id,
    offeredBookingId: row.offered_booking_id,
    offeredDate: row.offered_date,
    offeredTime: row.offered_time,
    offerExpiresAt: row.offer_expires_at,
    offerEndedAt: row.offer_ended_at,
  }));
}

/** Change a waiting place's dates without going to the back of the line.
 *  null = any date. */
export async function updateMyWaitlistDates(
  entryId: string,
  preferredDates: string[] | null,
): Promise<void> {
  const { error } = await supabase.rpc("update_my_waitlist_dates", {
    p_entry_id: entryId,
    p_preferred_dates: preferredDates,
  });
  if (error) throw error;
}

export async function getProviderWaitlist(
  providerId: string,
): Promise<WaitlistEntry[]> {
  const { data, error } = await supabase
    .from("provider_waitlist")
    .select("*")
    .eq("provider_id", providerId)
    .not("status", "in", '("cancelled","booked","expired")')
    .order("service_id", { ascending: true })
    .order("position", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as WaitlistEntry[];
}

/** A slot that came back to the provider (Auto-fill off) when a client's
 *  hold ended unpaid. It's open to everyone; the provider can still offer it
 *  to someone on their waitlist. Only future, still-free ones are returned. */
export interface ReleasedWaitlistSlot {
  id: string;
  serviceId: string | null;
  serviceName: string;
  bookingDate: string;
  bookingTime: string;
  endTime: string | null;
  releasedByName: string | null;
  reason: "missed" | "passed" | "cancelled";
  createdAt: string;
}

interface ReleasedWaitlistSlotRow {
  id: string;
  service_id: string | null;
  service_name_snapshot: string;
  booking_date: string;
  booking_time: string;
  end_time: string | null;
  released_by_name: string | null;
  reason: "missed" | "passed" | "cancelled";
  created_at: string;
}

export async function getProviderReleasedWaitlistSlots(
  providerId: string,
): Promise<ReleasedWaitlistSlot[]> {
  const { data, error } = await supabase.rpc("get_provider_released_waitlist_slots", {
    p_provider_id: providerId,
  });
  if (error) throw error;
  return ((data ?? []) as ReleasedWaitlistSlotRow[]).map((row) => ({
    id: row.id,
    serviceId: row.service_id,
    serviceName: row.service_name_snapshot,
    bookingDate: row.booking_date,
    bookingTime: row.booking_time,
    endTime: row.end_time,
    releasedByName: row.released_by_name,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}

/** The provider offers a waiting client a time they pick: a 10-minute hold
 *  the client confirms and pays for, never an unpaid booking. Throws the
 *  database's reason (taken, outside hours, notice) if it can't be held. */
export async function providerOfferWaitlistSlot(
  entryId: string,
  bookingDate: string,
  bookingTime: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("provider_offer_waitlist_slot", {
    p_entry_id: entryId,
    p_booking_date: bookingDate,
    p_booking_time: bookingTime,
  });
  if (error) throw error;
  return data as string;
}

/** Offer a released slot to the next person in line (no entryId) or to one
 *  chosen client. */
export async function providerOfferReleasedWaitlistSlot(
  slotId: string,
  entryId?: string,
): Promise<void> {
  const { error } = await supabase.rpc("provider_offer_released_waitlist_slot", {
    p_slot_id: slotId,
    p_entry_id: entryId ?? null,
  });
  if (error) throw error;
}

/** "Leave it open": the time already is; this clears the card. */
export async function dismissReleasedWaitlistSlot(slotId: string): Promise<void> {
  const { error } = await supabase.rpc("dismiss_released_waitlist_slot", {
    p_slot_id: slotId,
  });
  if (error) throw error;
}

/** The provider takes a client off their waitlist; the client is told. */
export async function providerRemoveWaitlistEntry(entryId: string): Promise<void> {
  const { error } = await supabase.rpc("provider_remove_waitlist_entry", {
    p_entry_id: entryId,
  });
  if (error) throw error;
}

/** "Pass it on": give up a held waitlist slot now. The client comes off that
 *  waitlist; the slot goes to the next person or back to the provider. */
export async function declineWaitlistHold(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc("decline_waitlist_hold", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
}
