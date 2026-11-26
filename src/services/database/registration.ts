// Database access: Provider registration.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import { getPaymentRequestError } from "../../utils/paymentRequestError";
import { supabase } from "../../lib/supabase";
import type { DbBooking, DbProvider, DbProviderAddOn, ProviderAddOnAppliesTo } from "../../types/database";
import { PAYOUT_INTERVALS, type PayoutSchedule, type PayoutScheduleChoice } from "../../constants/payoutSchedule";
import { type BankDisputeState, type BankDisputeStateRow, bankDisputeStates } from "../../features/payments/bankDisputeStatus";
import type { ProviderBookingTip } from "../../features/provider-bookings/tipPresentation";
import { getSessionUser, invalidateOwnProviderIds } from "./account";
import type { BookingFeeCharge, BookingFeeKind } from "./edgeFunctions";

// ── Provider registration persistence ──────────────────────────────────────

export async function uploadPublicStorageObject(
  bucket: string,
  storagePath: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, bytes, { contentType, upsert: true });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
}

export async function removeStorageObjects(bucket: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error) throw error;
}

/**
 * Object paths directly under one user's folder in `bucket`, e.g.
 * `<userId>/photo.jpg`. Deliberately NOT recursive: Supabase's list() returns
 * only immediate children, and sub-folders come back as pseudo-entries with a
 * null id. Those are filtered out rather than followed, so a caller deleting
 * what this returns can never walk into a nested legacy folder it didn't mean
 * to touch.
 */
export async function listUserStorageObjectPaths(
  bucket: string,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase.storage.from(bucket).list(userId, {
    limit: 1000,
  });
  if (error) throw error;
  return (data ?? [])
    .filter(entry => entry.id !== null)
    .map(entry => `${userId}/${entry.name}`);
}

export async function getProviderLogoUrlByUserId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("providers")
    .select("logo_url")
    .eq("user_id", userId)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.logo_url ?? null;
}

export async function getProviderRegistrationCore(userId: string): Promise<{
  id: string;
  automation_settings: DbProvider["automation_settings"];
} | null> {
  const { data, error } = await supabase
    .from("providers")
    .select("id, automation_settings")
    .eq("user_id", userId)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; automation_settings: DbProvider["automation_settings"] } | null;
}

export async function updateProviderRegistrationRow(
  providerId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("providers").update(payload).eq("id", providerId);
  if (error) throw error;
}

export async function providerSlugExists(slug: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("providers")
    .select("id")
    .eq("slug", slug)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

export async function insertProviderRegistrationRow(
  payload: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await supabase
    .from("providers")
    .insert(payload as never)
    .select("id")
    .single();
  if (error) throw error;
  // A brand-new provider row the memoised ownership answer predates.
  invalidateOwnProviderIds();
  return data.id;
}

export async function promoteUserToProvider(userId: string): Promise<void> {
  const { error } = await supabase.from("users").update({ role: "provider" }).eq("id", userId);
  if (error) throw error;
}

export async function replaceProviderServiceCatalog(
  providerId: string,
  services: Record<string, unknown>[],
): Promise<void> {
  const { error } = await supabase.rpc("replace_provider_services", {
    p_provider_id: providerId,
    p_services: services,
  });
  if (error) throw error;
}

/** Where each of a provider's services sits in their menu, so a save can
 *  match the services it just created (which had no id yet) back to their
 *  new ids by category and position. The provider's own rows, so no
 *  has_gone_live filter: this runs before a new provider has gone live. */
export async function getProviderServicePositions(
  providerId: string,
): Promise<{ id: string; category_name: string; sort_order: number }[]> {
  const { data, error } = await supabase
    .from("services")
    .select("id, category_name, sort_order")
    .eq("provider_id", providerId)
    .limit(500);
  if (error) throw error;
  return (data ?? []) as { id: string; category_name: string; sort_order: number }[];
}

/** Read back the fields needed to confirm a full profile publish actually
 * stored the descriptions the editor submitted. */
export async function getProviderServiceDescriptionSnapshots(
  providerId: string,
): Promise<{ id: string; category_name: string; sort_order: number; description: string | null }[]> {
  const { data, error } = await supabase
    .from('services')
    .select('id, category_name, sort_order, description')
    .eq('provider_id', providerId)
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as { id: string; category_name: string; sort_order: number; description: string | null }[];
}

/** The provider's own add-on list (universal add-ons), for editing. Owner
 *  read only (RLS), so no has_gone_live filter: a provider edits their list
 *  before going live. */
export async function getMyProviderAddOns(providerId: string): Promise<DbProviderAddOn[]> {
  const { data, error } = await supabase
    .from("provider_add_ons")
    .select(
      "id, provider_id, name, price, description, extra_minutes, is_active, applies_to, category_names, included_service_ids, excluded_service_ids, sort_order",
    )
    .eq("provider_id", providerId)
    .order("sort_order", { ascending: true })
    .limit(50);
  if (error) throw error;
  return ((data ?? []) as DbProviderAddOn[]).map(row => ({
    ...row,
    price: Number(row.price),
    extra_minutes: Number(row.extra_minutes ?? 0),
    category_names: row.category_names ?? [],
    included_service_ids: row.included_service_ids ?? [],
    excluded_service_ids: row.excluded_service_ids ?? [],
  }));
}

export interface ProviderAddOnSaveItem {
  /** The saved id, or null for an add-on made in this editing session. */
  id: string | null;
  /** The app's own key for this item, echoed back with its saved id. */
  client_key: string;
  name: string;
  price: number;
  description: string | null;
  extra_minutes: number;
  is_active: boolean;
  applies_to: ProviderAddOnAppliesTo;
  category_names: string[];
  included_service_ids: string[];
  excluded_service_ids: string[];
}

/** Saves the provider's whole add-on list (replace_provider_add_ons): rows
 *  left out are deleted, and every service's add-ons are re-derived in the
 *  same transaction. Returns each item's client_key with its saved id. */
export async function replaceProviderAddOns(
  providerId: string,
  addOns: ProviderAddOnSaveItem[],
): Promise<{ client_key: string; add_on_id: string }[]> {
  const { data, error } = await supabase.rpc("replace_provider_add_ons", {
    p_provider_id: providerId,
    p_add_ons: addOns,
  });
  if (error) throw error;
  return (data ?? []) as { client_key: string; add_on_id: string }[];
}

/**
 * The provider row a user owns, for the registration/business-profile screens.
 *
 * The ordering is load-bearing, not decoration. This used to be a bare
 * .maybeSingle() on user_id, which does not pick a row when there is more than
 * one — it errors. Duplicate provider rows exist in this database (see
 * getProviderProfileForUserId), and loadProviderFromSupabase catches that error
 * by falling back to the device-local AsyncStorage cache. Two devices therefore
 * fell back to two independently-written local snapshots and showed two
 * different logos for the same business, indefinitely and across reloads,
 * because nothing ever re-read the server successfully.
 *
 * Every "which provider row is mine" lookup in this file now orders the same
 * way — active first, then the oldest (the original) — so they cannot disagree
 * about which row is the provider's real profile.
 */
export async function getProviderRegistrationRecord(userId: string): Promise<DbProvider | null> {
  const { data, error } = await supabase
    .from("providers")
    .select("*")
    .eq("user_id", userId)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getProviderRegistrationDetails(providerId: string): Promise<{
  fullAddress: string;
  howToGetThere: string;
  services: unknown[];
}> {
  const [privateDetails, services] = await Promise.all([
    supabase
      .from("provider_private_details")
      .select("full_address, how_to_get_there")
      .eq("provider_id", providerId)
      .maybeSingle(),
    supabase
      .from("services")
      .select(`
        id,
        service_category,
        category_name,
        category_description,
        name,
        description,
        price,
        duration_minutes,
        buffer_before_mins,
        buffer_after_mins,
        sort_order,
        tags,
        technique_tags,
        outcome_tags,
        occasion_tags,
        trend_names,
        is_pregnancy_safe,
        patch_test_required,
        min_age,
        contraindications,
        aftercare_notes,
        service_type,
        hair_types_suitable, skin_tones_suitable,
        audience,
        service_images ( url, sort_order, fit ),
        service_add_ons ( name, price )
      `)
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .order("sort_order"),
  ]);
  if (privateDetails.error) throw privateDetails.error;
  if (services.error) throw services.error;
  return {
    fullAddress: privateDetails.data?.full_address ?? "",
    howToGetThere: privateDetails.data?.how_to_get_there ?? "",
    services: services.data ?? [],
  };
}

export async function saveProviderBookingPolicies(
  userId: string,
  policies: Record<string, unknown>,
): Promise<boolean> {
  const { data, error: selectError } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", userId)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (selectError) throw selectError;
  if (!data) return false;
  const { error } = await supabase
    .from("providers")
    .update({ booking_policies: policies })
    .eq("id", data.id);
  if (error) throw error;
  return true;
}

export async function getProviderBookingPolicies(
  userId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("providers")
    .select("booking_policies")
    .eq("user_id", userId)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.booking_policies as Record<string, unknown> | null) ?? null;
}


export interface ConnectStatus {
  connected: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue?: number;
  /** Where payouts land — bank name and last four only, never the full number. */
  bankAccount?: { bankName: string | null; last4: string } | null;
}
export interface ProviderFinance {
  connected: boolean;
  livemode: boolean;
  available: { amount: number; currency: string }[];
  pending: { amount: number; currency: string }[];
  payouts: { id: string; amount: number; currency: string; status: string; arrivalDate: number; created: number; automatic: boolean }[];
  hasMore: boolean;
}
export async function getProviderFinance(cursor?: string): Promise<ProviderFinance> {
  const { data, error } = await supabase.functions.invoke('create-connect-account', { body: { action: 'finance', ...(cursor ? { cursor } : {}) } });
  if (error || !data || !Array.isArray(data.available) || !Array.isArray(data.pending) || !Array.isArray(data.payouts)) {
    throw new Error('Could not load your balances and bank payouts.');
  }
  return data;
}
export interface ProviderPayout {
  id: string;
  booking_id: string;
  payout_amount: number;
  gross_amount: number;
  /** `status` and `group_booking_id` let the refund sheet offer "Cancel
   *  appointment too" on a booking that's still upcoming or pending. */
  booking?: {
    service_name_snapshot: string | null; customer_name: string | null; booking_date: string;
    /** Start and end time of day, shown on the payment's timeline. */
    booking_time?: string | null; end_time?: string | null;
    status: DbBooking['status']; group_booking_id: string | null;
  } | undefined;
  platform_fee: number;
  currency: string;
  status: 'held' | 'transferred' | 'failed' | 'cancelled' | 'reversed';
  release_after: string;
  created_at: string;
  /** The client has a refund request open on this booking, so a held payout
   *  waits for it (release-payouts skips it until the request closes). */
  refundRequestOpen: boolean;
  /** Where a bank dispute on this booking's payment stands; null if none. */
  bankDispute: BankDisputeState | null;
}

async function connectAction(action: 'status' | 'onboard' | 'dashboard') {
  const { data, error } = await supabase.functions.invoke('create-connect-account', { body: { action } });
  if (error || data?.error) throw await getPaymentRequestError(error, data, 'Could not connect to Stripe. Please try again.');
  return data;
}
export async function getConnectStatus(): Promise<ConnectStatus> {
  const data = await connectAction('status');
  if (typeof data?.connected !== 'boolean' || typeof data?.payoutsEnabled !== 'boolean') {
    throw new Error('Could not load your Stripe account status.');
  }
  return data;
}
export async function getConnectLink(action: 'onboard' | 'dashboard'): Promise<string> {
  const data = await connectAction(action);
  const url = new URL(data?.url);
  if (url.protocol !== 'https:' || !(url.hostname === 'stripe.com' || url.hostname.endsWith('.stripe.com'))) {
    throw new Error('Stripe returned an invalid account link.');
  }
  return url.toString();
}
export async function getProviderPayouts(): Promise<ProviderPayout[]> {
  // Payouts re-confirm the account with the Auth server rather than trusting
  // the stored session, so a just-banned or deleted account is refused here
  // immediately instead of when its access token expires.
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Please sign in again.');
  const { data: provider, error: providerError } = await supabase.from('providers')
    .select('id').eq('user_id', user.id).single();
  if (providerError) throw providerError;
  const { data, error } = await supabase.from('provider_payouts')
    .select('id, booking_id, payout_amount, gross_amount, platform_fee, currency, status, release_after, created_at')
    .eq('provider_id', provider.id).order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  if (!data?.length) return [];
  const bookingIds = data.map(row => row.booking_id);
  const [{ data: bookings, error: bookingsError }, { data: openRequests, error: requestsError }, disputes] = await Promise.all([
    supabase.from('bookings')
      .select('id, service_name_snapshot, customer_name, booking_date, booking_time, end_time, status, group_booking_id')
      .eq('provider_id', provider.id).in('id', bookingIds),
    // At most one open request per booking, so the cap matches the payouts'.
    supabase.from('refund_requests')
      .select('booking_id')
      .eq('provider_id', provider.id).in('booking_id', bookingIds)
      .in('status', ['with_provider', 'under_review'])
      .limit(50),
    getOwnBankDisputeStates(bookingIds),
  ]);
  if (bookingsError) throw bookingsError;
  if (requestsError) throw requestsError;
  const open = new Set((openRequests ?? []).map(r => r.booking_id));
  return data.map(row => ({
    ...row,
    booking: bookings?.find(booking => booking.id === row.booking_id),
    refundRequestOpen: open.has(row.booking_id),
    bankDispute: disputes.byBooking.get(row.booking_id) ?? null,
  }));
}

interface BankDisputeStateDbRow {
  booking_id: string; fee_charge_id: string | null; role: BankDisputeStateRow['role'];
  closed: boolean; outcome: BankDisputeStateRow['outcome']; paid_back_pence: number;
}

/** Bank-dispute state of the caller's own bookings and their late/no-show fees
 *  (provider reading their own record: the RPC filters to their bookings). */
async function getOwnBankDisputeStates(bookingIds: string[]): Promise<ReturnType<typeof bankDisputeStates>> {
  if (bookingIds.length === 0) return bankDisputeStates([]);
  const { data, error } = await supabase.rpc('provider_bank_dispute_states', { p_booking_ids: bookingIds });
  if (error) throw error;
  return bankDisputeStates(((data ?? []) as BankDisputeStateDbRow[]).map(row => ({
    bookingId: row.booking_id,
    feeChargeId: row.fee_charge_id,
    role: row.role,
    closed: row.closed,
    outcome: row.outcome,
    paidBackPence: Number(row.paid_back_pence),
  })));
}

/**
 * The provider's own payout for one booking, in pence, while it's still held
 * (provider reading their own record). null once it's released, cancelled or
 * returned, or when the booking has no payout row.
 */
export async function getHeldPayoutPence(bookingId: string): Promise<number | null> {
  const { data, error } = await supabase.from('provider_payouts')
    .select('status, payout_amount').eq('booking_id', bookingId).maybeSingle();
  if (error) throw error;
  return data?.status === 'held' ? Number(data.payout_amount) : null;
}

function readPayoutSchedule(value: unknown): PayoutSchedule | null {
  if (value === null) return null;
  const raw = value as Partial<PayoutSchedule> | undefined;
  const interval = raw?.interval;
  if (!interval || !([...PAYOUT_INTERVALS, 'manual', 'unknown'] as string[]).includes(interval)) {
    throw new Error('Your payout schedule could not be read.');
  }
  return {
    interval,
    weeklyDays: Array.isArray(raw.weeklyDays) ? raw.weeklyDays.filter((d): d is string => typeof d === 'string') : [],
    monthlyDays: Array.isArray(raw.monthlyDays) ? raw.monthlyDays.filter((d): d is number => typeof d === 'number') : [],
  };
}

/**
 * How often Stripe pays the provider's balance into their bank, read from
 * Stripe (the only copy). null when they haven't set up Stripe yet, so there
 * is no schedule to choose.
 */
export async function getPayoutSchedule(): Promise<PayoutSchedule | null> {
  const { data, error } = await supabase.functions.invoke('create-connect-account', { body: { action: 'payout_schedule' } });
  if (error || data?.error) throw await getPaymentRequestError(error, data, 'Your payout schedule could not load. Refresh to try again.');
  return readPayoutSchedule(data?.schedule);
}

/** Sets how often Stripe pays the provider's bank, and returns what Stripe now has. */
export async function setPayoutSchedule(choice: PayoutScheduleChoice): Promise<PayoutSchedule> {
  const { data, error } = await supabase.functions.invoke('create-connect-account', { body: { action: 'set_payout_schedule', schedule: choice } });
  if (error || data?.error) throw await getPaymentRequestError(error, data, 'Your payout schedule was not changed. Please try again.');
  const schedule = readPayoutSchedule(data?.schedule);
  if (!schedule) throw new Error('Your payout schedule could not be confirmed. Refresh to check it.');
  return schedule;
}

/** A late/no-show fee this provider charged, with their share after Stripe's card fee. */
export interface ProviderFeeEarning {
  id: string;
  bookingId: string;
  kind: BookingFeeKind;
  amountPence: number;
  payoutPence: number | null;
  status: BookingFeeCharge['status'];
  payoutStatus: 'pending' | 'held' | 'transferred' | 'cancelled' | 'reversed' | 'failed';
  releaseAfter: string | null;
  chargedAt: string | null;
  openDispute: boolean;
  /** Where a bank dispute on this fee's payment stands; null if none. */
  bankDispute: BankDisputeState | null;
  serviceName: string | null;
  customerName: string | null;
}

interface ProviderFeeEarningRow {
  id: string; booking_id: string; kind: BookingFeeKind; amount_pence: number; payout_pence: number | null;
  status: BookingFeeCharge['status']; payout_status: ProviderFeeEarning['payoutStatus'];
  release_after: string | null; charged_at: string | null; disputed_at: string | null; dispute_resolved_at: string | null;
}

export interface ProviderTipEarning extends ProviderBookingTip {
  id: string;
  bookingId: string;
  paidAt: string | null;
  serviceName: string | null;
  customerName: string | null;
}

/**
 * Latest 50 tips clients paid this provider. Filtered to the caller's OWN
 * provider row, not just RLS: booking_tips is also readable by the client who
 * paid, so a pro who has tipped someone else would otherwise see that tip here.
 */
export async function getProviderTipEarnings(): Promise<ProviderTipEarning[]> {
  const { data: { user }, error: authError } = await getSessionUser();
  if (authError) throw authError;
  if (!user) return [];
  const { data, error } = await supabase.from('booking_tips')
    .select('id, booking_id, amount_pence, payout_pence, payout_status, release_after, paid_at, providers!inner(user_id)')
    .eq('providers.user_id', user.id)
    .eq('status', 'succeeded')
    .order('paid_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  const rows = (data ?? []) as unknown as {
    id: string; booking_id: string; amount_pence: number; payout_pence: number | null;
    payout_status: ProviderBookingTip['payoutStatus']; release_after: string | null; paid_at: string | null;
  }[];
  if (rows.length === 0) return [];
  const { data: bookings, error: bookingsError } = await supabase.from('bookings')
    .select('id, service_name_snapshot, customer_name')
    .in('id', rows.map(row => row.booking_id));
  if (bookingsError) throw bookingsError;
  return rows.map(row => {
    const booking = bookings?.find(b => b.id === row.booking_id);
    return {
      id: row.id,
      bookingId: row.booking_id,
      amountPence: row.amount_pence,
      payoutPence: row.payout_pence,
      payoutStatus: row.payout_status,
      releaseAfter: row.release_after,
      paidAt: row.paid_at,
      serviceName: booking?.service_name_snapshot ?? null,
      customerName: booking?.customer_name ?? null,
    };
  });
}

/**
 * Paid tips on the caller's own bookings, in pounds keyed by booking id, for
 * Analytics. `sinceDate` (YYYY-MM-DD) bounds it by appointment date to match
 * the bookings Analytics loaded; null = all time. Filtered to the caller's own
 * provider row because booking_tips is also readable by the client who paid.
 */
export async function getProviderTipsByBooking(sinceDate: string | null): Promise<Map<string, number>> {
  const { data: { user }, error: authError } = await getSessionUser();
  if (authError) throw authError;
  if (!user) return new Map();
  let query = supabase.from('booking_tips')
    .select('booking_id, amount_pence, providers!inner(user_id), bookings!inner(booking_date)')
    .eq('providers.user_id', user.id)
    .eq('status', 'succeeded');
  if (sinceDate) query = query.gte('bookings.booking_date', sinceDate);
  // One tip per booking, so this matches the bookings Analytics can hold.
  const { data, error } = await query.limit(5000);
  if (error) throw error;
  const rows = (data ?? []) as unknown as { booking_id: string; amount_pence: number }[];
  return new Map(rows.map(row => [row.booking_id, row.amount_pence / 100]));
}

/** Latest 50 charged fees (RLS scopes booking_fee_charges to the caller's own). */
export async function getProviderFeeEarnings(): Promise<ProviderFeeEarning[]> {
  const { data, error } = await supabase.from('booking_fee_charges')
    .select('id, booking_id, kind, amount_pence, payout_pence, status, payout_status, release_after, charged_at, disputed_at, dispute_resolved_at')
    .in('status', ['succeeded', 'refunded'])
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  const rows = (data ?? []) as ProviderFeeEarningRow[];
  if (rows.length === 0) return [];
  const bookingIds = [...new Set(rows.map(row => row.booking_id))];
  const [{ data: bookings, error: bookingsError }, disputes] = await Promise.all([
    supabase.from('bookings')
      .select('id, service_name_snapshot, customer_name')
      .in('id', bookingIds),
    getOwnBankDisputeStates(bookingIds),
  ]);
  if (bookingsError) throw bookingsError;
  return rows.map(row => {
    const booking = bookings?.find(b => b.id === row.booking_id);
    return {
      id: row.id,
      bookingId: row.booking_id,
      kind: row.kind,
      amountPence: row.amount_pence,
      payoutPence: row.payout_pence,
      status: row.status,
      payoutStatus: row.payout_status,
      releaseAfter: row.release_after,
      chargedAt: row.charged_at,
      openDispute: !!row.disputed_at && !row.dispute_resolved_at,
      bankDispute: disputes.byFee.get(row.id) ?? null,
      serviceName: booking?.service_name_snapshot ?? null,
      customerName: booking?.customer_name ?? null,
    };
  });
}

export interface RefundRequestInput {
  bookingId: string;
  reason: string;
  /** Omit for a full refund (fee included). Otherwise pence out of the provider's share. */
  amountPence?: number;
  /** One per refund attempt, so a retry can never refund twice. */
  requestId: string;
}

export async function refundProviderBooking(input: RefundRequestInput): Promise<boolean> {
  // `reason` is recorded on the Stripe refund's metadata (see the refund-payment
  // edge function) so a refund can be traced back to why it was issued —
  // cancellation, dispute, service issue — especially on completed bookings.
  const { data, error } = await supabase.functions.invoke('refund-payment', {
    body: { bookingId: input.bookingId, reason: input.reason, amountPence: input.amountPence ?? null, requestId: input.requestId },
  });
  if (error) {
    // refund-payment's 409 bodies are written for the provider ("You can
    // refund at most £20.00."), so lift them out. A 5xx body is not shown.
    const res = (error as { context?: Response }).context;
    if (res && res.status >= 400 && res.status < 500) {
      const body = await res.json().catch(() => null) as { error?: unknown } | null;
      if (typeof body?.error === 'string' && body.error) throw new Error(body.error);
    }
    throw new Error('The refund could not be confirmed. Refresh before trying again.');
  }
  if (data?.error || !['refunded', 'already_refunded', 'pending', 'requires_action'].includes(data?.status)) {
    throw new Error('The refund could not be confirmed. Refresh before trying again.');
  }
  return data?.status === 'refunded' || data?.status === 'already_refunded';
}
