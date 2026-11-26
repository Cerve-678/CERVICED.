// Database access: The admin Money screen.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import { supabase } from "../../lib/supabase";
import { logger } from "../../utils/logger";
import type { RefundRequest, RefundRequestStatus } from "../../types/booking";
import { cancellationNoticeHours } from "../../utils/policyDisplay";
import type { AdminBankDispute, AdminMoneyOverview } from "../../types/adminMoney";
import type { AdminDashboardOverview, AdminDashboardPeriod } from "../../types/adminDashboard";

// ── Admin Money screen (admin_users accounts only) ─────────────────────────
// The server enforces who is an admin; these just call it. An admin approves
// a refund with refundProviderBooking above: refund-payment accepts admins.

/** Whether the signed-in account is a CERVICED admin. Only ever about the caller. */
export async function isCervicedAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_cerviced_admin');
  if (error) throw error;
  return data === true;
}

export interface AdminCreateAccountInput {
  accountType: 'provider' | 'client';
  name: string;
  email: string;
  phone?: string;
  /** YYYY-MM-DD; at least 16, the same rule as sign-up. */
  dob: string;
  /** Required for a provider. */
  businessName?: string;
  /** Leave blank to have the server make one up (returned as generatedPassword). */
  password?: string;
}

export interface AdminCreateAccountResult {
  userId: string;
  email: string;
  accountType: 'provider' | 'client';
  /** Only present when the server made the password up. */
  generatedPassword?: string;
}

/** The server said no for a reason written to be shown as-is ("An account with this email already exists…"). */
export class AdminCreateAccountRefused extends Error {}

/**
 * Admins only: opens an account that is ready to sign in to straight away —
 * email already confirmed, no email sent. See
 * supabase/functions/admin-create-account/index.ts.
 */
export async function adminCreateAccount(input: AdminCreateAccountInput): Promise<AdminCreateAccountResult> {
  const data = await invokeAdminAccountAction({ action: 'create', ...input });
  return toCreateAccountResult(data);
}

/** One call to admin-create-account; a 4xx reason comes back as AdminCreateAccountRefused. */
async function invokeAdminAccountAction(body: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('admin-create-account', { body });
  if (error) {
    // 4xx bodies are written to be shown; a 5xx body never is.
    const res = (error as { context?: Response }).context;
    if (res && res.status >= 400 && res.status < 500) {
      const parsed = await res.json().catch(() => null) as { error?: unknown } | null;
      if (typeof parsed?.error === 'string' && parsed.error) throw new AdminCreateAccountRefused(parsed.error);
    }
    throw error;
  }
  return data;
}

function toCreateAccountResult(data: unknown): AdminCreateAccountResult {
  const result = data as Partial<AdminCreateAccountResult> | null;
  if (typeof result?.userId !== 'string' || typeof result.email !== 'string') {
    throw new Error('admin-create-account returned no account.');
  }
  return {
    userId: result.userId,
    email: result.email,
    accountType: result.accountType === 'client' ? 'client' : 'provider',
    ...(typeof result.generatedPassword === 'string' ? { generatedPassword: result.generatedPassword } : {}),
  };
}

/**
 * Blank provider accounts (Admin → Start a provider now) sign in with a
 * made-up address here until their details are added. Mirrored by
 * BLANK_EMAIL_DOMAIN in supabase/functions/admin-create-account/index.ts.
 */
export const BLANK_ACCOUNT_EMAIL_DOMAIN = 'pending.cerviced.co';

/** A login the app can sign straight in with. */
export interface AdminAccountLogin {
  userId: string;
  email: string;
  password: string;
}

function toAccountLogin(data: unknown): AdminAccountLogin {
  const result = data as Partial<AdminAccountLogin> | null;
  if (typeof result?.userId !== 'string' || typeof result.email !== 'string' || typeof result.password !== 'string') {
    throw new Error('admin-create-account returned no login.');
  }
  return { userId: result.userId, email: result.email, password: result.password };
}

/** Admins only: a provider account with no details yet, to sign into and set up now. */
export async function adminStartBlankProvider(): Promise<AdminAccountLogin> {
  return toAccountLogin(await invokeAdminAccountAction({ action: 'start_blank_provider' }));
}

/** Admins only: back into a blank provider account. Sets it a fresh password each time. */
export async function adminOpenBlankAccount(userId: string): Promise<AdminAccountLogin> {
  return toAccountLogin(await invokeAdminAccountAction({ action: 'open_blank', userId }));
}

export interface AdminAddAccountDetailsInput {
  userId: string;
  name: string;
  email: string;
  phone?: string;
  /** YYYY-MM-DD; at least 16. */
  dob: string;
  /** Leave blank to have one made up (returned as generatedPassword). */
  password?: string;
}

/** Admins only: gives a blank provider account its owner's details, after which it's theirs. */
export async function adminAddAccountDetails(input: AdminAddAccountDetailsInput): Promise<AdminCreateAccountResult> {
  return toCreateAccountResult(await invokeAdminAccountAction({ action: 'add_details', ...input }));
}

/** Complete the handover while signed into the admin-made blank provider.
 * The Edge Function derives the target user id from the caller's verified
 * session and refuses every account that is not still awaiting owner details. */
export async function completeMyBlankProviderDetails(
  input: Omit<AdminAddAccountDetailsInput, 'userId'>,
): Promise<AdminCreateAccountResult> {
  const result = toCreateAccountResult(await invokeAdminAccountAction({
    action: 'complete_my_blank_details',
    ...input,
  }));
  // The auth metadata changed from details_pending to false. Refresh the
  // current session so the go-live checklist and account UI see that change.
  const { error } = await supabase.auth.refreshSession();
  if (error) logger.warn('[AccountHandover] session refresh failed:', error);
  return result;
}

export type AdminCreatedProviderStatus = 'live' | 'setting_up' | 'not_started';

export interface AdminCreatedAccount {
  userId: string;
  createdAt: string;
  accountType: 'provider' | 'client';
  createdByName: string | null;
  /** Null once the account has been deleted. */
  name: string | null;
  email: string | null;
  /** Providers only. */
  providerStatus: AdminCreatedProviderStatus | null;
  /** A blank provider whose owner's details haven't been added yet. */
  detailsPending: boolean;
}

/** Accounts opened from Admin → Create an account, newest first. Throws for a non-admin. */
export async function listAdminCreatedAccounts(limit = 200): Promise<AdminCreatedAccount[]> {
  const { data, error } = await supabase.rpc('admin_created_accounts', { p_limit: limit });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('admin_created_accounts returned no list.');
  type Row = {
    user_id?: unknown; created_at?: unknown; account_type?: unknown; created_by_name?: unknown;
    name?: unknown; email?: unknown; provider_status?: unknown;
  };
  return (data as Row[]).map(row => {
    const status = row.provider_status;
    const email = typeof row.email === 'string' ? row.email : null;
    return {
      userId: String(row.user_id),
      createdAt: String(row.created_at),
      accountType: row.account_type === 'client' ? 'client' : 'provider',
      createdByName: typeof row.created_by_name === 'string' ? row.created_by_name : null,
      name: typeof row.name === 'string' ? row.name : null,
      email,
      providerStatus: status === 'live' || status === 'setting_up' || status === 'not_started' ? status : null,
      detailsPending: email !== null && email.endsWith(`@${BLANK_ACCOUNT_EMAIL_DOMAIN}`),
    };
  });
}

/** Failed payouts, money providers owe and open refund requests. Throws for a non-admin. */
export async function getAdminMoneyOverview(): Promise<AdminMoneyOverview> {
  const { data, error } = await supabase.rpc('admin_money_overview');
  if (error) throw error;
  const overview = data as Partial<AdminMoneyOverview> | null;
  if (!overview || !Array.isArray(overview.failed) || !Array.isArray(overview.owed) || !Array.isArray(overview.refunds)) {
    throw new Error('The money lists came back in an unexpected shape.');
  }
  return overview as AdminMoneyOverview;
}

/** Growth, marketplace, money and problem counts for the admin dashboard. Throws for a non-admin. */
export async function getAdminDashboardOverview(days: AdminDashboardPeriod): Promise<AdminDashboardOverview> {
  const { data, error } = await supabase.rpc('admin_dashboard_overview', { p_days: days });
  if (error) throw error;
  const overview = data as Partial<AdminDashboardOverview> | null;
  if (!overview || !overview.accounts || !overview.problems || !Array.isArray(overview.weekly)) {
    throw new Error('The dashboard came back in an unexpected shape.');
  }
  return overview as AdminDashboardOverview;
}

/** Puts a failed or waiting payout back as due now; the next release run sends it. */
export async function adminRetryPayout(payoutId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_retry_payout', { p_payout_id: payoutId });
  if (error) throw error;
}

/** Bank disputes an admin has to match to a booking. Throws for a non-admin. */
export async function getAdminBankDisputes(): Promise<AdminBankDispute[]> {
  const { data, error } = await supabase.rpc('admin_bank_disputes');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('The dispute list came back in an unexpected shape.');
  return data as AdminBankDispute[];
}

/** An admin's answer to which booking(s) a bank dispute is about. Takes the
 *  money back from those providers only (assign-bank-dispute). Throws with a
 *  message written for the admin when the server refuses. */
export async function assignBankDispute(disputeId: string, bookingIds: string[]): Promise<void> {
  const { data, error } = await supabase.functions.invoke('assign-bank-dispute', { body: { disputeId, bookingIds } });
  if (error) {
    // assign-bank-dispute's 4xx bodies are written for the admin, so lift
    // them out. A 5xx body is not shown.
    const res = (error as { context?: Response }).context;
    if (res && res.status >= 400 && res.status < 500) {
      const body = await res.json().catch(() => null) as { error?: unknown } | null;
      if (typeof body?.error === 'string' && body.error) throw new Error(body.error);
    }
    throw new Error("Couldn't save that. Nothing was taken twice; try again.");
  }
  if (!data?.ok) throw new Error("Couldn't save that. Nothing was taken twice; try again.");
}

/** Cerviced's "no" to a passed-on refund request. The note is what the client is told. */
export async function adminDeclineRefundRequest(requestId: string, note: string): Promise<void> {
  const { error } = await supabase.rpc('admin_decline_refund_request', { p_request_id: requestId, p_note: note });
  if (error) throw error;
}

/** What the Issue Refund sheet needs to know about one of the provider's own bookings. */
export interface ProviderRefundState {
  /** The provider's share of this booking, in pence (what the client paid less the platform fee). */
  sharePence: number;
  /** What the provider still holds from it, in pence — the most a partial refund can be. */
  heldPence: number;
  /** True once anything has been refunded; the sheet then opens on a partial refund. */
  anyRefunded: boolean;
  /** What has already gone back out of the provider's share, outside a policy
   *  settlement (their own refunds, or CERVICED's), in pence. Fee shares are
   *  left out, so it never reveals the platform fee. */
  refundedFromSharePence: number;
  /** When the latest of those refunds went through (ISO), or null. */
  lastRefundAt: string | null;
  /** True once the client has had back everything they paid in app. */
  fullyRefunded: boolean;
  /** Whether the client paid the full price in app or only a deposit. */
  paidAs: 'full' | 'deposit';
  /** The booking's full price (service + add-ons), in pence. With a deposit,
   *  the rest was settled off-app and can't be refunded from here. */
  bookingPricePence: number;
  /**
   * Set once the client's own cancellation was settled by the provider's
   * policy. `hoursBefore` is cancel-to-start, `noticeHours` the policy window,
   * `keptIsDeposit` whether what was kept is the booking's deposit.
   */
  policySettlement: {
    refundedToClientPence: number;
    providerKeptPence: number;
    hoursBefore: number | null;
    noticeHours: number;
    keptIsDeposit: boolean;
    /** The client moved it while already inside the window (bookings.late_reschedule_from). */
    movedLate: boolean;
  } | null;
}

/**
 * Reads a provider's OWN booking's refund state (RLS: bookings, provider_payouts
 * and booking_refunds are all owner-readable for the provider). The server
 * re-derives every figure when the refund is actually made — this is for the
 * sheet's display only.
 */
export async function getProviderRefundState(bookingId: string): Promise<ProviderRefundState> {
  const [bookingRes, payoutRes, refundsRes] = await Promise.all([
    // Embeds the provider's own policy row (provider reading their own record)
    // for the notice window the settlement summary quotes.
    supabase
      .from('bookings')
      .select('amount_paid, service_charge, base_price, add_ons_total, refunded_amount, policy_retained_amount, payment_type, cancelled_by, cancelled_at, booking_date, booking_time, late_reschedule_from, cancel_notice_hours, providers ( cancellation_notice_hours, booking_policies )')
      .eq('id', bookingId)
      .single(),
    supabase.from('provider_payouts').select('status, payout_amount').eq('booking_id', bookingId).maybeSingle(),
    supabase.from('booking_refunds').select('amount_pence, kind, provider_kept_pence, payout_adjust_pence, created_at').eq('booking_id', bookingId).limit(50),
  ]);
  if (bookingRes.error) throw bookingRes.error;
  if (payoutRes.error) throw payoutRes.error;
  if (refundsRes.error) throw refundsRes.error;

  const paid = Math.round(Number(bookingRes.data.amount_paid ?? 0) * 100);
  const fee = Math.round(Number(bookingRes.data.service_charge ?? 0) * 100);
  const refunded = Math.round(Number(bookingRes.data.refunded_amount ?? 0) * 100);
  const share = Math.max(0, paid - fee);
  const payout = payoutRes.data;
  const held = payout
    ? (payout.status === 'reversed' || payout.status === 'cancelled' ? 0 : Number(payout.payout_amount))
    : Math.max(0, share - refunded);
  const settlementRow = (refundsRes.data ?? []).find(r => r.kind === 'cancellation_settlement');
  // A full refund's amount includes the client's fee share; payout_adjust_pence
  // is the part that came out of the provider's share. A row with no recorded
  // adjustment (an older or outside refund) counts in full, capped at the share.
  const ownRefunds = (refundsRes.data ?? []).filter(r => r.kind !== 'cancellation_settlement');
  const refundedFromShare = Math.min(share, ownRefunds.reduce((sum, r) => {
    const amount = Number(r.amount_pence);
    const adjust = Number(r.payout_adjust_pence ?? 0);
    return sum + (adjust > 0 ? Math.min(adjust, amount) : amount);
  }, 0));
  const lastRefundAt = ownRefunds.reduce<string | null>(
    (latest, r) => (r.created_at && (!latest || r.created_at > latest) ? r.created_at : latest), null);
  // A settlement that kept everything refunds nothing, so it writes no
  // booking_refunds row — bookings.policy_retained_amount is the record that
  // is always there once the policy has run on a client's cancellation.
  const b = bookingRes.data;
  const retained = b.policy_retained_amount != null ? Math.round(Number(b.policy_retained_amount) * 100) : null;
  const settled = b.cancelled_by === 'client' && (retained != null || !!settlementRow);
  const providerRow = (Array.isArray(b.providers) ? b.providers[0] : b.providers) as
    { cancellation_notice_hours: number | null; booking_policies: { cancelNotice?: unknown } | null } | null | undefined;
  const startMs = Date.parse(`${b.booking_date}T${b.booking_time}`);
  const cancelledMs = b.cancelled_at ? Date.parse(b.cancelled_at) : NaN;
  const hoursBefore = Number.isFinite(startMs) && Number.isFinite(cancelledMs) ? (startMs - cancelledMs) / 3_600_000 : null;

  return {
    sharePence: share,
    heldPence: Math.max(0, Math.min(held, paid - refunded)),
    anyRefunded: refunded > 0,
    refundedFromSharePence: refundedFromShare,
    lastRefundAt,
    fullyRefunded: paid > 0 && refunded >= paid,
    paidAs: b.payment_type === 'deposit' ? 'deposit' : 'full',
    bookingPricePence: Math.round((Number(b.base_price ?? 0) + Number(b.add_ons_total ?? 0)) * 100),
    policySettlement: settled
      ? {
          refundedToClientPence: settlementRow ? Number(settlementRow.amount_pence) : 0,
          providerKeptPence: retained ?? Number(settlementRow?.provider_kept_pence ?? 0),
          hoursBefore,
          noticeHours: b.cancel_notice_hours ?? cancellationNoticeHours(providerRow?.cancellation_notice_hours, providerRow?.booking_policies),
          keptIsDeposit: b.payment_type === 'deposit',
          movedLate: !!b.late_reschedule_from,
        }
      : null,
  };
}

interface RefundRequestRow {
  id: string;
  booking_id: string;
  status: RefundRequestStatus;
  reason: string;
  message: string | null;
  outcome_note: string | null;
  refunded_amount: number | string | null;
  created_at: string;
  passed_to_cerviced_at: string | null;
  passed_automatically: boolean | null;
  resolved_at: string | null;
}

// provider_note is deliberately absent: its column isn't granted to app users
// (the provider's reason for passing a request on is for Cerviced only).
const REFUND_REQUEST_COLUMNS =
  'id, booking_id, status, reason, message, outcome_note, refunded_amount, created_at, passed_to_cerviced_at, passed_automatically, resolved_at';

function mapRefundRequest(r: RefundRequestRow): RefundRequest {
  return {
    id: r.id,
    bookingId: r.booking_id,
    status: r.status,
    reason: r.reason,
    message: r.message,
    outcomeNote: r.outcome_note,
    refundedAmount: r.refunded_amount == null ? null : Number(r.refunded_amount),
    createdAt: r.created_at,
    passedToCervicedAt: r.passed_to_cerviced_at,
    passedAutomatically: !!r.passed_automatically,
    resolvedAt: r.resolved_at,
  };
}

/**
 * A client asks for a refund on their own booking. The row is the record and
 * request_booking_refund() notifies the provider; it refuses anything not
 * paid through the app, or a second open request. Returns the request id.
 */
export async function requestBookingRefund(
  bookingId: string,
  reason: string,
  message: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('request_booking_refund', {
    p_booking_id: bookingId,
    p_reason: reason,
    p_message: message,
  });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('Refund request returned no id.');
  return data;
}

/** The provider isn't refunding: hand the request to Cerviced, with why. */
export async function passRefundRequestToCerviced(requestId: string, note: string): Promise<void> {
  const { error } = await supabase.rpc('pass_refund_request_to_cerviced', {
    p_request_id: requestId,
    p_note: note,
  });
  if (error) throw error;
}

/** A booking's refund requests, newest first. RLS lets the booking's client
 *  and its provider read them. */
export async function getRefundRequestsForBooking(bookingId: string): Promise<RefundRequest[]> {
  const { data, error } = await supabase
    .from('refund_requests')
    .select(REFUND_REQUEST_COLUMNS)
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data as RefundRequestRow[] | null ?? []).map(mapRefundRequest);
}

/** The money half of a CLIENT cancellation: applies the provider's cancellation
 *  policy (keep the deposit / their share, or a full refund) through Stripe,
 *  computed entirely server-side. Call it right AFTER cancel_own_booking() has
 *  cancelled the booking. Idempotent and a safe no-op when nothing was captured
 *  (e.g. Stripe not live) — it then just reports 'no_payment'. Throws on a hard
 *  failure so the caller can surface/log it; the cancel itself has already
 *  succeeded regardless. Inert until USE_STRIPE_PAYMENTS is enabled. */
export async function applyCancellationRefund(
  bookingId: string,
): Promise<'settled' | 'already_settled' | 'no_payment' | 'not_eligible' | 'not_charged'> {
  const { data, error } = await supabase.functions.invoke('apply-cancellation-refund', { body: { bookingId } });
  // 'not_charged': a request whose card was only held — nothing to refund.
  if (error || data?.error || !['settled', 'already_settled', 'no_payment', 'not_eligible', 'not_charged'].includes(data?.status)) {
    throw new Error('The cancellation refund could not be confirmed.');
  }
  return data.status;
}
