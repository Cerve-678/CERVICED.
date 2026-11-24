// Database access: Bookings for clients and providers, and "Did you book?" entries.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import { clearCachedReads, supabase } from "../../lib/supabase";
import type { BookingWithAddOns, DbBookingRescheduleRequest, DbClientExternalBooking, DbProvider, LogoFraming } from "../../types/database";
import { getSessionUser } from "./account";
import { DEFAULT_LIFETIME_BOOKINGS_QUERY_LIMIT, DEFAULT_PROVIDER_QUERY_LIMIT, getMyProviderProfile } from "./providers";
import { UUID_RE } from "./social";

// ─────────────────────────────────────────────────────────
// BOOKINGS — Consumer side
// ─────────────────────────────────────────────────────────

/** Direct by-id fetch, bypassing client_bookings — that view deliberately
 *  excludes 'on_hold' rows from the normal bookings list (see
 *  waitlist_holds.sql) so a not-yet-claimed waitlist hold never shows up as
 *  a phantom appointment. This is the one legitimate reason to fetch one
 *  anyway: the client tapped a waitlist_slot_available notification and
 *  needs to see the specific held slot to confirm or decline it. RLS
 *  (bookings_user_select) already scopes this to the caller's own rows. */
// BookingWithAddOns' status field is typed as the client-side BookingStatus
// enum (only meaningful after mapDbBookingToConfirmed), which has no
// 'on_hold' member and doesn't even include 'confirmed' — this fetch
// bypasses that mapping entirely, so the field really is the raw DB string.
export type RawBooking = Omit<BookingWithAddOns, "status"> & { status: string };

export async function getBookingById(
  bookingId: string,
): Promise<RawBooking | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw error;
  return data as RawBooking | null;
}

/**
 * Fetch the current user's bookings within a bounded recent window (default
 * 90 days back) plus everything upcoming — an unbounded `select('*')` over a
 * user's entire booking history doesn't scale as accounts age. Older bookings
 * remain reachable via getOlderBookings() for a "load more" affordance rather
 * than being fetched eagerly on every screen load.
 */
export async function getMyBookings(
  sinceDaysAgo = 90,
): Promise<BookingWithAddOns[]> {
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - sinceDaysAgo);
  const cutoffDate = cutoff.toISOString().split("T")[0];

  // Read from client_bookings (not the base table): a security-invoker view
  // that masks the provider address until the release policy allows it, so the
  // address is enforced server-side rather than hidden by the UI. The view has
  // no user_id filter of its own — it relies on bookings' RLS, which has TWO
  // permissive SELECT policies (client side: user_id = auth.uid(); provider
  // side: provider_id IN caller's own providers) that Postgres ORs together.
  // For a dual-hat account, an unfiltered read here returns both sides — this
  // is "my bookings as a client" specifically, so filter to that explicitly.
  const { data, error } = await supabase
    .from("client_bookings")
    .select("*")
    .eq("user_id", user.id)
    .gte("booking_date", cutoffDate)
    .order("booking_date", { ascending: false })
    .order("booking_time", { ascending: true })
    .limit(DEFAULT_LIFETIME_BOOKINGS_QUERY_LIMIT);

  if (error) throw error;
  return (data ?? []) as BookingWithAddOns[];
}

/** One appointment the signed-in client already has, as the cart needs it:
 *  when it is, and who it's with. No address, no money, no ids — this answers
 *  "am I already busy then?" and nothing else. */
export interface ClientBookedSpan {
  booking_date: string;
  booking_time: string;
  end_time: string | null;
  provider_name_snapshot: string | null;
  service_name_snapshot: string | null;
}

/**
 * The client's own upcoming appointments across ALL providers, for checking
 * whether a new booking would double-book the client themselves.
 *
 * Nothing else in the app asks this question. bookings_no_overlap keys on
 * provider_id, so it stops a PROVIDER being in two places at once and says
 * nothing about the client. AvailabilityService checks whether the provider is
 * free. The cart's own cross-check compares two items only when they share a
 * provider. So a client could book two different providers for the same hour
 * and no layer objected — they would find out on the day.
 *
 * Deliberately date-bounded and capped: this runs on every checkout
 * validation, and an unbounded read of a client's whole history to answer a
 * question about next week is the same mistake DEFAULT_PROVIDER_QUERY_LIMIT
 * exists to prevent.
 */
export async function getMyUpcomingBookedSpans(
  fromDate: string,
  toDate: string,
  limit = 200,
): Promise<ClientBookedSpan[]> {
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("client_bookings") // gated view, client-side only — see getMyBookings
    .select(
      "booking_date, booking_time, end_time, provider_name_snapshot, service_name_snapshot",
    )
    .eq("user_id", user.id)
    // Cancelled and no-showed appointments free the client up again, exactly
    // as they free the provider's slot in bookings_no_overlap's own WHERE.
    .not("status", "in", '("cancelled","no_show")')
    .gte("booking_date", fromDate)
    .lte("booking_date", toDate)
    .order("booking_date", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as ClientBookedSpan[];
}

/**
 * Page further back than getMyBookings()'s default window. `beforeDate` should
 * be the oldest `booking_date` already loaded (YYYY-MM-DD) — since the initial
 * window always fetches full days (`gte`), paging with `lt` on that boundary
 * can't skip or duplicate same-day bookings.
 */
export async function getOlderBookings(
  beforeDate: string,
  limit = 30,
): Promise<BookingWithAddOns[]> {
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("client_bookings") // gated view, client-side only — see getMyBookings
    .select("*")
    .eq("user_id", user.id)
    .lt("booking_date", beforeDate)
    .order("booking_date", { ascending: false })
    .order("booking_time", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as BookingWithAddOns[];
}

/**
 * The signed-in client's most recent completed appointment, however long ago.
 * Becca's "rebook my last appointment" reads BookingContext's cache first, but
 * that only holds getMyBookings()'s recent window — without this, a client
 * whose last visit was more than 90 days ago is told they've never booked.
 */
export async function getMyLatestCompletedBooking(): Promise<BookingWithAddOns | null> {
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("client_bookings") // gated view, client-side only — see getMyBookings
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "completed")
    .order("booking_date", { ascending: false })
    .order("booking_time", { ascending: false })
    .limit(1);

  if (error) throw error;
  return ((data ?? [])[0] as BookingWithAddOns | undefined) ?? null;
}

/**
 * Look up a provider's UUID by display_name (used at checkout to get provider_id).
 *
 * Deliberately NOT filtered on `has_gone_live` — the documented exception to
 * that rule. Every caller resolves a provider the user is already tied to via
 * their own booking (rebooking, reviews, reschedules), and a provider can go
 * un-live after being booked; gating here would break those flows for a
 * booking the client legitimately holds.
 *
 * The safety property is therefore the CALLER's: only pass a name sourced from
 * the user's own bookings, or from an already-gated query result. Never pass
 * free-text user input — that would turn this into a probe for unpublished
 * providers. See `resolveProviderDbId` in becca/capabilities/shared.ts.
 */
export async function getProviderIdByDisplayName(
  name: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("providers")
    .select("id")
    .ilike("display_name", name)
    .eq("is_active", true)
    // Not an imported directory listing — those share this table, and one
    // named like a real provider would make this lookup ambiguous.
    .eq("is_claimed", true)
    .maybeSingle();
  return (data as any)?.id ?? null;
}

/**
 * Check whether another active booking already occupies this exact slot.
 * Mirrors the bookings_no_double_book_idx partial unique index — the index is
 * the hard guarantee; this is the friendly pre-check so the user gets a clear
 * "slot taken" message instead of a failed insert.
 */
export async function isSlotTaken(
  providerId: string,
  bookingDate: string,
  bookingTime24: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("bookings")
    .select("id")
    .eq("provider_id", providerId)
    .eq("booking_date", bookingDate)
    .eq("booking_time", bookingTime24)
    .not("status", "in", "(cancelled,no_show)")
    .limit(1);
  if (error) return false; // fail open — the unique index is the backstop
  return (data?.length ?? 0) > 0;
}

/**
 * Batched form of isSlotTaken for multiple (providerId, date, time) triples —
 * one query for every unique (provider, date) pair rather than one per slot,
 * with the exact-time match done client-side against that day's bookings.
 * Keyed by `${providerId}|${date}|${time24}`.
 */
export async function getSlotsTaken(
  slots: { providerId: string; date: string; time24: string }[],
): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {};
  if (slots.length === 0) return result;

  const uniqueDates = [...new Set(slots.map((s) => s.date))];
  const uniqueProviderIds = [...new Set(slots.map((s) => s.providerId))];

  const { data, error } = await supabase
    .from("bookings")
    .select("provider_id, booking_date, booking_time")
    .in("provider_id", uniqueProviderIds)
    .in("booking_date", uniqueDates)
    .not("status", "in", '("cancelled","no_show")');

  const taken = new Set(
    (data ?? []).map(
      (row: any) =>
        `${row.provider_id}|${row.booking_date}|${row.booking_time}`,
    ),
  );
  for (const { providerId, date, time24 } of slots) {
    const key = `${providerId}|${date}|${time24}`;
    // fail open on error — the DB's unique index is the real backstop
    result[key] = error ? false : taken.has(key);
  }
  return result;
}

// ─────────────────────────────────────────────────────────
// BOOKINGS — Provider side
// ─────────────────────────────────────────────────────────

/**
 * Fetch the current provider's bookings within a bounded recent window
 * (default 90 days back, mirroring getMyBookings()) plus everything
 * upcoming — an unbounded `select('*')` over a provider's entire booking
 * history doesn't scale as accounts age. Pass a larger `sinceDaysAgo` (or
 * `Infinity`) for callers that genuinely need full lifetime history (e.g.
 * ProviderAnalyticsScreen's "All" range); everything else should rely on
 * the default. Older bookings beyond the window remain reachable via
 * getOlderProviderBookings() for a "load more" affordance.
 *
 * `providerId`, when given, skips the internal getMyProviderProfile() call.
 * Callers that already resolved the current provider's id this render/focus
 * (e.g. alongside their own availability fetch) should pass it rather than
 * pay for a second identical profile lookup.
 */
export async function getProviderBookings(
  sinceDaysAgo = 90,
  providerId?: string,
  untilDaysAhead?: number,
): Promise<BookingWithAddOns[]> {
  const resolvedProviderId = providerId ?? (await getMyProviderProfile())?.id;
  if (!resolvedProviderId) return [];

  let query = supabase
    .from("bookings")
    .select(
      `
      *,
      add_ons: booking_add_ons ( * ),
      booking_venue_details ( address, directions, coordinates ),
      booking_client_addresses ( address )
    `,
    )
    // The client's address is NOT on this row. Since 20260827161000 it lives
    // in booking_client_addresses, and bookings.client_address is a
    // write-only funnel that is always NULL at rest — so `*` alone returns a
    // provider a booking with no address on it, forever, which is exactly
    // what it did: the RLS policy releases the address the moment the
    // provider accepts, and nothing ever asked for it. The embed is what
    // makes bca_provider_read_after_accept mean anything on this side.
    // mapDbBookingToConfirmed reads it back into clientAddress.
    .eq("provider_id", resolvedProviderId)
    // A not-yet-claimed waitlist hold isn't a real appointment yet — it
    // surfaces in the Waitlist tab instead (see getProviderWaitlist).
    .neq("status", "on_hold");

  if (Number.isFinite(sinceDaysAgo)) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - sinceDaysAgo);
    query = query.gte("booking_date", cutoff.toISOString().split("T")[0]);
  }
  if (untilDaysAhead != null && Number.isFinite(untilDaysAhead)) {
    const end = new Date();
    end.setDate(end.getDate() + Math.max(0, untilDaysAhead));
    query = query.lte("booking_date", end.toISOString().split("T")[0]);
  }

  const { data, error } = await query
    .order("booking_date", { ascending: true })
    .order("booking_time", { ascending: true })
    .limit(DEFAULT_LIFETIME_BOOKINGS_QUERY_LIMIT);

  if (error) throw error;
  return (data ?? []) as BookingWithAddOns[];
}

/** Subscribe to booking changes for one provider; caller owns the cleanup. */
export function subscribeToProviderBookingChanges(
  providerId: string,
  onChange: () => void,
): () => void {
  const channel = supabase
    .channel(`provider-bookings-${providerId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "bookings",
        filter: `provider_id=eq.${providerId}`,
      },
      () => {
        clearCachedReads();
        onChange();
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export interface ProviderBookingLiveUpdate {
  booking_date?: string;
  booking_time?: string;
  end_time?: string | null;
  status?: string;
}

/** Realtime detail updates for one booking and its reschedule request. */
export function subscribeToProviderBookingDetailChanges(
  bookingId: string,
  callbacks: {
    onReschedule: (row: DbBookingRescheduleRequest | null) => void;
    onBookingUpdate: (row: ProviderBookingLiveUpdate) => void;
  },
): () => void {
  const channel = supabase
    .channel(`provider-booking-detail-${bookingId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "booking_reschedule_requests",
        filter: `booking_id=eq.${bookingId}`,
      },
      (payload) => {
        clearCachedReads();
        callbacks.onReschedule(
          payload.eventType === "DELETE"
            ? null
            : (payload.new as DbBookingRescheduleRequest),
        );
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "bookings",
        filter: `id=eq.${bookingId}`,
      },
      (payload) => {
        clearCachedReads();
        callbacks.onBookingUpdate(
          payload.new as ProviderBookingLiveUpdate,
        );
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * Page further back than getProviderBookings()'s default window. `beforeDate`
 * should be the oldest `booking_date` already loaded (YYYY-MM-DD) — since the
 * initial window always fetches full days (`gte`), paging with `lt` on that
 * boundary can't skip or duplicate same-day bookings. Mirrors getOlderBookings()
 * on the client side.
 */
export async function getOlderProviderBookings(
  beforeDate: string,
  limit = 30,
): Promise<BookingWithAddOns[]> {
  const provider = await getMyProviderProfile();
  if (!provider) return [];

  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      *,
      add_ons: booking_add_ons ( * ),
      booking_venue_details ( address, directions, coordinates )
    `,
    )
    .eq("provider_id", provider.id)
    .neq("status", "on_hold")
    .lt("booking_date", beforeDate)
    .order("booking_date", { ascending: false })
    .order("booking_time", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as BookingWithAddOns[];
}

/**
 * Every booking sharing a group_booking_id, scoped to the CURRENT provider's
 * own rows only — a group booking can span multiple providers (each booked
 * separately in one client checkout), and a provider must never see another
 * provider's services within the same client group, only their own. RLS
 * (bookings_provider_read) already enforces this server-side; the explicit
 * .eq('provider_id', ...) here just makes the boundary visible in the query
 * itself rather than relying on RLS alone to narrow it.
 */
export async function getGroupBookingSiblings(
  groupBookingId: string,
): Promise<BookingWithAddOns[]> {
  const provider = await getMyProviderProfile();
  if (!provider) return [];

  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      *,
      add_ons: booking_add_ons ( * ),
      booking_venue_details ( address, directions, coordinates )
    `,
    )
    .eq("group_booking_id", groupBookingId)
    .eq("provider_id", provider.id)
    .order("booking_date", { ascending: true })
    .order("booking_time", { ascending: true });

  if (error) throw error;
  return (data ?? []) as BookingWithAddOns[];
}

/** A provider_conversations row joined with the client's basic profile info */
export interface ProviderConversationWithClient {
  id: string;
  provider_id: string;
  user_id: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count_user: number;
  unread_count_provider: number;
  created_at: string;
  updated_at: string;
  has_booking: boolean;
  client: { id: string; name: string; avatar_url: string | null } | null;
  /**
   * True when this person holds (or has held) a booking with the provider.
   * False means the thread came from Get In Touch on the public profile — a
   * general enquiry from someone who hasn't booked.
   */
  has_booked: boolean;
}

/** Classify by the same non-cancelled booking history used in client chat.
 * Page lightweight rows so old clients are not lost to the diary date window
 * or the API row limit. Provider scope and RLS apply to every page.
 */
async function getBookedConversationUserIds(providerId: string, userIds: string[]): Promise<Set<string>> {
  const booked = new Set<string>();
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("bookings")
      .select("id, user_id")
      .eq("provider_id", providerId)
      .in("user_id", userIds)
      .neq("status", "cancelled")
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    for (const booking of data ?? []) booked.add(booking.user_id);
    if ((data?.length ?? 0) < pageSize || booked.size === userIds.length) return booked;
  }
}

/** Fetch all conversations for the current provider, most recently updated first */
export async function getProviderConversations(): Promise<
  ProviderConversationWithClient[]
> {
  const provider = await getMyProviderProfile();
  if (!provider) return [];

  const { data, error } = await supabase
    .from("provider_conversations")
    .select(
      "id, provider_id, user_id, last_message, last_message_at, unread_count_user, unread_count_provider, created_at, updated_at",
    )
    .eq("provider_id", provider.id)
    .order("updated_at", { ascending: false })
    .limit(DEFAULT_PROVIDER_QUERY_LIMIT);

  if (error) throw error;
  const conversations = (data ?? []) as Omit<
    ProviderConversationWithClient,
    "client" | "has_booking"
  >[];
  if (conversations.length === 0) return [];

  // Client name/avatar via the same batched RPC as getProviderReviews — see
  // fix_users_table_pii_leak.sql for why this isn't an embedded users join.
  const userIds = [...new Set(conversations.map((c) => c.user_id))];
  const [profileResult, bookedUserIds] = await Promise.all([
    supabase.rpc("get_user_public_profiles", { p_user_ids: userIds }),
    getBookedConversationUserIds(provider.id, userIds),
  ]);
  const { data: profiles, error: profilesError } = profileResult;
  if (profilesError) throw profilesError;
  const profileById = new Map<
    string,
    { id: string; name: string; avatar_url: string | null }
  >(
    (profiles ?? []).map((p: any) => [
      p.id,
      { id: p.id, name: p.name, avatar_url: p.avatar_url },
    ]),
  );

  return conversations.map(
    (c): ProviderConversationWithClient => ({
      ...c,
      client: profileById.get(c.user_id) ?? null,
      has_booking: bookedUserIds.has(c.user_id),
    }),
  );
}

/** Count unread provider conversations without hydrating conversation rows. */
export async function getProviderUnreadConversationCount(): Promise<number> {
  const provider = await getMyProviderProfile();
  if (!provider) return 0;
  const { count, error } = await supabase
    .from("provider_conversations")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", provider.id)
    .gt("unread_count_provider", 0);
  if (error) throw error;
  return count ?? 0;
}

export interface ProviderEnquirySummary {
  /** Conversations with a message the provider hasn't read. */
  unread: number;
  /** The most recent of those, for a one-line preview. */
  latest: { clientName: string | null; message: string | null } | null;
}

/** The unread count and the newest unread message for a provider's own
 *  Dashboard — one row and one name, instead of the whole inbox. */
export async function getProviderEnquirySummary(providerId: string): Promise<ProviderEnquirySummary> {
  const { data, count, error } = await supabase
    .from("provider_conversations")
    .select("user_id, last_message", { count: "exact" })
    .eq("provider_id", providerId)
    .gt("unread_count_provider", 0)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) throw error;
  const row = (data ?? [])[0] as { user_id: string; last_message: string | null } | undefined;
  if (!row) return { unread: count ?? 0, latest: null };
  // Same batched RPC the inbox uses — see fix_users_table_pii_leak.sql.
  const { data: profiles, error: profilesError } = await supabase.rpc("get_user_public_profiles", {
    p_user_ids: [row.user_id],
  });
  if (profilesError) throw profilesError;
  const name = ((profiles ?? []) as { id: string; name: string | null }[])[0]?.name ?? null;
  return { unread: count ?? 0, latest: { clientName: name, message: row.last_message } };
}

/** A provider_conversations row joined with the provider's public info */
export interface UserConversationWithProvider {
  id: string;
  provider_id: string;
  user_id: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count_user: number;
  unread_count_provider: number;
  created_at: string;
  updated_at: string;
  provider: {
    id: string;
    slug: string;
    display_name: string;
    logo_url: string | null;
    logo_framing: LogoFraming | null;
  } | null;
}

/** Fetch all conversations for the current client user, most recently updated first */
export async function getUserConversations(): Promise<
  UserConversationWithProvider[]
> {
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("provider_conversations")
    .select(
      "id, provider_id, user_id, last_message, last_message_at, unread_count_user, unread_count_provider, created_at, updated_at, provider: providers ( id, slug, display_name, logo_url, logo_framing )",
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(DEFAULT_PROVIDER_QUERY_LIMIT);

  if (error) throw error;
  return (data ?? []) as unknown as UserConversationWithProvider[];
}

/** Subscribe only to one client's conversation rows. */
export function subscribeToUserConversationChanges(
  userId: string,
  onChange: () => void,
): () => void {
  const channel = supabase
    .channel(`user-conversations-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "provider_conversations",
        filter: `user_id=eq.${userId}`,
      },
      () => {
        clearCachedReads();
        onChange();
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Fetch bookings for a provider on a specific date */
export async function getProviderBookingsByDate(
  providerId: string,
  date: string,
): Promise<BookingWithAddOns[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      *,
      add_ons: booking_add_ons ( * ),
      booking_venue_details ( address, directions, coordinates )
    `,
    )
    .eq("provider_id", providerId)
    .eq("booking_date", date)
    .not("status", "in", '("cancelled","on_hold")')
    .order("booking_time", { ascending: true });

  if (error) throw error;
  return (data ?? []) as BookingWithAddOns[];
}

/** Bookings across an inclusive date range — one query instead of one per day. */
export async function getProviderBookingsByDateRange(
  providerId: string,
  startDate: string,
  endDate: string,
  limit = DEFAULT_PROVIDER_QUERY_LIMIT,
): Promise<BookingWithAddOns[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      *,
      add_ons: booking_add_ons ( * ),
      booking_venue_details ( address, directions, coordinates )
    `,
    )
    .eq("provider_id", providerId)
    .gte("booking_date", startDate)
    .lte("booking_date", endDate)
    .not("status", "in", '("cancelled","on_hold")')
    .order("booking_date", { ascending: true })
    .order("booking_time", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as BookingWithAddOns[];
}

/** A provider's next bookings still to come from a date onwards, soonest
 *  first. A provider reading their own diary, so no has_gone_live filter. */
export async function getProviderUpcomingBookings(
  providerId: string,
  fromDate: string,
  limit: number,
): Promise<BookingWithAddOns[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      *,
      add_ons: booking_add_ons ( * ),
      booking_venue_details ( address, directions, coordinates )
    `,
    )
    .eq("provider_id", providerId)
    .gte("booking_date", fromDate)
    .in("status", ["pending", "confirmed", "in_progress"])
    .order("booking_date", { ascending: true })
    .order("booking_time", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as BookingWithAddOns[];
}

/** A provider's bookings by when they were made, newest first, for the
 *  Recent activity card on My Profile and its See all list. A provider
 *  reading their own diary, so no has_gone_live filter. Unclaimed waitlist
 *  holds aren't bookings yet, so they're left out (as getProviderBookings). */
export async function getProviderRecentBookings(
  providerId: string,
  limit: number,
): Promise<BookingWithAddOns[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      *,
      add_ons: booking_add_ons ( * ),
      booking_venue_details ( address, directions, coordinates ),
      booking_client_addresses ( address )
    `,
    )
    .eq("provider_id", providerId)
    .neq("status", "on_hold")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as BookingWithAddOns[];
}

// ─────────────────────────────────────────────────────────
// CLIENT EXTERNAL BOOKINGS — "Did you book?" entries
// ─────────────────────────────────────────────────────────

/** The public provider fields a booked-elsewhere card and its detail need. */
const EXTERNAL_BOOKING_SELECT =
  "id, client_id, provider_id, booking_date, start_time, service_label, created_at, " +
  "provider:providers(id, slug, display_name, logo_url, logo_framing, location_text, business_type, external_booking_url, has_gone_live, is_active)";

export type ClientExternalBookingWithProvider = DbClientExternalBooking & {
  /** Null once the provider is no longer live — their row stops being
   *  readable, but the client's own note of the booking stays theirs. */
  provider: Pick<
    DbProvider,
    "id" | "slug" | "display_name" | "logo_url" | "logo_framing" | "location_text" | "business_type" | "external_booking_url"
  > | null;
};

function mapExternalBookingRow(row: unknown): ClientExternalBookingWithProvider {
  const r = row as DbClientExternalBooking & {
    provider: (ClientExternalBookingWithProvider["provider"] & {
      has_gone_live: boolean;
      is_active: boolean;
    }) | null;
  };
  // Client-facing: a provider that has gone offline is not shown, even
  // though their row may still be readable.
  const live = r.provider && r.provider.has_gone_live && r.provider.is_active;
  const provider = live && r.provider
    ? {
        id: r.provider.id,
        slug: r.provider.slug,
        display_name: r.provider.display_name,
        logo_url: r.provider.logo_url,
        logo_framing: r.provider.logo_framing ?? null,
        location_text: r.provider.location_text,
        business_type: r.provider.business_type,
        external_booking_url: r.provider.external_booking_url,
      }
    : null;
  return {
    id: r.id,
    client_id: r.client_id,
    provider_id: r.provider_id,
    booking_date: r.booking_date,
    start_time: r.start_time,
    service_label: r.service_label,
    created_at: r.created_at,
    provider,
  };
}

/** Every booked-elsewhere entry the signed-in client has added, soonest first.
 *  Callers split upcoming from past. */
export async function getMyExternalBookings(): Promise<ClientExternalBookingWithProvider[]> {
  const { data: { user } } = await getSessionUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("client_external_bookings")
    .select(EXTERNAL_BOOKING_SELECT)
    .eq("client_id", user.id)
    .order("booking_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map(mapExternalBookingRow);
}

export async function getMyExternalBooking(
  id: string,
): Promise<ClientExternalBookingWithProvider | null> {
  if (!UUID_RE.test(id)) return null;
  const { data, error } = await supabase
    .from("client_external_bookings")
    .select(EXTERNAL_BOOKING_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapExternalBookingRow(data) : null;
}

/** Add a "Did you book?" entry. The DB only accepts it for a live link-only
 *  provider, for the signed-in client. */
export async function addMyExternalBooking(entry: {
  providerId: string;
  /** YYYY-MM-DD */
  bookingDate: string;
  /** HH:MM or HH:MM:SS */
  startTime: string;
  serviceLabel: string;
}): Promise<ClientExternalBookingWithProvider> {
  const { data: { user } } = await getSessionUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("client_external_bookings")
    .insert({
      client_id: user.id,
      provider_id: entry.providerId,
      booking_date: entry.bookingDate,
      start_time: entry.startTime,
      service_label: entry.serviceLabel.trim(),
    })
    .select(EXTERNAL_BOOKING_SELECT)
    .single();
  if (error) throw error;
  return mapExternalBookingRow(data);
}

/** Remove one of the client's own entries. Throws if nothing was removed, so
 *  an RLS miss can't look like success. */
export async function removeMyExternalBooking(id: string): Promise<void> {
  const { data, error } = await supabase
    .from("client_external_bookings")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Booked-elsewhere entry not found or not yours to remove");
  }
}

// ─────────────────────────────────────────────────────────
// BOOKINGS — additional queries
// ─────────────────────────────────────────────────────────

/** Fetch a single booking with its add-ons by ID — provider booking detail screen */
export async function getBookingWithAddOnsById(
  bookingId: string,
): Promise<BookingWithAddOns | null> {
  const { data, error } = await supabase
    .from("bookings")
    // Embedded for the same reason as getProviderBookings above — this is the
    // other read behind ProviderBookingDetailScreen, and a `*` here means a
    // provider who opens a booking by id (a notification tap, a deep link)
    // sees "waiting for the client's address" on a booking that has one.
    // RLS still decides: before the provider accepts, the embed comes back
    // empty rather than erroring, which is the gate working.
    .select("*, add_ons: booking_add_ons(*), booking_client_addresses ( address )")
    .eq("id", bookingId)
    .single();
  if (error) return null;
  return data as BookingWithAddOns;
}

/** Return only the user_id for a booking — avoids fetching the full row when only identity is needed */
export async function getBookingUserId(
  bookingId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("bookings")
    .select("user_id")
    .eq("id", bookingId)
    .single();
  return (data as any)?.user_id ?? null;
}
