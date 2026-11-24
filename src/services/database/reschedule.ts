// Database access: Reschedule requests and reschedule limits.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import { supabase } from "../../lib/supabase";
import type { DbBookingRescheduleRequest, NotificationType } from "../../types/database";
import { logger } from "../../utils/logger";
import { isUuid } from "./social";
import { mapCancellationPolicyRow } from "./availability";
import type { ProviderAddressPolicy } from "./addressRelease";

// ─────────────────────────────────────────────────────────
// RESCHEDULE REQUESTS
// ─────────────────────────────────────────────────────────

/** Client requests a reschedule. Routed through request_reschedule_own_booking()
 *  so the 24h anti-spam cooldown, the provider's maxReschedules cap, and the
 *  provider's reschedule notice window are all enforced server-side — upsert
 *  above has none of that, it's a plain unconditional write. */
export async function requestRescheduleOwnBooking(
  bookingId: string,
  preferredDates: string[],
): Promise<void> {
  const { error } = await supabase.rpc("request_reschedule_own_booking", {
    p_booking_id: bookingId,
    p_preferred_dates: preferredDates,
  });
  if (error) throw error;
}

/** Get the active (pending or provider_responded) reschedule request for a booking */
export async function getActiveRescheduleRequest(
  bookingId: string,
): Promise<DbBookingRescheduleRequest | null> {
  const { data, error } = await supabase
    .from("booking_reschedule_requests")
    .select("*")
    .eq("booking_id", bookingId)
    .in("status", ["pending", "provider_responded"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as DbBookingRescheduleRequest | null;
}

/**
 * Active reschedule requests for many bookings at once, keyed by booking_id.
 *
 * loadBookings uses this to hydrate reschedule state, which otherwise exists
 * only in AsyncStorage — so an in-flight reschedule was invisible on a second
 * device or after clearing storage. One query rather than N.
 */
export async function getActiveRescheduleRequestsForBookings(
  bookingIds: string[],
): Promise<Record<string, DbBookingRescheduleRequest>> {
  // booking_id is a uuid column, so PostgREST casts the whole .in() list to
  // uuid — a single locally-created id (the `booking_`-prefixed ones
  // BookingContext deliberately keeps in its merge) made the query fail with
  // 22P02 for EVERY booking, not just that one. Callers read "no row" as
  // "no active request" and clear isPendingReschedule, so one un-synced local
  // booking silently wiped the pending-reschedule state off all the others.
  const uuidIds = bookingIds.filter(isUuid);
  if (uuidIds.length === 0) return {};

  const { data, error } = await supabase
    .from("booking_reschedule_requests")
    .select("*")
    .in("booking_id", uuidIds)
    .in("status", ["pending", "provider_responded"])
    .order("created_at", { ascending: false });

  // Must throw, never return {} — an empty map is indistinguishable from
  // "this booking has no active request", and callers act on that by
  // clearing local reschedule state. Swallowing a transient failure here
  // dropped the "Reschedule Pending" state off a booking whose request was
  // very much alive server-side, which then surfaced as an
  // "already in progress" rejection when the client re-requested.
  if (error) throw error;
  if (!data) return {};

  const out: Record<string, DbBookingRescheduleRequest> = {};
  for (const row of data as DbBookingRescheduleRequest[]) {
    // Newest-first, so the first row seen for a booking is the current one.
    if (!out[row.booking_id]) out[row.booking_id] = row;
  }
  return out;
}

/** Provider responds with their available slots. Routed through the policy
 *  wrapper around respond_to_reschedule_request() so provider ownership of
 *  the booking and the request's 'pending' status are re-verified
 *  server-side — RLS on booking_reschedule_requests is SELECT-only, a
 *  direct .update() can no longer write this row at all. responseNote
 *  (the "Apologise" text) is persisted so the trigger-owned notification
 *  can read it back — see supabase/fix_reschedule_flow_completion.sql. */
export async function respondToRescheduleRequest(
  bookingId: string,
  availableSlots: { date: string; times: string[] }[],
  responseNote?: string,
  cancelIfDeclined = false,
): Promise<void> {
  const { error } = await supabase.rpc("respond_to_reschedule_request_with_policy", {
    p_booking_id: bookingId,
    p_available_slots: availableSlots,
    p_response_note: responseNote ?? null,
    p_cancel_if_declined: cancelIfDeclined,
  });
  if (error?.code === 'PGRST202') {
    if (cancelIfDeclined) throw new Error('Cancel if declined is not available yet. Please try again after the database update.');
    const legacy = await supabase.rpc("respond_to_reschedule_request", {
      p_booking_id: bookingId,
      p_available_slots: availableSlots,
      p_response_note: responseNote ?? null,
    });
    if (legacy.error) throw legacy.error;
    return;
  }
  if (error) throw error;
}

// updateBookingDateTime() was removed here (2026-08-20) — a raw .update() on
// booking_date/booking_time/end_time with none of the reschedule-request
// approval flow, reschedule-count limit, or notice-window checks this path
// needs, and bookings' RLS has no WITH CHECK to catch that at the DB layer
// either. It was already dead (its only caller, bookingService.ts's
// rescheduleBookingInSupabase(), had zero callers itself). Use
// confirmRescheduleOwnBooking() below instead.

/** Client confirms a provider-approved reschedule slot. Routed through
 *  confirm_reschedule_own_booking() — requires an active provider_responded
 *  request server-side (a client can't invent a reschedule out of nothing),
 *  and increments the new reschedule_count / last_rescheduled_at columns
 *  that request_reschedule_own_booking()'s cooldown/cap checks read from.
 *  Supersedes a raw updateBookingDateTime() call for this path. */
export async function confirmRescheduleOwnBooking(
  bookingId: string,
  newDate: string,
  newTime: string,
  newEndTime: string,
): Promise<void> {
  const { error } = await supabase.rpc("confirm_reschedule_own_booking", {
    p_booking_id: bookingId,
    p_new_date: newDate,
    p_new_time: newTime,
    p_new_end_time: newEndTime,
  });
  if (error) throw error;
}

/** Provider initiates a reschedule by proposing new slots directly.
 *  Routed through the policy wrapper around provider_initiate_reschedule() so the caller's provider
 *  ownership of the booking is re-verified server-side (original_date/time
 *  are read from the booking row itself, not trusted from the client) —
 *  same reasoning as respondToRescheduleRequest above. */
export async function upsertProviderRescheduleRequest(params: {
  booking_id: string;
  proposed_slots: { date: string; times: string[] }[];
  cancel_if_declined?: boolean;
  note?: string;
}): Promise<void> {
  const note = params.note?.trim() || null;
  const { error } = await supabase.rpc("provider_initiate_reschedule_with_note", {
    p_booking_id: params.booking_id,
    p_proposed_slots: params.proposed_slots,
    p_cancel_if_declined: params.cancel_if_declined ?? false,
    p_note: note,
  });
  if (error?.code === 'PGRST202') {
    if (note) throw new Error('Reschedule notes are not available yet. Please try again after the database update.');
    const current = await supabase.rpc("provider_initiate_reschedule_with_policy", {
      p_booking_id: params.booking_id,
      p_proposed_slots: params.proposed_slots,
      p_cancel_if_declined: params.cancel_if_declined ?? false,
    });
    if (!current.error) return;
    if (current.error.code !== 'PGRST202') throw current.error;
    if (params.cancel_if_declined) throw new Error('Cancel if declined is not available yet. Please try again after the database update.');
    const legacy = await supabase.rpc("provider_initiate_reschedule", {
      p_booking_id: params.booking_id,
      p_proposed_slots: params.proposed_slots,
    });
    if (legacy.error) throw legacy.error;
    return;
  }
  if (error) throw error;
}

/** Provider declines a pending client reschedule request outright — no
 *  alternative slots required (distinct from respondToRescheduleRequest's
 *  "Apologise" path, which still requires >=1 proposed slot). The booking
 *  is untouched; only the request row closes. Routed through
 *  reject_reschedule_request() so provider ownership and the request's
 *  'pending' status are re-verified server-side, same pattern as every
 *  other reschedule RPC. Requires supabase/fix_reschedule_flow_completion.sql. */
export async function rejectRescheduleRequest(
  bookingId: string,
  responseNote?: string,
): Promise<void> {
  const { error } = await supabase.rpc("reject_reschedule_request", {
    p_booking_id: bookingId,
    p_response_note: responseNote ?? null,
  });
  if (error) throw error;
}

/** Client declines a provider's offered reschedule times instead of
 *  silently abandoning the screen. The booking stays at its original time
 *  unless this offer opted into cancellation and a full refund. Routed through
 *  decline_reschedule_offer() so
 *  client ownership and the request's 'provider_responded' status are
 *  re-verified server-side. Requires supabase/fix_reschedule_flow_completion.sql. */
export async function declineRescheduleOffer(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc("decline_reschedule_offer", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
}

/** Provider proposes new days for a WHOLE group booking at once — every
 *  sibling service this provider owns in the group shifts together,
 *  preserving back-to-back order. `proposals` must be pre-computed
 *  client-side (one entry per sibling, each carrying that sibling's own
 *  shifted {date,times}[] for every candidate day) — this RPC persists them
 *  atomically, it does not compute availability itself. See
 *  AvailabilityService.findAllBackToBackSlots for the chain-fitting logic
 *  that should produce these proposals, and
 *  supabase/fix_group_booking_reschedule.sql for the RPC. All-or-nothing:
 *  every booking must belong to the caller, be in this exact group, and be
 *  confirmed, or nothing is written. */
export async function providerInitiateGroupReschedule(
  groupBookingId: string,
  proposals: {
    booking_id: string;
    available_slots: { date: string; times: string[] }[];
  }[],
): Promise<string[]> {
  const { data, error } = await supabase.rpc(
    "provider_initiate_group_reschedule",
    {
      p_group_booking_id: groupBookingId,
      p_proposals: proposals,
    },
  );
  if (error) throw error;
  return (data ?? []).map((row: { booking_id: string }) => row.booking_id);
}

/** Client confirms ONE chosen day for the whole group — every sibling moves
 *  to its own selected date/time/end_time together. `selections` must name
 *  the exact chain the client picked from the provider's proposed options
 *  (client-side, via the same AvailabilityService chain data the proposal
 *  was built from). All-or-nothing: every sibling must have an active
 *  provider-responded request owned by this client in this group, or
 *  nothing is written. See supabase/fix_group_booking_reschedule.sql. */
export async function confirmGroupReschedule(
  groupBookingId: string,
  selections: {
    booking_id: string;
    new_date: string;
    new_time: string;
    new_end_time: string;
  }[],
): Promise<string[]> {
  const { data, error } = await supabase.rpc("confirm_group_reschedule", {
    p_group_booking_id: groupBookingId,
    p_selections: selections,
  });
  if (error) throw error;
  return (data ?? []).map((row: { booking_id: string }) => row.booking_id);
}

/** Client declines the whole group's offered reschedule times at once.
 *  Bookings are untouched; only the request rows close. See
 *  supabase/fix_group_booking_reschedule.sql. */
export async function declineGroupRescheduleOffer(
  groupBookingId: string,
): Promise<string[]> {
  const { data, error } = await supabase.rpc("decline_group_reschedule_offer", {
    p_group_booking_id: groupBookingId,
  });
  if (error) throw error;
  return (data ?? []).map((row: { booking_id: string }) => row.booking_id);
}

/** Send a notification to the user who made a booking (provider → user direction) */
export async function insertBookingUserNotification(params: {
  booking_id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority?: "high" | "medium" | "low";
  is_actionable?: boolean;
  provider_id?: string;
}): Promise<void> {
  const { data: booking } = await supabase
    .from("bookings")
    .select("user_id")
    .eq("id", params.booking_id)
    .single();
  if (!booking?.user_id) return;

  const { error } = await supabase.from("notifications").insert({
    user_id: booking.user_id,
    type: params.type,
    title: params.title,
    message: params.message,
    priority: params.priority ?? "medium",
    is_actionable: params.is_actionable ?? false,
    booking_id: params.booking_id,
    provider_id: params.provider_id ?? null,
    recipient_role: "client",
  });
  if (error) {
    logger.warn(
      "[insertBookingUserNotification] insert failed:",
      error.message,
    );
    throw error;
  }
}

// ─────────────────────────────────────────────────────────
// RESCHEDULE POLICY (client-side enforcement of provider limits)
// ─────────────────────────────────────────────────────────

export interface ProviderReschedulePolicy {
  /** null = unlimited */
  maxReschedules: number | null;
  /** hours of notice required before the appointment; 0 = same day allowed */
  rescheduleNoticeHours: number;
  /** The new date must stay in the booking's calendar month (rescheduleWithin 'same_month'). */
  sameMonthOnly: boolean;
}

/** Parse the provider's booking_policies reschedule settings.
 *  Values come from registration: rescheduleNotice 'same_day'|'24h'|'48h'|'72h',
 *  maxReschedules '1'|'2'|'unlimited'. Missing policy is unrestricted, matching
 *  request_reschedule_own_booking() in the database. */
function mapReschedulePolicyRow(data: any): ProviderReschedulePolicy {
  const fallback: ProviderReschedulePolicy = {
    maxReschedules: null,
    rescheduleNoticeHours: 0,
    sameMonthOnly: false,
  };
  const bp = (data as any)?.booking_policies as {
    rescheduleNotice?: string;
    maxReschedules?: string;
    rescheduleWithin?: string;
  } | null;
  if (!bp) return fallback;

  const max =
    !bp.maxReschedules || bp.maxReschedules === "unlimited"
      ? null
      : parseInt(bp.maxReschedules, 10) || null;
  const noticeMap: Record<string, number> = {
    same_day: 0,
    "24h": 24,
    "48h": 48,
    "72h": 72,
  };
  const notice = bp.rescheduleNotice ? (noticeMap[bp.rescheduleNotice] ?? 0) : 0;
  return { maxReschedules: max, rescheduleNoticeHours: notice, sameMonthOnly: bp.rescheduleWithin === 'same_month' };
}

export async function getProviderReschedulePolicyByDisplayName(
  displayName: string,
): Promise<ProviderReschedulePolicy> {
  const { data } = await supabase
    .from("providers")
    .select("booking_policies")
    .eq("display_name", displayName)
    .eq("is_claimed", true) // never an imported directory listing
    .maybeSingle();
  return mapReschedulePolicyRow(data);
}

/** Reschedule policy by provider id (stable) — prefer over the display-name variant. */
export async function getProviderReschedulePolicyById(
  providerId: string,
): Promise<ProviderReschedulePolicy> {
  const { data } = await supabase
    .from("providers")
    .select("booking_policies")
    .eq("id", providerId)
    .maybeSingle();
  return mapReschedulePolicyRow(data);
}

/** The provider's full, LIVE booking_policies JSON, by provider id. Used as a
 *  fallback on BookingDetailScreen for bookings made before policy_snapshot
 *  existed (or that never captured one) — a client with no frozen snapshot
 *  still sees a policy, just the current one rather than what was true when
 *  they booked. */
export async function getProviderBookingPoliciesById(
  providerId: string,
): Promise<Record<string, unknown> | null> {
  // Throws rather than swallowing: a null return means "no policy set", and a
  // failed query returning null too made those indistinguishable. Becca's
  // pv.automations reads this to tell a provider their own deposit and
  // cancellation terms, so a swallowed error became "you haven't set any
  // booking policies yet" — a confident false statement about their business.
  const { data, error } = await supabase
    .from("providers")
    .select("booking_policies")
    .eq("id", providerId)
    .maybeSingle();
  if (error) throw error;
  return (data as any)?.booking_policies ?? null;
}

export interface ProviderBookingDetailMetadata {
  reschedulePolicy: ProviderReschedulePolicy;
  cancellationNoticeHours: number;
  bookingPolicies: Record<string, unknown> | null;
  addressPolicy: ProviderAddressPolicy | null;
}

/** The cancellation window a booking was made under
 *  (bookings.cancel_notice_hours), or null for a booking from before it was
 *  stored, which follows the provider's current window instead. */
export async function getBookingCancelNoticeHours(bookingId: string): Promise<number | null> {
  // A local, not-yet-saved booking has no row to read.
  if (!isUuid(bookingId)) return null;
  const { data, error } = await supabase
    .from("bookings")
    .select("cancel_notice_hours")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw error;
  const hours = (data as { cancel_notice_hours: number | null } | null)?.cancel_notice_hours;
  return typeof hours === "number" ? hours : null;
}

/** All provider policy fields needed by BookingDetailScreen in one row read.
 *  With a bookingId, the cancellation window is that booking's own. */
export async function getProviderBookingDetailMetadata(params: {
  providerId?: string;
  displayName: string;
  bookingId?: string;
}): Promise<ProviderBookingDetailMetadata> {
  let query = supabase
    .from("providers")
    .select(
      "booking_policies, cancellation_notice_hours, business_type, address_release_policy",
    );
  query = params.providerId
    ? query.eq("id", params.providerId)
    : query.eq("display_name", params.displayName).eq("is_claimed", true);

  const [{ data, error }, bookingNoticeHours] = await Promise.all([
    query.maybeSingle(),
    params.bookingId ? getBookingCancelNoticeHours(params.bookingId) : Promise.resolve(null),
  ]);
  if (error) throw error;
  return {
    reschedulePolicy: mapReschedulePolicyRow(data),
    cancellationNoticeHours: bookingNoticeHours ?? mapCancellationPolicyRow(data),
    bookingPolicies:
      (data?.booking_policies as Record<string, unknown> | null) ?? null,
    addressPolicy: data
      ? {
          business_type: data.business_type,
          address_release_policy: data.address_release_policy,
        }
      : null,
  };
}

/** No-show grace period (minutes past the booked start time before "No Show"
 *  is available), mirroring provider_update_booking_status()'s server-side
 *  guard exactly (booking_policies->>'noShowGraceMinutes', missing/invalid
 *  = 0 = today's historical instant-eligible behavior). Used client-side
 *  ONLY to keep the "No Show" button's visibility consistent with what the
 *  RPC will actually accept — the RPC itself is the real enforcement. */
export async function getProviderNoShowGraceMinutes(
  providerId: string,
): Promise<number> {
  const { data } = await supabase
    .from("providers")
    .select("booking_policies")
    .eq("id", providerId)
    .maybeSingle();
  const raw = (data as any)?.booking_policies?.noShowGraceMinutes;
  const minutes = typeof raw === "string" ? parseInt(raw, 10) : raw;
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}
