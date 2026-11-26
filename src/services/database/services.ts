// Database access: The service catalogue: a provider's own services and service lookups.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import type { ServiceAudienceValue, ServiceTagGroups } from "../../features/providers/serviceTags";
import { supabase } from "../../lib/supabase";
import type { DbBooking, DbPromotion, DbService, NotificationType } from "../../types/database";
import { getSessionUser } from "./account";
import { DEFAULT_PROVIDER_QUERY_LIMIT } from "./providers";
import { UUID_RE } from "./social";

// ─────────────────────────────────────────────────────────
// SERVICE CATALOGUE — the owner's own read/write
// ─────────────────────────────────────────────────────────
//
// Until now the only way to change a service was replaceProviderServiceCatalog
// (replace_provider_services), which rewrites a provider's WHOLE catalogue from
// InfoRegScreen's one-shot document save — and that save also re-geocodes their
// address and re-uploads their logo. Editing one price meant reposting
// everything. These four are the per-row alternative, so the My Services tab
// can manage the catalogue directly.
//
// All of them rely on the `services_owner_all` RLS policy (FOR ALL, USING
// provider_id IN (SELECT id FROM providers WHERE user_id = auth.uid())), which
// is what scopes them to the caller's own rows. There is deliberately no
// provider_id parameter on the by-id functions: passing one would imply this
// code is the boundary, and it isn't — the database is.

/** Everything the owner needs to see in their catalogue, INCLUDING hidden
 *  rows. Deliberately not getMyProviderServices, which filters
 *  `is_active = true` for booking purposes — a manager that hid inactive
 *  services would give a provider no way to bring one back. */
export async function getMyServiceCatalogue(knownProviderId?: string): Promise<{
  providerId: string | null;
  services: DbService[];
}> {
  // Callers holding their own provider row pass its id rather than making
  // this re-resolve the same row from the auth session.
  let providerId = knownProviderId;
  if (!providerId) {
    const {
      data: { user },
      error: authError,
    } = await getSessionUser();
    if (authError) throw authError;
    if (!user) throw new Error("Not authenticated");

    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id")
      .eq("user_id", user.id)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (providerError) throw providerError;
    if (!provider) return { providerId: null, services: [] };
    providerId = provider.id as string;
  }

  const { data, error } = await supabase
    .from("services")
    .select(
      "id, provider_id, category_name, category_description, name, description, price, price_max, duration_minutes, buffer_before_mins, buffer_after_mins, latest_start_time, is_active, sort_order, created_at, tags, technique_tags, outcome_tags, occasion_tags, trend_names, is_pregnancy_safe, patch_test_required, min_age, contraindications, hair_types_suitable, skin_tones_suitable, audience, aftercare_notes, service_type",
    )
    .eq("provider_id", providerId)
    .order("category_name", { ascending: true })
    .order("sort_order", { ascending: true })
    .limit(DEFAULT_PROVIDER_QUERY_LIMIT);
  if (error) throw error;

  return { providerId, services: (data ?? []) as DbService[] };
}

/** The fields the My Services manager can set. Everything else on a service
 *  row (safety flags, buffers, add-ons, and tags once a service has any) is
 *  still owned by the fuller editor — this is the day-to-day set, not a
 *  second way to write all of it. */
export interface MyServiceDraft {
  name: string;
  price: number;
  durationMinutes: number;
  description: string | null;
  /** Update only; createMyService ignores it, since a new service always
   *  starts visible. Written in the same UPDATE as the other fields, so a
   *  visibility change can't land while the edit around it fails. */
  isActive?: boolean;
  /** Only sent while a service has no tags yet (ServiceEditorSheet's "help
   *  clients find it"). Absent = leave every tag column as it is. */
  tags?: ServiceTagGroups;
  /** Absent = leave services.audience as it is. */
  audience?: Exclude<ServiceAudienceValue, ''>;
  /** Latest start, 'HH:MM' (UK time). null = any time in working hours;
   *  absent = leave services.latest_start_time as it is. */
  latestStartTime?: string | null;
}

export interface ServiceDescriptionRevision {
  id: string;
  description: string;
  source: 'draft' | 'published';
  created_at: string;
}

/** Back up exactly what the provider accepted in the service editor, before
 * the larger profile form can refresh or fail to publish it. */
export async function saveServiceDescriptionDraft(
  providerId: string,
  serviceId: string | null,
  draftKey: string,
  serviceName: string,
  description: string,
): Promise<void> {
  const { error } = await supabase.from('service_description_history').insert({
    provider_id: providerId,
    service_id: serviceId,
    draft_key: draftKey,
    service_name: serviceName,
    description,
    source: 'draft',
  });
  if (error) throw error;
}

/** Recent draft and published wording for one service. RLS confines this to
 * the signed-in owner; the provider id also bounds the lookup. */
export async function getServiceDescriptionHistory(
  providerId: string,
  serviceId: string | null,
  draftKey: string,
): Promise<ServiceDescriptionRevision[]> {
  const query = supabase.from('service_description_history')
    .select('id, description, source, created_at')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false })
    .limit(30);
  const { data, error } = serviceId
    ? await query.eq('service_id', serviceId)
    : await query.eq('draft_key', draftKey);
  if (error) throw error;
  return (data ?? []) as ServiceDescriptionRevision[];
}

/** The tag, audience and latest-start columns a draft carries, and nothing for what it doesn't. */
function myServiceOptionalColumns(draft: MyServiceDraft): Record<string, unknown> {
  return {
    ...(draft.tags
      ? {
          tags: draft.tags.styleTags,
          technique_tags: draft.tags.techniqueTags,
          outcome_tags: draft.tags.outcomeTags,
          occasion_tags: draft.tags.occasionTags,
          trend_names: draft.tags.trendNames,
        }
      : {}),
    ...(draft.audience ? { audience: draft.audience } : {}),
    ...(draft.latestStartTime === undefined ? {} : { latest_start_time: draft.latestStartTime }),
  };
}

export async function createMyService(
  providerId: string,
  categoryName: string,
  draft: MyServiceDraft,
): Promise<DbService> {
  // Appended, not inserted at the top: sort_order drives the client-facing
  // order, so a new service must not silently jump ahead of the ones a
  // provider already arranged.
  const { data: last, error: lastError } = await supabase
    .from("services")
    .select("sort_order")
    .eq("provider_id", providerId)
    .eq("category_name", categoryName)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) throw lastError;

  const { data, error } = await supabase
    .from("services")
    .insert({
      provider_id: providerId,
      category_name: categoryName,
      name: draft.name,
      description: draft.description,
      price: draft.price,
      duration_minutes: draft.durationMinutes,
      sort_order: ((last?.sort_order as number | undefined) ?? -1) + 1,
      is_active: true,
      ...myServiceOptionalColumns(draft),
    })
    .select("id, provider_id, category_name, category_description, name, description, price, price_max, duration_minutes, buffer_before_mins, buffer_after_mins, latest_start_time, is_active, sort_order, created_at, tags, technique_tags, outcome_tags, occasion_tags, trend_names, is_pregnancy_safe, patch_test_required, min_age, contraindications, hair_types_suitable, skin_tones_suitable, audience, aftercare_notes, service_type")
    .single();
  if (error) throw error;
  return data as DbService;
}

export async function updateMyService(
  serviceId: string,
  draft: MyServiceDraft,
): Promise<DbService> {
  const { data, error } = await supabase
    .from("services")
    .update({
      name: draft.name,
      description: draft.description,
      price: draft.price,
      duration_minutes: draft.durationMinutes,
      ...(draft.isActive === undefined ? {} : { is_active: draft.isActive }),
      ...myServiceOptionalColumns(draft),
    })
    .eq("id", serviceId)
    .select("id, provider_id, category_name, category_description, name, description, price, price_max, duration_minutes, buffer_before_mins, buffer_after_mins, latest_start_time, is_active, sort_order, created_at, tags, technique_tags, outcome_tags, occasion_tags, trend_names, is_pregnancy_safe, patch_test_required, min_age, contraindications, hair_types_suitable, skin_tones_suitable, audience, aftercare_notes, service_type")
    .single();
  if (error) throw error;
  return data as DbService;
}

/**
 * Hide or show a service. This is the manager's destructive-looking action on
 * purpose — there is no deleteMyService.
 *
 * A service row is referenced by every booking ever made from it
 * (bookings_service_id_fkey), so deleting one either fails on the constraint
 * or, worse, would orphan a provider's own history. `is_active = false` is
 * already what the client-facing `services_public_read` policy filters on, so
 * hiding genuinely removes it from sale without destroying the record.
 */
export async function setMyServiceActive(
  serviceId: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("services")
    .update({ is_active: isActive })
    .eq("id", serviceId);
  if (error) throw error;
}

/** Promotion manager core data with one auth/provider identity resolution. */
export async function getMyPromotionManagerCore(): Promise<{
  promotions: DbPromotion[];
  services: DbService[];
}> {
  const {
    data: { user },
    error: authError,
  } = await getSessionUser();
  if (authError) throw authError;
  if (!user) throw new Error("Not authenticated");
  const { data: provider, error: providerError } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (providerError) throw providerError;
  if (!provider) return { promotions: [], services: [] };

  const [promotionResult, serviceResult] = await Promise.all([
    supabase
      .from("promotions")
      .select(
        "id, provider_id, title, description, discount_text, discount_percent, discount_amount, service_category, service_ids, promo_code, valid_from, valid_until, is_active, image_url, scheduled_notify_at, notify_sent_at, created_at",
      )
      .eq("provider_id", provider.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("services")
      .select(
        "id, provider_id, service_category, category_name, category_description, name, description, price, price_max, duration_minutes, buffer_before_mins, buffer_after_mins, is_active, sort_order, created_at, tags, technique_tags, outcome_tags, occasion_tags, trend_names, is_pregnancy_safe, patch_test_required, min_age, contraindications, hair_types_suitable, skin_tones_suitable, audience, aftercare_notes, service_type, service_add_ons ( id, service_id, name, price, description, is_active, extra_minutes, provider_add_on_id )",
      )
      .eq("provider_id", provider.id)
      .eq("is_active", true)
      .eq("service_add_ons.is_active", true)
      .order("sort_order", { ascending: true })
      .limit(200)
      .limit(50, { referencedTable: "service_add_ons" }),
  ]);
  if (promotionResult.error) throw promotionResult.error;
  if (serviceResult.error) throw serviceResult.error;
  return {
    promotions: (promotionResult.data ?? []) as DbPromotion[],
    services: (serviceResult.data ?? []).map((service) => ({
      ...service,
      add_ons: service.service_add_ons ?? [],
    })) as DbService[],
  };
}

/** Server-owned checkout intent. The app sends only the appointment choices;
 * the RPC reads current service and add-on prices, validates availability and
 * creates the short-lived reservation atomically. */
export type CheckoutIntentItem = {
  provider_id: string;
  service_id: string;
  booking_date: string;
  booking_time: string;
  add_on_ids?: string[];
  use_deposit?: boolean;
  notes?: string;
  // Required true when the service has patch_test_required or
  // is_pregnancy_safe=false — prepare_checkout rejects the item otherwise.
  // See supabase/migrations/20260817085443_safety_acknowledgement_checkout.sql.
  safety_ack?: boolean;
  // This appointment is a request for a time the provider's own scheduling
  // rules exclude. enforce_booking_bookability() decides whether that
  // provider permits it at all; neither claim_cart_booking_slots() nor
  // finalize_checkout() ever auto-confirms one, whatever the provider's
  // auto_accept_bookings says.
  // emergency_ack must be true whenever emergency is — prepare_checkout
  // rejects the item otherwise, the same shape as safety_ack above. See
  // supabase/migrations/20260821143821_emergency_booking_requests.sql.
  emergency?: boolean;
  emergency_ack?: boolean;
  // A waitlist slot held for this client (bookings.id of the on_hold row).
  // prepare_checkout reuses that row instead of inserting one, keeps its own
  // 10 minutes, and refuses it if the hold has ended or isn't theirs. One per
  // checkout. See 20261113210000_waitlist_pays_at_confirm.sql.
  waitlist_hold_id?: string;
  // Where a MOBILE provider should travel to. prepare_checkout() reads the
  // provider's business_type server-side and rejects a mobile item with no
  // client_address, then writes it onto the held row so the
  // on_booking_client_address_written trigger relocates it into the gated
  // booking_client_addresses table (the Stripe path's equivalent of what
  // claim_cart_booking_slots() does for the live route). Omit for a
  // fixed-location provider — it is ignored there. client_area is the coarse
  // location a mobile provider judges travel by; when absent the DB derives it
  // from the address. See
  // supabase/migrations/20260929061000_prepare_checkout_captures_mobile_client_address.sql.
  client_address?: string | null;
  client_area?: string | null;
  // The Confirm & Pay checkbox (CERVICED's Terms + the provider's
  // cancellation policy). prepare_checkout refuses the item without it and
  // stamps bookings.policy_accepted_at from the database clock.
  policy_accepted?: boolean;
  // The provider's policy as the cart showed it (CartItem.policySnapshot).
  // Never stored as-is: prepare_checkout freezes the provider's LIVE policy,
  // and refuses when a money term here differs from it, so nobody is charged
  // under terms they never saw. Its providerTerms is how the server knows the
  // client agreed to the provider's written terms. See
  // supabase/migrations/20261113090000_card_checkout_saves_policy_and_consent.sql.
  policy_snapshot?: Record<string, unknown> | null;
  // The provider's promo code the cart applied. prepare_checkout re-validates
  // it (active, in date in UK time, this provider's) and prices the discount
  // itself; an ended code is refused by name. See
  // supabase/migrations/20261113100000_promo_code_charged_at_checkout.sql.
  promo_code?: string;
};

export type PreparedCheckout = {
  checkoutBatchId: string;
  amountDue: number;
  expiresAt: string;
};

export async function prepareCheckout(
  items: CheckoutIntentItem[],
): Promise<PreparedCheckout> {
  const { data, error } = await supabase.rpc("prepare_checkout", {
    p_items: items,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.checkout_batch_id || !row.expires_at) {
    throw new Error("Checkout could not be prepared. Please try again.");
  }
  // prepare_checkout returns its subtotal as it creates the holds. The
  // database then applies the platform fee atomically, so read the final
  // client-owned batch rather than trusting the RPC echo. This server total is
  // what the payment sheet shows, so it is right even when an older app
  // build works the cart's fee out differently.
  const { data: batch, error: batchError } = await supabase
    .from("checkout_batches")
    .select("amount_due, expires_at")
    .eq("id", row.checkout_batch_id)
    .single();
  if (batchError || !batch)
    throw new Error("Checkout could not be priced. Please try again.");
  return {
    checkoutBatchId: row.checkout_batch_id,
    amountDue: Number(batch.amount_due),
    expiresAt: batch.expires_at,
  };
}

/** Immediately releases a prepared server checkout when the user backs out. */
export async function cancelCheckout(checkoutBatchId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_checkout", {
    p_checkout_batch_id: checkoutBatchId,
  });
  if (error) throw error;
}

/** One of the client's own earlier checkouts whose payment reached Stripe. */
export interface EarlierCheckoutPayment {
  checkoutBatchId: string;
  paymentIntentId: string;
}

/** The client's own unfinished checkouts that a payment was started for and
 *  that hold the same time (provider, date and start time) as one this
 *  checkout books: an earlier attempt at the same slot, which would make the
 *  new one say it's taken. prepare_checkout releases such a checkout itself
 *  only when no payment was started (it can't ask Stripe whether the card was
 *  approved), so these are left for the caller to cancel through
 *  finalize-payment-intent, which can. Matching the exact start time, not just
 *  the day, keeps it off a payment the same client is making for another time
 *  on another phone or on the website. */
export async function getMyEarlierCheckoutPayments(
  slots: ReadonlyArray<{ providerId: string; date: string; time: string }>,
): Promise<EarlierCheckoutPayment[]> {
  if (slots.length === 0) return [];
  const { data: session, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = session.session?.user.id;
  if (!userId) return [];
  // Explicitly the caller's own, not only by RLS: what this returns gets
  // cancelled, so a widened read policy must not widen it.
  const { data: batches, error } = await supabase
    .from("checkout_batches")
    .select("id, payment_intent_id")
    .eq("user_id", userId)
    .eq("status", "prepared")
    .not("payment_intent_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  if (!batches?.length) return [];

  const { data: held, error: heldError } = await supabase
    .from("bookings")
    .select("hold_batch_id, provider_id, booking_date, booking_time")
    .eq("user_id", userId)
    .in("hold_batch_id", batches.map(batch => batch.id))
    .eq("status", "on_hold")
    .limit(200);
  if (heldError) throw heldError;

  const slotKey = (providerId: string, date: string, time: string) =>
    `${providerId}|${date}|${hhmm(time)}`;
  const wanted = new Set(slots.map(slot => slotKey(slot.providerId, slot.date, slot.time)));
  const overlapping = new Set(
    (held ?? [])
      .filter(row => wanted.has(slotKey(String(row.provider_id), String(row.booking_date), String(row.booking_time))))
      .map(row => String(row.hold_batch_id)),
  );
  return batches
    .filter(batch => overlapping.has(String(batch.id)))
    .map(batch => ({ checkoutBatchId: String(batch.id), paymentIntentId: String(batch.payment_intent_id) }));
}

/** '9:30', '09:30' or '09:30:00' → '09:30'. */
function hhmm(time: string): string {
  const [hours = '', minutes = ''] = time.split(':');
  return `${hours.padStart(2, '0')}:${minutes.slice(0, 2)}`;
}

/** Creates a confirmed, unpaid appointment for one of this provider's existing
 * app clients. The database performs the provider ownership, service, hours,
 * capacity and overlap checks in one transaction. */
export async function providerCreateManualBooking(input: {
  clientUserId: string;
  serviceId: string;
  bookingDate: string;
  bookingTime: string;
  notes?: string;
  addOnIds?: string[];
  // Required true when the service has patch_test_required or
  // is_pregnancy_safe=false — the RPC rejects the insert otherwise. See
  // supabase/migrations/20260817085443_safety_acknowledgement_checkout.sql.
  safetyAck?: boolean;
  // Provider has seen and confirmed a scheduling-POLICY warning (booking
  // window, minimum notice, or a date they'd marked blocked) and wants to
  // proceed anyway. Does NOT bypass a genuinely taken slot or a same-day
  // time that has already passed — those stay hard errors regardless. See
  // supabase/migrations/20260817150000_manual_booking_scheduling_policy_override.sql.
  overrideScheduling?: boolean;
  // Extra minutes blocked out on top of the service's own duration (e.g.
  // "this client's hair is extra thick, +30 min") — extends end_time only,
  // never billing. 0-240, clamped/rejected server-side. See
  // supabase/migrations/20260817160000_manual_booking_extra_minutes.sql.
  extraMinutes?: number;
}): Promise<string> {
  const { data, error } = await supabase.rpc("provider_create_manual_booking", {
    p_client_user_id: input.clientUserId,
    p_service_id: input.serviceId,
    p_booking_date: input.bookingDate,
    p_booking_time: input.bookingTime,
    p_notes: input.notes?.trim() || null,
    p_add_on_ids: input.addOnIds ?? [],
    p_safety_ack: input.safetyAck ?? false,
    p_override_scheduling: input.overrideScheduling ?? false,
    p_extra_minutes: input.extraMinutes ?? 0,
  });
  if (error) throw error;
  if (!data) throw new Error("Booking could not be created. Please try again.");
  return data as string;
}

/** Claim a promotion's scheduled notification. Returns false when another
 *  sender (the scheduled-promotion cron job) already claimed it — callers
 *  must claim BEFORE sending so clients never get the blast twice. */
export async function markScheduledNotifSent(
  promoId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("promotions")
    .update({ notify_sent_at: new Date().toISOString() })
    .eq("id", promoId)
    .is("notify_sent_at", null)
    .select("id");
  return (data ?? []).length > 0;
}

/** Get all unique clients who have booked this provider, with stats */
/** Booking rows scanned when aggregating a provider's clientele. */
const CLIENTELE_BOOKING_SCAN_LIMIT = 2000;

export async function getProviderClientele(): Promise<
  import("../../types/database").ClienteleMember[]
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
    .from("bookings")
    .select(
      "user_id, customer_name, customer_email, booking_date, base_price, add_ons_total",
    )
    .eq("provider_id", provider.id)
    .in("status", ["completed", "confirmed"])
    // A provider is not their own client. Self-bookings are blocked at the DB
    // now, but rows created before that guard existed still sit in bookings —
    // and left in, they surface a card whose every action is either a no-op or
    // a server rejection (get_or_create_provider_conversation raises
    // self_conversation_not_allowed), plus they'd receive their own
    // announcements and rebook nudges.
    .neq("user_id", user.id)
    .order("booking_date", { ascending: false })
    // Rows here are aggregated into unique clients below, so this caps the
    // booking history scanned, not the clientele size. Ordered newest-first,
    // so a very long-running provider's oldest bookings fall outside the
    // window rather than recent clients going missing.
    .limit(CLIENTELE_BOOKING_SCAN_LIMIT);

  if (error) throw error;
  if (!data) return [];

  const map = new Map<string, import("../../types/database").ClienteleMember>();
  for (const b of data) {
    const spent = (b.base_price ?? 0) + (b.add_ons_total ?? 0);
    const existing = map.get(b.user_id);
    if (existing) {
      existing.booking_count++;
      existing.total_spent += spent;
    } else {
      map.set(b.user_id, {
        user_id: b.user_id,
        customer_name: b.customer_name ?? "Unknown",
        customer_email: b.customer_email ?? "",
        booking_count: 1,
        last_booking_date: b.booking_date,
        total_spent: spent,
      });
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => b.booking_count - a.booking_count,
  );
}

/** All bookings for a specific client with the current provider */
export async function getClientBookingHistory(
  clientUserId: string,
): Promise<import("../../types/database").DbBooking[]> {
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
    .from("bookings")
    .select("*")
    .eq("provider_id", provider.id)
    .eq("user_id", clientUserId)
    .neq("status", "on_hold")
    .order("booking_date", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export interface ClientReliabilityStats {
  noShowCount: number;
  lateCancelCount: number;
}

/** No-show / late-cancellation history for a specific client against the
 *  CALLING provider only. Reads client_provider_reliability, a counter
 *  table incremented server-side by cancel_own_booking() (late_cancel_count)
 *  and provider_update_booking_status() (no_show_count) — never written by
 *  app code (see supabase/fix_client_reliability_tracking.sql for the exact
 *  "late cancellation" definition used, and RLS scopes rows to the calling
 *  provider's own, so passing another provider's id here simply returns no
 *  row rather than leaking their data).
 *
 *  Provider id is intentionally re-derived from the authenticated caller
 *  (like getClientBookingHistory above), not trusted from a parameter,
 *  matching every other provider-scoped read in this file. */
export async function getClientReliabilityStats(
  clientUserId: string,
): Promise<ClientReliabilityStats> {
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

  if (!provider) return { noShowCount: 0, lateCancelCount: 0 };

  const { data, error } = await supabase
    .from("client_provider_reliability")
    .select("no_show_count, late_cancel_count")
    .eq("provider_id", provider.id)
    .eq("client_user_id", clientUserId)
    .maybeSingle();

  if (error) throw error;
  return {
    noShowCount: (data as any)?.no_show_count ?? 0,
    lateCancelCount: (data as any)?.late_cancel_count ?? 0,
  };
}

/** Batched reliability stats for every client in a list, scoped to the
 *  CALLING provider only — single `.in()` query, not a per-client loop (see
 *  CLAUDE.md's no-N+1 rule; this exists specifically so
 *  ProviderClienteleScreen's client list can show a reliability badge per
 *  card without one request per card). Returns a map keyed by
 *  client_user_id; clients absent from the map have no no-show/late-cancel
 *  history (zero, not missing data). */
export async function getClientReliabilityStatsBatch(
  clientUserIds: string[],
): Promise<Record<string, ClientReliabilityStats>> {
  if (clientUserIds.length === 0) return {};
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

  if (!provider) return {};

  const { data, error } = await supabase
    .from("client_provider_reliability")
    .select("client_user_id, no_show_count, late_cancel_count")
    .eq("provider_id", provider.id)
    .in("client_user_id", clientUserIds);

  if (error) throw error;

  const map: Record<string, ClientReliabilityStats> = {};
  for (const row of data ?? []) {
    map[(row as any).client_user_id] = {
      noShowCount: (row as any).no_show_count ?? 0,
      lateCancelCount: (row as any).late_cancel_count ?? 0,
    };
  }
  return map;
}

/** Send a rebook nudge notification to a specific client */
export async function sendRebookPrompt(
  userId: string,
  providerName: string,
): Promise<void> {
  await sendProviderClientNotifications({
    recipientUserIds: [userId],
    type: "booking_reminder",
    title: `${providerName} misses you!`,
    message: "It's been a while — book your next appointment now.",
    isActionable: true,
  });
}

type ProviderClientNotificationInput = {
  recipientUserIds: string[];
  type: NotificationType;
  title: string;
  message: string;
  priority?: "high" | "medium" | "low";
  isActionable?: boolean;
  bookingId?: string;
  metadata?: Record<string, unknown>;
};

/** Delivers provider-to-client notifications only after the database verifies
 * the provider owns a booking, follow, bookmark, or waitlist relationship. */
export async function sendProviderClientNotifications(
  input: ProviderClientNotificationInput,
): Promise<number> {
  const { data, error } = await supabase.rpc(
    "send_provider_client_notifications",
    {
      p_recipient_user_ids: input.recipientUserIds,
      p_type: input.type,
      p_title: input.title,
      p_message: input.message,
      p_priority: input.priority ?? "medium",
      p_is_actionable: input.isActionable ?? false,
      p_booking_id: input.bookingId ?? null,
      p_metadata: input.metadata ?? {},
    },
  );
  if (error) throw error;
  return data ?? 0;
}

/** Cap on one promotion's bell-follower fan-out, so a send can't pull an
 *  unbounded list. Far above any provider's follower count today. */
const PROMOTION_FOLLOWER_AUDIENCE_LIMIT = 5000;

/** Send in-app promotion notifications to a provider's clients */
export async function sendPromotionNotificationsToClients(
  promotion: import("../../types/database").DbPromotion,
  audience: "all" | "repeat" | "followers" | "interested",
): Promise<{ sent: number }> {
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) throw new Error("Not authenticated");

  const { data: provider } = await supabase
    .from("providers")
    .select("id, display_name")
    .eq("user_id", user.id)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!provider) throw new Error("No provider profile");

  let userIds: string[] = [];

  if (audience === "interested") {
    // This provider's own audience: bell followers, or clients who
    // previously booked THIS provider. Saving a provider is just a list and
    // isn't included. Never reaches other providers' clients, even
    // ones into the same service category — promotions stay per-provider.
    // See supabase/promotion_interest_targeting.sql for the definition.
    const { data, error } = await supabase.rpc("get_promotion_audience", {
      p_promotion_id: promotion.id,
    });
    if (error) throw error;
    userIds = (data ?? []).map((r: any) => r.user_id);
  } else if (audience === "followers") {
    // Bell followers — the bell is the switch for a provider's updates.
    const { data, error } = await supabase
      .from("provider_follows")
      .select("user_id")
      .eq("provider_id", provider.id)
      .eq("notify_enabled", true)
      .limit(PROMOTION_FOLLOWER_AUDIENCE_LIMIT);
    if (error) throw error;
    userIds = (data ?? []).map((r: { user_id: string }) => r.user_id);
  } else {
    const { data } = await supabase
      .from("bookings")
      .select("user_id")
      .eq("provider_id", provider.id)
      .in("status", ["completed", "confirmed"]);

    const rows = data ?? [];

    if (audience === "repeat") {
      const counts = new Map<string, number>();
      for (const r of rows)
        counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1);
      userIds = [...counts.entries()]
        .filter(([, n]) => n >= 2)
        .map(([id]) => id);
    } else {
      userIds = [...new Set(rows.map((r: any) => r.user_id))];
    }
  }

  if (userIds.length === 0) return { sent: 0 };

  const badge =
    promotion.discount_text ??
    (promotion.discount_percent
      ? `${promotion.discount_percent}% OFF`
      : promotion.discount_amount
        ? `£${promotion.discount_amount} OFF`
        : "Special Offer");

  const sent = await sendProviderClientNotifications({
    recipientUserIds: userIds,
    type: "promotion",
    title: `${badge} — ${provider.display_name ?? "Your provider"}`,
    message: promotion.title,
  });
  return { sent };
}

/** Send a promotion notification to a single specific client */
export async function sendPromoToClient(
  promotion: import("../../types/database").DbPromotion,
  userId: string,
): Promise<void> {
  const badge =
    promotion.discount_text ??
    (promotion.discount_percent
      ? `${promotion.discount_percent}% OFF`
      : promotion.discount_amount
        ? `£${promotion.discount_amount} OFF`
        : "Special Offer");

  const baseMsg = promotion.description ?? promotion.title;
  const message = promotion.promo_code
    ? `${baseMsg} — Use code: ${promotion.promo_code}`
    : baseMsg;

  await sendProviderClientNotifications({
    recipientUserIds: [userId],
    type: "promotion",
    title: `${badge} — ${promotion.title}`,
    message,
    isActionable: true,
    metadata: {
      promo_id: promotion.id,
      ...(promotion.promo_code ? { promo_code: promotion.promo_code } : {}),
    },
  });
}

/** Broadcast an announcement to a pre-filtered list of client user IDs */
export async function sendAnnouncement(
  title: string,
  body: string,
  clientIds: string[],
): Promise<{ sent: number }> {
  const {
    data: { user },
  } = await getSessionUser();
  if (!user) throw new Error("Not authenticated");

  const { data: provider } = await supabase
    .from("providers")
    .select("id, display_name")
    .eq("user_id", user.id)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!provider) throw new Error("No provider profile");
  if (clientIds.length === 0) return { sent: 0 };

  const providerName = (provider as any).display_name ?? "Your provider";
  // 'announcement' (not 'provider_message') — provider_message is a
  // provider-only type that NotificationsScreen hides in client mode,
  // so announcements sent under it were invisible to clients.
  const sent = await sendProviderClientNotifications({
    recipientUserIds: clientIds,
    type: "announcement",
    title: `${providerName} — ${title}`,
    message: body,
  });
  return { sent };
}

export interface AnnouncementFollower {
  userId: string;
  /** Saved you to their Your Providers list. */
  saved: boolean;
  /** Has your bell on. */
  bell: boolean;
}

/** People who saved you or have your bell on — ids only, no names. They can
 *  be sent announcements (not promotions) alongside past clients
 *  (get_my_announcement_followers, 20261118140000). */
export async function getMyAnnouncementFollowers(): Promise<AnnouncementFollower[]> {
  const { data, error } = await supabase.rpc("get_my_announcement_followers");
  if (error) throw error;
  return ((data ?? []) as { user_id: string; saved: boolean; bell: boolean }[]).map(row => ({
    userId: row.user_id,
    saved: !!row.saved,
    bell: !!row.bell,
  }));
}

/** Queues an announcement to send at a future date/time. Delivered by the
 * process_scheduled_announcements() cron job (supabase/migrations/
 * 20260815101138_scheduled_announcements.sql), not by this app, so it still
 * fires if the provider's device is offline or the app is closed. */
export async function queueScheduledAnnouncement(
  title: string,
  body: string,
  clientIds: string[],
  scheduledFor: Date,
): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc("queue_scheduled_announcement", {
    p_title: title,
    p_body: body,
    p_recipient_ids: clientIds,
    p_scheduled_for: scheduledFor.toISOString(),
  });
  if (error) throw error;
  return { id: data as string };
}

/** Cancels a not-yet-sent scheduled announcement. Returns false (not an
 * error) if it already went out. */
export async function cancelScheduledAnnouncement(
  id: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("cancel_scheduled_announcement", {
    p_id: id,
  });
  if (error) throw error;
  return data as boolean;
}

// ─────────────────────────────────────────────────────────
// SERVICES — additional queries
// ─────────────────────────────────────────────────────────

export interface RebookableService {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  categoryName: string;
  /**
   * Provider slug and display name. The cart needs BOTH: CartScreen's provider
   * logo opens the profile via providerSlug, and shows an error alert when it is
   * missing — so a rebooked cart item without a slug has an untappable logo.
   */
  providerSlug: string;
  providerDisplayName: string;
  /** Live add-ons for this service, at today's prices and extra time. */
  addOns: { id: string; name: string; price: number; extraMinutes: number }[];
}

/**
 * Re-resolve a past booking's service against live data, for "Book Again".
 *
 * Rebooking used to copy the booking's snapshot straight into the cart with a
 * synthetic id (`rebook_<timestamp>`) and the ORIGINAL price — so a client could
 * re-book a deleted service, or at a price the provider had since changed, with
 * no real service_id attached. This returns the current row so the caller can
 * rebook at today's price or explain why it isn't possible.
 *
 * Found by the booking's own `service_id` first, so a service the provider has
 * since renamed is still found. The name is the fallback, for old bookings with
 * no service link; when two active services share that name, the newest wins
 * (`.maybeSingle()` would error on two rows and read as "not available").
 *
 * Returns null when the provider is no longer live/active or the service is gone.
 * Throws on a query error, so a caller never mistakes a failed lookup for a
 * service that has gone.
 */
export async function getRebookableService(
  providerId: string,
  serviceName: string,
  serviceId?: string | null,
): Promise<RebookableService | null> {
  // has_gone_live + is_active: never let a client re-book into a provider who
  // has taken their profile down (see the client-facing query rule at the top).
  const { data: provider, error: providerError } = await supabase
    .from("providers")
    .select("id, slug, display_name")
    .eq("id", providerId)
    .eq("is_active", true)
    .eq("has_gone_live", true)
    .maybeSingle();
  if (providerError) throw providerError;
  if (!provider) return null;

  const columns =
    "id, name, price, duration_minutes, category_name, service_add_ons ( id, name, price, is_active, extra_minutes )";
  type RebookServiceRow = {
    id: string;
    name: string;
    price: number | string;
    duration_minutes: number | string;
    category_name: string;
    service_add_ons: { id: string; name: string; price: number | string; is_active: boolean; extra_minutes: number | null }[] | null;
  };
  let data: RebookServiceRow | null = null;
  if (serviceId && UUID_RE.test(serviceId)) {
    const byId = await supabase
      .from("services")
      .select(columns)
      .eq("id", serviceId)
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .maybeSingle();
    if (byId.error) throw byId.error;
    data = byId.data as RebookServiceRow | null;
  }
  if (!data && serviceName) {
    const byName = await supabase
      .from("services")
      .select(columns)
      .eq("provider_id", providerId)
      // Case-insensitive exact match: % and _ are escaped so a name is never
      // read as a pattern.
      .ilike("name", serviceName.trim().replace(/[\\%_]/g, "\\$&"))
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1);
    if (byName.error) throw byName.error;
    data = (byName.data?.[0] as RebookServiceRow | undefined) ?? null;
  }
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    price: Number(data.price),
    durationMinutes: Number(data.duration_minutes),
    categoryName: data.category_name,
    providerSlug: provider.slug,
    providerDisplayName: provider.display_name,
    addOns: (data.service_add_ons ?? [])
      .filter((a) => a.is_active)
      .map((a) => ({
        id: a.id,
        name: a.name,
        price: Number(a.price),
        extraMinutes: Number(a.extra_minutes ?? 0),
      })),
  };
}

/** Batched safety-flag lookup for checkout — one .in() query for every
 *  service in the cart, not a per-item fetch. Drives the "safety
 *  acknowledgement" gate in CartScreen: services with patch_test_required
 *  or is_pregnancy_safe=false need the client to confirm they've seen that
 *  before prepare_checkout will accept the booking (see
 *  supabase/migrations/20260817085443_safety_acknowledgement_checkout.sql). */
export async function getServiceSafetyFlags(
  serviceIds: string[],
): Promise<
  Map<string, { patchTestRequired: boolean; isPregnancySafe: boolean }>
> {
  const map = new Map<
    string,
    { patchTestRequired: boolean; isPregnancySafe: boolean }
  >();
  if (serviceIds.length === 0) return map;
  const { data, error } = await supabase
    .from("services")
    .select("id, patch_test_required, is_pregnancy_safe")
    .in("id", [...new Set(serviceIds)]);
  if (error) throw error;
  for (const row of data ?? []) {
    map.set(row.id, {
      patchTestRequired: !!row.patch_test_required,
      // Only an EXPLICIT false is "unsafe in pregnancy" — a null (never-set)
      // service is treated as safe, matching prepare_checkout's own gate
      // (`is_pregnancy_safe = false`), the profile mapper, and the
      // registration service (both `?? true`). Reading `=== true` here made
      // the cart the one surface that flagged null services nothing else
      // considers unsafe and the server never requires an ack for.
      isPregnancySafe: row.is_pregnancy_safe !== false,
    });
  }
  return map;
}

/** Length in minutes for a set of services, in one query. Used to recover the
 *  real duration of bookings written before `end_time` was populated, without
 *  a per-row lookup. Services that no longer exist are simply absent. */
export async function getServiceDurationsByIds(
  serviceIds: readonly string[],
): Promise<Map<string, number>> {
  const distinct = Array.from(new Set(serviceIds));
  if (distinct.length === 0) return new Map();
  const { data, error } = await supabase
    .from("services")
    .select("id, duration_minutes")
    .in("id", distinct);
  if (error) throw error;
  const map = new Map<string, number>();
  for (const row of (data ?? []) as {
    id: string;
    duration_minutes: number | null;
  }[]) {
    if (row.duration_minutes != null)
      map.set(row.id, Number(row.duration_minutes));
  }
  return map;
}

/** Count the number of active services for a provider — drives the setup-status indicator */
export async function countProviderServices(
  providerId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("services")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", providerId);
  if (error) throw error;
  return count ?? 0;
}

/** Every portfolio photo, venue photos included — exactly what a link-only
 *  provider's server go-live check counts. Owner reading their own rows. */
export async function countProviderPortfolioItems(
  providerId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("portfolio_items")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", providerId);
  if (error) throw error;
  return count ?? 0;
}
