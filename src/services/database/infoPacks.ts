// Database access: Info packs, on bookings and in the provider library.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import { supabase } from "../../lib/supabase";
import { getSessionUser } from "./account";
import type { BookingFeeKind } from "./edgeFunctions";

// ─────────────────────────────────────────────────────────
// BOOKING INFO PACKS (prep/aftercare info attached to bookings —
// see supabase/info_packs_bookings.sql)
// ─────────────────────────────────────────────────────────

export interface BookingInfoPack {
  id: string;
  bookingId: string;
  infoPackId: string;
  providerId: string;
  title: string;
  service: string;
  content: string;
  viewedAt: string | null;
  createdAt: string;
}

function mapBookingInfoPack(d: any): BookingInfoPack {
  return {
    id: d.id,
    bookingId: d.booking_id,
    infoPackId: d.info_pack_id,
    providerId: d.provider_id,
    title: d.title,
    service: d.service ?? "GENERAL",
    content: d.content,
    viewedAt: d.viewed_at ?? null,
    createdAt: d.created_at,
  };
}

/** Info packs the provider attached to one booking (client view) */
export async function getInfoPacksByBooking(
  bookingId: string,
): Promise<BookingInfoPack[]> {
  const { data, error } = await supabase
    .from("booking_info_packs")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true })
    .limit(50);
  // Throws rather than returning []: an empty list means "nothing sent", and
  // the provider's booking detail offers to send a pack when it sees that.
  if (error) throw error;
  return (data ?? []).map(mapBookingInfoPack);
}

/** Mark an info pack as read — clears it from the booking's attention badge,
 *  and is what the provider's "opened" count reads. */
export async function markInfoPackViewed(packId: string): Promise<void> {
  const { error } = await supabase
    .from("booking_info_packs")
    .update({ viewed_at: new Date().toISOString() })
    .eq("id", packId)
    .is("viewed_at", null);
  if (error) throw error;
}

/** Booking ids that need the client's attention (pending intake forms +
 *  unread info packs) → drives the "!" indicator on booking cards. */
export async function getMyBookingActionItems(): Promise<
  Record<string, number>
> {
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) return {};

  const counts: Record<string, number> = {};

  const [{ data: forms }, { data: packs }] = await Promise.all([
    supabase
      .from("booking_intake_forms")
      .select("booking_id")
      .eq("client_user_id", user.id)
      .eq("status", "pending"),
    supabase
      .from("booking_info_packs")
      .select("booking_id")
      .eq("client_user_id", user.id)
      .is("viewed_at", null),
  ]);

  for (const r of [...(forms ?? []), ...(packs ?? [])]) {
    counts[r.booking_id] = (counts[r.booking_id] ?? 0) + 1;
  }
  return counts;
}

export type ClientActivityDone =
  | { kind: 'form_sent'; id: string; bookingId: string; doneAt: string }
  | { kind: 'pack_read'; id: string; bookingId: string; doneAt: string }
  | { kind: 'fee_paid'; id: string; bookingId: string; doneAt: string; feeKind: BookingFeeKind; amountPence: number }
  | { kind: 'refund_decided'; id: string; bookingId: string; doneAt: string; outcome: 'refunded' | 'declined' };

/** How long a finished item stays struck through in the Activity Centre. */
export const ACTIVITY_DONE_DAYS = 7;

/** Everything the client's Activity Centre needs that isn't already on the
 *  bookings in BookingContext — one round of parallel reads, each capped.
 *  features/bookings/activityCentre.ts turns this plus the bookings into the
 *  list; this only fetches. */
export interface ClientActivityRemote {
  /** Bookings with an intake form still to fill in, once per form. */
  pendingFormBookingIds: string[];
  /** Booking id → titles of its forms still to fill in, so the Activity
   *  Centre can name the one that's left when another is already done. */
  pendingFormTitles: Record<string, string[]>;
  /** Bookings with an info pack the client hasn't opened. */
  unreadPackBookingIds: string[];
  /** Refund requests still waiting on the provider or on Cerviced. */
  openRefundRequests: {
    id: string;
    bookingId: string;
    status: 'with_provider' | 'under_review';
    createdAt: string;
    passedAutomatically: boolean;
  }[];
  /** Late/no-show fees the saved card couldn't cover, so the client is asked to pay. */
  feesToPay: {
    id: string;
    bookingId: string;
    kind: BookingFeeKind;
    amountPence: number;
    payBy: string | null;
  }[];
  /** Waitlist slots held for the client, not yet confirmed. Holds are left out
   *  of client_bookings, so this reads the base table — snapshot names and
   *  times only, never an address column. */
  waitlistHolds: {
    bookingId: string;
    serviceName: string;
    providerName: string;
    bookingDate: string;
    bookingTime: string;
    holdExpiresAt: string;
  }[];
  /** What the client finished in the last ACTIVITY_DONE_DAYS days, so the
   *  Activity Centre can strike it through instead of it just disappearing.
   *  Only things with a recorded finish time are here. */
  recentlyDone: ClientActivityDone[];
}

const ACTIVITY_QUERY_LIMIT = 50;

export async function getMyActivity(): Promise<ClientActivityRemote> {
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) {
    return { pendingFormBookingIds: [], pendingFormTitles: {}, unreadPackBookingIds: [], openRefundRequests: [], feesToPay: [], waitlistHolds: [], recentlyDone: [] };
  }

  const since = new Date(Date.now() - ACTIVITY_DONE_DAYS * 86_400_000).toISOString();
  const [forms, packs, refunds, fees, holds, formsDone, packsDone, feesDone, refundsDone] = await Promise.all([
    supabase
      .from("booking_intake_forms")
      .select("booking_id, title")
      .eq("client_user_id", user.id)
      .eq("status", "pending")
      .limit(ACTIVITY_QUERY_LIMIT),
    supabase
      .from("booking_info_packs")
      .select("booking_id")
      .eq("client_user_id", user.id)
      .is("viewed_at", null)
      .limit(ACTIVITY_QUERY_LIMIT),
    supabase
      .from("refund_requests")
      .select("id, booking_id, status, created_at, passed_automatically")
      .eq("client_id", user.id)
      .in("status", ["with_provider", "under_review"])
      .order("created_at", { ascending: false })
      .limit(ACTIVITY_QUERY_LIMIT),
    supabase
      .from("booking_fee_charges")
      .select("id, booking_id, kind, amount_pence, pay_by")
      .eq("client_user_id", user.id)
      .eq("status", "awaiting_client")
      .order("created_at", { ascending: false })
      .limit(ACTIVITY_QUERY_LIMIT),
    supabase
      .from("bookings")
      .select("id, service_name_snapshot, provider_name_snapshot, booking_date, booking_time, hold_expires_at")
      .eq("user_id", user.id)
      .eq("status", "on_hold")
      // Waitlist holds only: a cart checkout's own 5-minute hold is also
      // on_hold, and isn't "a slot opened up for you".
      .not("waitlist_entry_id", "is", null)
      .gt("hold_expires_at", new Date().toISOString())
      .limit(ACTIVITY_QUERY_LIMIT),
    supabase
      .from("booking_intake_forms")
      .select("id, booking_id, completed_at")
      .eq("client_user_id", user.id)
      .eq("status", "completed")
      .gte("completed_at", since)
      .limit(ACTIVITY_QUERY_LIMIT),
    supabase
      .from("booking_info_packs")
      .select("id, booking_id, viewed_at")
      .eq("client_user_id", user.id)
      .gte("viewed_at", since)
      .limit(ACTIVITY_QUERY_LIMIT),
    // Only fees the client was asked to pay (they carry an invoice, whether
    // the client paid it or a retry on their saved card did), not ones the
    // card covered first time without them ever seeing a request.
    supabase
      .from("booking_fee_charges")
      .select("id, booking_id, kind, amount_pence, charged_at")
      .eq("client_user_id", user.id)
      .eq("status", "succeeded")
      .not("stripe_invoice_id", "is", null)
      .gte("charged_at", since)
      .limit(ACTIVITY_QUERY_LIMIT),
    supabase
      .from("refund_requests")
      .select("id, booking_id, status, resolved_at")
      .eq("client_id", user.id)
      .in("status", ["refunded", "declined"])
      .gte("resolved_at", since)
      .limit(ACTIVITY_QUERY_LIMIT),
  ]);
  if (forms.error) throw forms.error;
  if (formsDone.error) throw formsDone.error;
  if (packsDone.error) throw packsDone.error;
  if (feesDone.error) throw feesDone.error;
  if (refundsDone.error) throw refundsDone.error;
  if (packs.error) throw packs.error;
  if (refunds.error) throw refunds.error;
  if (fees.error) throw fees.error;
  if (holds.error) throw holds.error;

  type RefundRow = { id: string; booking_id: string; status: 'with_provider' | 'under_review'; created_at: string; passed_automatically: boolean | null };
  type FeeRow = { id: string; booking_id: string; kind: BookingFeeKind; amount_pence: number; pay_by: string | null };
  type HoldRow = {
    id: string; service_name_snapshot: string | null; provider_name_snapshot: string | null;
    booking_date: string; booking_time: string; hold_expires_at: string;
  };

  type FormDoneRow = { id: string; booking_id: string; completed_at: string };
  type PackDoneRow = { id: string; booking_id: string; viewed_at: string };
  type FeeDoneRow = { id: string; booking_id: string; kind: BookingFeeKind; amount_pence: number; charged_at: string };
  type RefundDoneRow = { id: string; booking_id: string; status: 'refunded' | 'declined'; resolved_at: string };
  const recentlyDone: ClientActivityDone[] = [
    ...((formsDone.data ?? []) as FormDoneRow[]).map(r => ({ kind: 'form_sent' as const, id: r.id, bookingId: r.booking_id, doneAt: r.completed_at })),
    ...((packsDone.data ?? []) as PackDoneRow[]).map(r => ({ kind: 'pack_read' as const, id: r.id, bookingId: r.booking_id, doneAt: r.viewed_at })),
    ...((feesDone.data ?? []) as FeeDoneRow[]).map(r => ({
      kind: 'fee_paid' as const, id: r.id, bookingId: r.booking_id, doneAt: r.charged_at, feeKind: r.kind, amountPence: r.amount_pence,
    })),
    ...((refundsDone.data ?? []) as RefundDoneRow[]).map(r => ({
      kind: 'refund_decided' as const, id: r.id, bookingId: r.booking_id, doneAt: r.resolved_at, outcome: r.status,
    })),
  ];

  const pendingForms = (forms.data ?? []) as { booking_id: string; title: string | null }[];
  const pendingFormTitles: Record<string, string[]> = {};
  for (const r of pendingForms) {
    const title = r.title?.trim();
    if (title) (pendingFormTitles[r.booking_id] ??= []).push(title);
  }

  return {
    recentlyDone,
    pendingFormBookingIds: pendingForms.map(r => r.booking_id),
    pendingFormTitles,
    unreadPackBookingIds: ((packs.data ?? []) as { booking_id: string }[]).map(r => r.booking_id),
    openRefundRequests: ((refunds.data ?? []) as RefundRow[]).map(r => ({
      id: r.id,
      bookingId: r.booking_id,
      status: r.status,
      createdAt: r.created_at,
      passedAutomatically: !!r.passed_automatically,
    })),
    feesToPay: ((fees.data ?? []) as FeeRow[]).map(r => ({
      id: r.id,
      bookingId: r.booking_id,
      kind: r.kind,
      amountPence: r.amount_pence,
      payBy: r.pay_by,
    })),
    waitlistHolds: ((holds.data ?? []) as HoldRow[]).map(r => ({
      bookingId: r.id,
      serviceName: r.service_name_snapshot ?? '',
      providerName: r.provider_name_snapshot ?? '',
      bookingDate: r.booking_date,
      bookingTime: r.booking_time,
      holdExpiresAt: r.hold_expires_at,
    })),
  };
}

// ─────────────────────────────────────────────────────────
// INFO PACKS (provider-level reference packs, not booking instances)
// ─────────────────────────────────────────────────────────

export interface ProviderInfoPackRow {
  id: string;
  provider_id: string;
  title: string;
  service: string;
  service_names: string[];
  content: string;
  created_at: string;
}

const INFO_PACK_COLUMNS = "id, provider_id, title, service, service_names, content, created_at";

/** Fetch all info packs for a provider (keyed by provider user_id, not provider row id) */
export async function getProviderInfoPacksByUserId(
  providerUserId: string,
): Promise<ProviderInfoPackRow[]> {
  const { data, error } = await supabase
    .from("info_packs")
    .select(INFO_PACK_COLUMNS)
    .eq("provider_id", providerUserId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as ProviderInfoPackRow[];
}

/** Create a new info pack.
 *  `send_to_upcoming` decides whether the on_info_pack_created trigger sends
 *  it to matching upcoming bookings right now (and notifies those clients).
 *  False: only bookings made from now on get it. Needs migration
 *  20261106113000; older builds omit it and the column defaults to TRUE. */
export async function createInfoPack(data: {
  provider_id: string;
  title: string;
  service: string;
  service_names: string[];
  content: string;
  send_to_upcoming: boolean;
}): Promise<ProviderInfoPackRow> {
  const { data: row, error } = await supabase
    .from("info_packs")
    .insert(data)
    .select(INFO_PACK_COLUMNS)
    .single();
  if (error) throw error;
  return row as ProviderInfoPackRow;
}

/** Edit an info pack. Changes the pack only: clients who already received it
 *  keep their own copy in booking_info_packs (product decision 2026-11-05),
 *  and nothing is re-sent. Bookings made afterwards get the new wording. */
export async function updateInfoPack(
  id: string,
  changes: {
    title: string;
    service: string;
    service_names: string[];
    content: string;
  },
): Promise<ProviderInfoPackRow> {
  const { data: row, error } = await supabase
    .from("info_packs")
    .update(changes)
    .eq("id", id)
    .select(INFO_PACK_COLUMNS)
    .single();
  if (error) throw error;
  return row as ProviderInfoPackRow;
}

/** Who each of these packs has reached: one row per booking it was sent to,
 *  with viewed_at once the client opened it. Feeds "Sent to N · N opened" on
 *  the list and the ticks in the send sheet. */
export async function getInfoPackDeliveries(
  infoPackIds: string[],
): Promise<{ infoPackId: string; bookingId: string; viewedAt: string | null }[]> {
  if (infoPackIds.length === 0) return [];
  const { data, error } = await supabase
    .from("booking_info_packs")
    .select("info_pack_id, booking_id, viewed_at")
    .in("info_pack_id", infoPackIds)
    // Bounded: a provider's whole send history, newest first. At this cap the
    // oldest sends stop counting, which only ever under-states a total.
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw error;
  return (data ?? []).map((r: { info_pack_id: string; booking_id: string; viewed_at: string | null }) => ({
    infoPackId: r.info_pack_id,
    bookingId: r.booking_id,
    viewedAt: r.viewed_at ?? null,
  }));
}

/** Delete an info pack by id */
export async function deleteInfoPack(id: string): Promise<void> {
  const { error } = await supabase.from("info_packs").delete().eq("id", id);
  if (error) throw error;
}

/** Manually attach an info pack to a specific booking and notify the client. */
export async function attachInfoPackToBooking(
  bookingId: string,
  infoPackId: string,
): Promise<void> {
  const { error } = await supabase.rpc("attach_info_pack_to_booking", {
    p_booking_id: bookingId,
    p_info_pack_id: infoPackId,
  });
  if (error) throw error;
}
