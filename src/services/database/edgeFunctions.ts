// Database access: Edge function calls (payments, emails, claims) and saved cards.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import { getPaymentRequestError } from "../../utils/paymentRequestError";
import { supabase } from "../../lib/supabase";
import { invalidateOwnProviderIds } from "./account";
import { getMyProviderProfile } from "./providers";

// ── Edge Function and claim adapters ───────────────────────────────────────
// These small, typed adapters keep the shared Supabase client out of feature
// services. Feature services remain responsible for their UX fallback policy.

export async function requestProviderClaimVerification(
  providerId: string,
): Promise<{ maskedEmail: string }> {
  const { data, error } = await supabase.functions.invoke('request-claim-verification', {
    body: { providerId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  if (typeof data?.maskedEmail !== 'string') throw new Error('Invalid verification response.');
  return { maskedEmail: data.maskedEmail };
}

export async function claimUnclaimedProviderProfile(
  providerId: string,
  code: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('claim_provider_profile', {
    p_provider_id: providerId,
    p_claim_token: code,
  });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('Invalid claim response.');
  // Claiming attaches an existing row to this account — same ownership
  // change as creating one, so the memoised answer has to go.
  invalidateOwnProviderIds();
  return data;
}

export type AccountEmailKind =
  | 'client_welcome'
  | 'provider_welcome'
  | 'password_changed'
  | 'provider_hat_added'
  | 'client_hat_added'
  /** The brand email — what CERVICED is and offers. Not tied to an event. */
  | 'general_welcome';

/**
 * Sends the signed-in user an account email (a welcome, or a password-changed
 * notice). The caller names only WHICH one it is — the template, the
 * recipient and the name on it are all resolved server-side, so nothing about
 * our outgoing mail is decided on the device. See
 * supabase/functions/send-account-email/index.ts.
 *
 * There is deliberately no generic "send this html to this address" function
 * any more: that was an open relay on the cerviced.co sending domain.
 */
export async function invokeSendAccountEmail(
  kind: AccountEmailKind,
): Promise<string | undefined> {
  const { data, error } = await supabase.functions.invoke('send-account-email', {
    body: { kind },
  });
  if (error) throw error;
  // The address the server actually sent to — always one of the caller's own.
  // Undefined against an older deployment that didn't return it yet.
  return (data as { to?: string } | null)?.to;
}

export interface SupportRequestInput {
  category: string;
  description: string;
  platform: string;
  appVersion: string;
  activeMode: string;
  /** Set for a refund request: the ticket is linked to it and the provider
   *  is emailed (see send-support-request). */
  refundRequestId?: string;
}

export interface SupportRequestResult {
  /** Human-quotable reference, e.g. 1042 — shown to the reporter as "#1042". */
  ticketNumber: number;
  /** False when the report was stored but the support email didn't go out. */
  notified: boolean;
}

/**
 * Files the in-app "Report a Problem" form. The report is stored as a
 * support_requests row server-side and the support inbox is notified of it;
 * the recipient is hardcoded and the reporter's identity, hat and business
 * name are all read server-side, never taken from this payload — see
 * supabase/functions/send-support-request/index.ts.
 *
 * `notified: false` means the row was saved but the email failed. That is a
 * delivery problem, not a lost report, so callers should not present it as a
 * failure to the reporter.
 */
export async function invokeSendSupportRequest(
  input: SupportRequestInput,
): Promise<SupportRequestResult> {
  const { data, error } = await supabase.functions.invoke('send-support-request', {
    body: input,
  });

  if (error) {
    // The function's 4xx bodies are written for people to read ("You've sent a
    // lot of reports in the last hour…"). supabase-js hides the response body
    // behind a generic FunctionsHttpError, so lift it out — but only for 4xx.
    // A 5xx body can carry a raw upstream error, which must not reach a user.
    const res = (error as { context?: Response }).context;
    if (res && res.status >= 400 && res.status < 500) {
      const body = await res.json().catch(() => null) as { error?: unknown } | null;
      if (typeof body?.error === 'string' && body.error) throw new Error(body.error);
    }
    throw error;
  }

  const result = data as { ticketNumber?: unknown; notified?: unknown } | null;
  if (typeof result?.ticketNumber !== 'number') {
    throw new Error('Support request returned no ticket number.');
  }
  return { ticketNumber: result.ticketNumber, notified: result.notified !== false };
}

export interface PostcodeLookupAddressRow {
  address: string;
  id?: string;
  latitude?: number;
  longitude?: number;
}

export async function lookupPostcodeAddresses(postcode: string): Promise<PostcodeLookupAddressRow[]> {
  const { data, error } = await supabase.functions.invoke('find-address-by-postcode', {
    body: { postcode },
  });
  if (error) throw error;
  if (!Array.isArray(data?.addresses)) throw new Error('Invalid address lookup response.');
  return data.addresses as PostcodeLookupAddressRow[];
}

export async function lookupPostcodeAddress(addressId: string): Promise<PostcodeLookupAddressRow> {
  const { data, error } = await supabase.functions.invoke('find-address-by-postcode', {
    body: { addressId },
  });
  if (error) throw error;
  const address = data?.address;
  if (
    !address || typeof address.formatted !== 'string'
    || typeof address.latitude !== 'number' || typeof address.longitude !== 'number'
  ) {
    throw new Error('Invalid address detail response.');
  }
  return {
    address: address.formatted,
    latitude: address.latitude,
    longitude: address.longitude,
  };
}

export async function createCheckoutPaymentIntent(
  checkoutBatchId: string,
  currency: string,
): Promise<{
  clientSecret: string;
  paymentIntentId: string;
  // The client's Stripe Customer + a short-lived ephemeral key, so the Payment
  // Sheet can list their saved cards and offer to save a new one. Undefined
  // only from an older deployed function; the sheet then works without them.
  customerId?: string;
  ephemeralKeySecret?: string;
  /** The server allows PayPal on this intent (never with late/no-show fees). */
  paypalAvailable: boolean;
}> {
  const { data, error } = await supabase.functions.invoke('create-payment-intent', {
    body: { checkoutBatchId, currency },
  });
  if (error || data?.error) throw await getPaymentRequestError(error, data, 'Payment could not be started. Please try again.');
  if (typeof data?.clientSecret !== 'string' || typeof data?.paymentIntentId !== 'string') {
    throw new Error('Payment could not be started. Please try again.');
  }
  const expectsLive = process.env['EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY']?.startsWith('pk_live_') === true;
  if (typeof data.livemode !== 'boolean' || data.livemode !== expectsLive) {
    throw new Error('Payment configuration does not match this app. Please contact support.');
  }
  // The server decides (never for a checkout with late/no-show fees); an older
  // deployment that doesn't send the list means no PayPal.
  const paypalAvailable = Array.isArray(data.paymentMethodTypes) && data.paymentMethodTypes.includes('paypal');
  return {
    clientSecret: data.clientSecret,
    paymentIntentId: data.paymentIntentId,
    paypalAvailable,
    customerId: typeof data.customerId === 'string' ? data.customerId : undefined,
    ephemeralKeySecret: typeof data.ephemeralKeySecret === 'string' ? data.ephemeralKeySecret : undefined,
  };
}

/** A provider's late-arrival, no-show and late cancellation fees for one
 *  checkout, frozen on the held bookings by the database — what the client is
 *  agreeing to. */
export interface CheckoutFee {
  providerId: string;
  providerName: string;
  lateFeePence: number | null;
  noShowFeePence: number | null;
  graceMinutes: number;
  /** The most they could be charged on top of a kept deposit after a late cancel. */
  lateCancelFeePence: number | null;
  /** The deposit that charge sits on top of. */
  lateCancelDepositPence: number | null;
  /** The provider's notice period for cancelling, in hours. */
  cancelNoticeHours: number;
}

interface CheckoutFeeRow {
  provider_id: string;
  provider_name: string | null;
  late_fee_pence: number | null;
  no_show_fee_pence: number | null;
  grace_minutes: number | null;
  late_cancel_fee_pence?: number | null;
  late_cancel_deposit_pence?: number | null;
  cancel_notice_hours?: number | null;
}

export async function getCheckoutFees(checkoutBatchId: string): Promise<CheckoutFee[]> {
  const { data, error } = await supabase.rpc('get_checkout_fees', { p_checkout_batch_id: checkoutBatchId });
  if (error) throw error;
  return ((data ?? []) as CheckoutFeeRow[]).map(row => ({
    providerId: row.provider_id,
    providerName: row.provider_name?.trim() || 'This provider',
    lateFeePence: row.late_fee_pence,
    noShowFeePence: row.no_show_fee_pence,
    graceMinutes: row.grace_minutes ?? 0,
    lateCancelFeePence: row.late_cancel_fee_pence ?? null,
    lateCancelDepositPence: row.late_cancel_deposit_pence ?? null,
    cancelNoticeHours: row.cancel_notice_hours ?? 0,
  }));
}

/** What the client agreed to, so the database can keep a full record of it. */
export interface FeeConsentAgreement {
  termsVersion: string;
  termsSha256: string;
  appPlatform: string | null;
  appVersion: string | null;
}

/** Records the client's agreement to those fees: a fee_consent_records row
 *  with the database clock, the wording version and the frozen amounts. The
 *  payment functions refuse to save a card for fees, or charge one, without
 *  it. Returns the record's id. */
export async function acceptCheckoutFees(
  checkoutBatchId: string,
  agreement: FeeConsentAgreement,
): Promise<string> {
  const { data, error } = await supabase.rpc('accept_checkout_fees', {
    p_checkout_batch_id: checkoutBatchId,
    p_terms_version: agreement.termsVersion,
    p_terms_sha256: agreement.termsSha256,
    p_app_platform: agreement.appPlatform,
    p_app_version: agreement.appVersion,
  });
  if (error) throw error;
  return data as string;
}

export type BookingFeeKind = 'late' | 'no_show' | 'late_cancel';

/** One late/no-show/late cancellation fee attempt on a booking, as either party may read it (RLS). */
export interface BookingFeeCharge {
  id: string;
  kind: BookingFeeKind;
  amountPence: number;
  status: 'processing' | 'awaiting_client' | 'succeeded' | 'failed' | 'refunded';
  chargedAt: string | null;
  /** While awaiting_client: when the client's request to pay lapses. */
  payBy: string | null;
  /** While awaiting_client: when the saved card is next tried again, if it will be. */
  nextRetryAt: string | null;
  createdAt: string;
  disputedAt: string | null;
  disputeReason: string | null;
  disputeOutcome: 'refunded' | 'kept' | null;
  disputeResponse: string | null;
  disputeResolvedAt: string | null;
}

interface BookingFeeChargeRow {
  id: string;
  kind: BookingFeeKind;
  amount_pence: number;
  status: BookingFeeCharge['status'];
  charged_at: string | null;
  pay_by: string | null;
  next_retry_at: string | null;
  created_at: string;
  disputed_at: string | null;
  dispute_reason: string | null;
  dispute_outcome: BookingFeeCharge['disputeOutcome'];
  dispute_response: string | null;
  dispute_resolved_at: string | null;
}

/** Newest first. A booking has at most one live fee plus any failed attempts. */
export async function getBookingFeeCharges(bookingId: string): Promise<BookingFeeCharge[]> {
  const { data, error } = await supabase.from('booking_fee_charges')
    .select('id, kind, amount_pence, status, charged_at, pay_by, next_retry_at, created_at, disputed_at, dispute_reason, dispute_outcome, dispute_response, dispute_resolved_at')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return ((data ?? []) as BookingFeeChargeRow[]).map(row => ({
    id: row.id,
    kind: row.kind,
    amountPence: row.amount_pence,
    status: row.status,
    chargedAt: row.charged_at,
    payBy: row.pay_by,
    nextRetryAt: row.next_retry_at,
    createdAt: row.created_at,
    disputedAt: row.disputed_at,
    disputeReason: row.dispute_reason,
    disputeOutcome: row.dispute_outcome,
    disputeResponse: row.dispute_response,
    disputeResolvedAt: row.dispute_resolved_at,
  }));
}

/** The fees a client agreed to on a booking, and its timing — the provider's
 *  own booking only (bookings RLS). */
export interface BookingFeeTerms {
  status: string;
  bookingDate: string;
  bookingTime: string;
  endTime: string | null;
  lateFeePence: number | null;
  noShowFeePence: number | null;
  lateCancelFeePence: number | null;
  /** The deposit the client paid, in pence; 0 when they paid in full. */
  depositPence: number;
  paymentStatus: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  /** When the provider accepted it; null for a request that was never accepted. */
  confirmedAt: string | null;
  /** The notice period frozen on the booking, in hours. */
  cancelNoticeHours: number;
  lateRescheduleFrom: string | null;
  /** cancelPenalty from the policy frozen on the booking. */
  cancelPenalty: string | null;
}

interface BookingFeeTermsRow {
  status: string;
  booking_date: string;
  booking_time: string;
  end_time: string | null;
  late_fee_pence: number | null;
  no_show_fee_pence: number | null;
  late_cancel_fee_pence: number | null;
  deposit_amount: number | string | null;
  payment_status: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  confirmed_at: string | null;
  cancel_notice_hours: number | null;
  late_reschedule_from: string | null;
  policy_snapshot: Record<string, unknown> | null;
}

const BOOKING_FEE_TERMS_COLUMNS = 'status, booking_date, booking_time, end_time, late_fee_pence, no_show_fee_pence, late_cancel_fee_pence, deposit_amount, payment_status, cancelled_by, cancelled_at, confirmed_at, cancel_notice_hours, late_reschedule_from, policy_snapshot';

function mapBookingFeeTerms(row: BookingFeeTermsRow): BookingFeeTerms {
  return {
    status: row.status,
    bookingDate: row.booking_date,
    bookingTime: row.booking_time,
    endTime: row.end_time,
    lateFeePence: row.late_fee_pence,
    noShowFeePence: row.no_show_fee_pence,
    lateCancelFeePence: row.late_cancel_fee_pence,
    depositPence: Math.round(Number(row.deposit_amount ?? 0) * 100),
    paymentStatus: row.payment_status,
    cancelledBy: row.cancelled_by,
    cancelledAt: row.cancelled_at,
    confirmedAt: row.confirmed_at,
    cancelNoticeHours: Number(row.cancel_notice_hours ?? 0),
    lateRescheduleFrom: row.late_reschedule_from,
    cancelPenalty: typeof row.policy_snapshot?.['cancelPenalty'] === 'string' ? row.policy_snapshot['cancelPenalty'] as string : null,
  };
}

export async function getBookingFeeTerms(bookingId: string): Promise<BookingFeeTerms> {
  const { data, error } = await supabase.from('bookings')
    .select(BOOKING_FEE_TERMS_COLUMNS)
    .eq('id', bookingId)
    .single();
  if (error) throw error;
  return mapBookingFeeTerms(data as BookingFeeTermsRow);
}

/** A recent booking of the provider's own that has a late, no-show or
 *  late-cancel fee on it, with the fee attempts made so far — Payments &
 *  payouts decides which can be charged now (bookingFeeRules.feesToChargeNow). */
export interface FeeChargeCandidate {
  bookingId: string;
  customerName: string | null;
  serviceName: string | null;
  terms: BookingFeeTerms;
  charges: Pick<BookingFeeCharge, 'status'>[];
}

/** Fees can be charged until 24 hours after the appointment ends, and a late
 *  cancel can come up to the notice period before it, so this reads a short
 *  window either side of today. Two queries, however many bookings. */
export async function getFeeChargeCandidates(): Promise<FeeChargeCandidate[]> {
  const provider = await getMyProviderProfile();
  if (!provider) return [];
  const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  // Own bookings only — RLS plus this provider_id filter.
  const { data, error } = await supabase.from('bookings')
    .select(`id, customer_name, service_name_snapshot, ${BOOKING_FEE_TERMS_COLUMNS}`)
    .eq('provider_id', provider.id)
    .gte('booking_date', day(-2))
    .lte('booking_date', day(30))
    .or('late_fee_pence.gt.0,no_show_fee_pence.gt.0,late_cancel_fee_pence.gt.0')
    .order('booking_date', { ascending: false })
    .limit(100);
  if (error) throw error;
  const rows = (data ?? []) as (BookingFeeTermsRow & { id: string; customer_name: string | null; service_name_snapshot: string | null })[];
  if (rows.length === 0) return [];
  const { data: charges, error: chargesError } = await supabase.from('booking_fee_charges')
    .select('booking_id, status')
    .in('booking_id', rows.map(r => r.id))
    .limit(500);
  if (chargesError) throw chargesError;
  const byBooking = new Map<string, Pick<BookingFeeCharge, 'status'>[]>();
  for (const c of (charges ?? []) as { booking_id: string; status: BookingFeeCharge['status'] }[]) {
    byBooking.set(c.booking_id, [...(byBooking.get(c.booking_id) ?? []), { status: c.status }]);
  }
  return rows.map(r => ({
    bookingId: r.id,
    customerName: r.customer_name,
    serviceName: r.service_name_snapshot,
    terms: mapBookingFeeTerms(r),
    charges: byBooking.get(r.id) ?? [],
  }));
}

/** The client's own booking: what the provider could charge on top of the
 *  deposit if it's cancelled late (bookings.late_cancel_fee_pence), for the
 *  cancel sheet's warning. Null when nothing more could be charged. */
export async function getMyBookingLateCancelFee(bookingId: string): Promise<number | null> {
  const { data, error } = await supabase.from('bookings')
    .select('late_cancel_fee_pence')
    .eq('id', bookingId)
    .single();
  if (error) throw error;
  const pence = (data as { late_cancel_fee_pence: number | null }).late_cancel_fee_pence;
  return pence && pence > 0 ? pence : null;
}

/** Every field booking-fee may answer with; each action reads its own. */
interface BookingFeeResponse {
  status?: unknown;
  payBy?: unknown;
  clientSecret?: unknown;
  customerId?: unknown;
  ephemeralKeySecret?: unknown;
  livemode?: unknown;
}

async function bookingFeeAction(body: Record<string, string>, fallback: string): Promise<BookingFeeResponse> {
  const { data, error } = await supabase.functions.invoke('booking-fee', { body });
  if (error || data?.error) throw await getPaymentRequestError(error, data, fallback);
  return (data ?? {}) as BookingFeeResponse;
}

/** 'charged' when the saved card paid; 'awaiting_client' when it couldn't and
 *  the client has been asked to pay instead (by `payBy`). */
export type ChargeBookingFeeResult = { status: 'charged' } | { status: 'awaiting_client'; payBy: string };

export async function chargeBookingFee(bookingId: string, kind: BookingFeeKind): Promise<ChargeBookingFeeResult> {
  const data = await bookingFeeAction({ action: 'charge', bookingId, kind }, 'Could not charge this fee. Please try again.');
  return data.status === 'awaiting_client' && typeof data.payBy === 'string'
    ? { status: 'awaiting_client', payBy: data.payBy }
    : { status: 'charged' };
}

/** The provider withdraws an open request for the client to pay. */
export async function cancelBookingFeeRequest(chargeId: string): Promise<void> {
  await bookingFeeAction({ action: 'cancel_request', chargeId }, 'Could not cancel this request. Please try again.');
}

/** What the payment sheet needs to pay a fee the client was asked to pay. */
export interface FeePaymentSheet {
  clientSecret: string;
  customerId: string;
  ephemeralKeySecret: string;
}

export async function startBookingFeePayment(chargeId: string): Promise<FeePaymentSheet> {
  const data = await bookingFeeAction({ action: 'pay', chargeId }, 'Could not open payment. Please try again.');
  if (typeof data.clientSecret !== 'string' || typeof data.customerId !== 'string' ||
      typeof data.ephemeralKeySecret !== 'string') {
    throw new Error('Could not open payment. Please try again.');
  }
  const expectsLive = process.env['EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY']?.startsWith('pk_live_') === true;
  if (typeof data.livemode !== 'boolean' || data.livemode !== expectsLive) {
    throw new Error('Payment configuration does not match this app. Please contact support.');
  }
  return { clientSecret: data.clientSecret, customerId: data.customerId, ephemeralKeySecret: data.ephemeralKeySecret };
}

/** After the sheet succeeds: records the fee as paid (the webhook does too). */
export async function confirmBookingFeePayment(chargeId: string): Promise<void> {
  await bookingFeeAction({ action: 'paid', chargeId }, "Your payment went through but we couldn't confirm it yet. Pull to refresh in a moment.");
}

export async function refundBookingFee(chargeId: string): Promise<void> {
  await bookingFeeAction({ action: 'refund', chargeId }, 'Could not refund this fee. Please try again.');
}

export async function disputeBookingFee(chargeId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('dispute_booking_fee', { p_charge_id: chargeId, p_reason: reason });
  if (error) throw error;
}

export async function keepDisputedBookingFee(chargeId: string, response: string): Promise<void> {
  const { error } = await supabase.rpc('keep_disputed_booking_fee', { p_charge_id: chargeId, p_response: response });
  if (error) throw error;
}

/** Settles (capture) or abandons (cancel) a checkout's payment. Returns the
 *  server's answer: 'succeeded' (booked), 'refunded' (the time had gone, so the
 *  payment was refunded), 'canceled' (cancelled before it was taken). Throws
 *  only when there was no answer, which the payment sheet treats as "still
 *  confirming" (features/cart/checkoutOutcome.ts). */
export async function finalizeCheckoutPaymentIntent(
  checkoutBatchId: string,
  paymentIntentId: string,
  action: 'capture' | 'cancel',
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('finalize-payment-intent', {
    body: { checkoutBatchId, paymentIntentId, action },
  });
  if (error) throw error;
  const status = typeof data?.status === 'string' ? data.status : '';
  if (!status) throw new Error('Payment confirmation came back without a status.');
  return status;
}

/** How one of the client's own checkouts stands, read while waiting for a
 *  payment to settle. outcome is set only when it ended without bookings. */
export async function getCheckoutOutcome(
  checkoutBatchId: string,
): Promise<{ status: string; outcome: string | null } | null> {
  const { data, error } = await supabase
    .from('checkout_batches')
    .select('status, outcome')
    .eq('id', checkoutBatchId)
    .maybeSingle();
  if (error) throw error;
  return data ? { status: String(data.status), outcome: data.outcome ?? null } : null;
}

/** What a checkout's payment sheet charges now, and what it only holds on
 *  the card for requests (each charged only if its provider accepts). */
export interface CheckoutHoldPlan {
  chargeNowPence: number;
  heldPence: number;
  /** Requests with a card hold (a free request has none). */
  requestCount: number;
  bookingCount: number;
}

export async function getCheckoutHoldPlan(checkoutBatchId: string): Promise<CheckoutHoldPlan> {
  const { data, error } = await supabase.rpc('get_checkout_hold_plan', { p_checkout_batch_id: checkoutBatchId });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    { charge_now_pence: number; held_pence: number; request_count: number; booking_count: number } | undefined;
  if (!row) throw new Error('Checkout not found');
  return {
    chargeNowPence: Number(row.charge_now_pence),
    heldPence: Number(row.held_pence),
    requestCount: Number(row.request_count),
    bookingCount: Number(row.booking_count),
  };
}

/** One request's card hold, as the client sees it after checkout:
 *  'authorised' held (or since settled), 'needs_action' waiting on their
 *  bank's check, 'planned' not placed yet, 'dropped' not sent. */
export interface RequestCardHold {
  holdId: string;
  bookingId: string | null;
  serviceName: string;
  providerName: string | null;
  amountPence: number;
  state: 'planned' | 'needs_action' | 'authorised' | 'dropped';
  actionDeadline: string | null;
}

export async function getMyRequestCardHolds(checkoutBatchId: string): Promise<RequestCardHold[]> {
  const { data, error } = await supabase.rpc('get_my_request_card_holds', { p_checkout_batch_id: checkoutBatchId });
  if (error) throw error;
  return ((data ?? []) as {
    hold_id: string; booking_id: string | null; service_name: string; provider_name: string | null;
    amount_pence: number; state: RequestCardHold['state']; action_deadline: string | null;
  }[]).map(row => ({
    holdId: row.hold_id,
    bookingId: row.booking_id,
    serviceName: row.service_name,
    providerName: row.provider_name,
    amountPence: Number(row.amount_pence),
    state: row.state,
    actionDeadline: row.action_deadline,
  }));
}

/** A request hold's bank check. 'start' returns the payment's client secret
 *  for the Stripe SDK to show the check; 'check' records the result. */
export async function requestCardHoldStep(
  holdId: string,
  step: 'start' | 'check',
): Promise<{ state: 'authorised' | 'needs_action' | 'dropped'; clientSecret?: string }> {
  const { data, error } = await supabase.functions.invoke('request-card-hold', { body: { holdId, step } });
  if (error || data?.error || !['authorised', 'needs_action', 'dropped'].includes(data?.state)) {
    throw new Error('We couldn\'t reach your bank\'s check. Please try again.');
  }
  return { state: data.state, clientSecret: typeof data.clientSecret === 'string' ? data.clientSecret : undefined };
}

export async function invokeBeccaAi(body: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke("becca-ai", { body });
  if (error) throw error;
  return data;
}

export async function extractProviderProfileFromUrl(
  url: string,
  sourceType: string,
): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke("extract-provider-profile", {
    body: { url, sourceType },
  });
  if (error) throw error;
  return data;
}
