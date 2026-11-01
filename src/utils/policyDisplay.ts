// Shared row-building for a provider's cancellation/booking policy — used by
// ProviderProfileScreen's live Policy tab (reading providers.booking_policies)
// and BookingDetailScreen's per-booking policy card (reading a booking's
// frozen policy_snapshot, or the live policy as a fallback for older
// bookings). Single source of truth so the two views can never silently
// disagree on how a given policy field is worded.
import type { Ionicons } from '@expo/vector-icons';
import { resolveDepositMode } from './depositPolicy';

export interface PolicyDisplayData {
  cancelNotice?: string;
  cancelPenalty?: string;
  cancelNote?: string;
  rescheduleNotice?: string;
  maxReschedules?: string;
  rescheduleNote?: string;
  depositMode?: string;
  depositRequired?: boolean;
  depositOnly?: boolean;
  depositType?: string;
  depositAmount?: string;
  noShowAction?: string;
  noShowGraceMinutes?: string;
  noShowNote?: string;
  /** £ amounts the provider can charge after the appointment ('' = none).
   *  Each booking freezes them at checkout, capped at half its price. */
  lateFee?: string;
  noShowFee?: string;
  policyImageUrl?: string;
  /** Free-text refund disclosure only — never a percentage/amount, since
   *  this app has no refund-processing infra and doesn't calculate or
   *  enforce refunds automatically. Same free-text pattern as cancelNote. */
  refundPolicyNote?: string;
}

/** The provider's own written Terms & Conditions, frozen at booking time.
 *
 *  Stored inside `policy_snapshot` rather than in a column of its own so it
 *  travels the existing cart -> hold -> claim plumbing untouched. Readers must
 *  treat it as optional: bookings made before 2026-08-26 have no copy, and a
 *  provider can have a structured policy without any written terms. */
export interface ProviderTermsSnapshot {
  title: string;
  body: string;
}

/** Freeze what the client actually agreed to on this booking.
 *
 *  Until 2026-08-26 the "I agree to {provider}'s Terms & Conditions" tick in
 *  BookingSheet/MultiBookingSheet gated Add to Cart and was then thrown away —
 *  nothing anywhere recorded which terms were shown. A provider editing their
 *  T&Cs afterwards left the agreed version unrecoverable, which is precisely
 *  the thing a record of agreement exists to prevent.
 *
 *  Emits a snapshot when EITHER a structured policy or written terms exist —
 *  a provider can have written terms without ever filling in a policy, and the
 *  old `bookingPolicies ? ... : {}` condition dropped their terms on the floor.
 *
 *  Content of record, not proof of consent: the moment of agreement is
 *  `bookings.policy_accepted_at`, which is the checkout checkbox's job. Lives
 *  beside buildPolicyDisplayRows so writer and reader cannot drift apart. */
export function buildPolicySnapshot(
  bookingPolicies: Record<string, unknown> | null | undefined,
  agreedProviderTerms: ProviderTermsSnapshot | null | undefined,
): Record<string, unknown> | undefined {
  if (!bookingPolicies && !agreedProviderTerms) return undefined;
  return {
    ...(bookingPolicies ?? {}),
    ...(agreedProviderTerms ? { providerTerms: agreedProviderTerms } : {}),
  };
}

/** Read back what buildPolicySnapshot froze. Tolerates the shape being absent
 *  or malformed — an older booking simply has no terms to show. */
export function readProviderTermsSnapshot(
  snapshot: Record<string, unknown> | null | undefined,
): ProviderTermsSnapshot | null {
  const terms = snapshot?.['providerTerms'];
  if (!terms || typeof terms !== 'object') return null;
  const { title, body } = terms as Record<string, unknown>;
  if (typeof body !== 'string' || body.trim().length === 0) return null;
  return { title: typeof title === 'string' ? title : 'Terms & Conditions', body };
}

export interface PolicyDisplayRow {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  /** Short badge next to the label — e.g. "ONLY" when the provider requires
   *  the deposit and won't accept payment in full. */
  tag?: string;
  /** Smaller lines under the value: the provider's own note for that
   *  section, and the no-show grace period. Renderers show them in order. */
  notes?: string[];
}

/** A section row whose value is its first non-empty line. A section with only
 *  a note (no notice picked, say) still gets its row, with the note as the
 *  value, rather than the note vanishing for want of a rule to hang under. */
function sectionRow(
  icon: PolicyDisplayRow['icon'],
  label: string,
  lines: (string | null | undefined)[],
): PolicyDisplayRow | null {
  const present = lines.map(l => l?.trim()).filter((l): l is string => !!l);
  const [value, ...notes] = present;
  if (value === undefined) return null;
  return notes.length > 0 ? { icon, label, value, notes } : { icon, label, value };
}

function rescheduleSummary(policy: PolicyDisplayData): string | null {
  const parts: string[] = [];
  if (policy.rescheduleNotice === 'same_day') parts.push('same day OK');
  else if (policy.rescheduleNotice) parts.push(`${policy.rescheduleNotice} notice`);
  if (policy.maxReschedules === 'unlimited') parts.push('no limit');
  else if (policy.maxReschedules) parts.push(`max ${policy.maxReschedules}`);
  if (parts.length === 0) return null;
  const text = parts.join(' · ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function pushRow(rows: PolicyDisplayRow[], row: PolicyDisplayRow | null): void {
  if (row) rows.push(row);
}

/**
 * `enforcedCancellationNoticeHours` is the Automations-screen number
 * (providers.cancellation_notice_hours) — when present and positive it wins
 * over the descriptive `cancelNotice` text, since that's what the cancel flow
 * actually enforces. A frozen booking snapshot has no equivalent enforced
 * number (only the descriptive text was ever captured), so callers reading a
 * snapshot should omit this parameter.
 *
 * `linkOnly`: a link-only provider takes bookings on their own site, so
 * nothing on CERVICED applies a notice window, keeps a deposit or charges a
 * fee for them. Their rows are the plain policy text only: no deposit,
 * penalty, no-show or fee rows, and their own notice rather than the
 * enforced column (which defaults to 24 for every provider). Rows for values
 * stored before they switched to link-only stay hidden too.
 */
export function buildPolicyDisplayRows(
  policy: PolicyDisplayData | null | undefined,
  enforcedCancellationNoticeHours?: number,
  options?: { linkOnly?: boolean },
): PolicyDisplayRow[] {
  const rows: PolicyDisplayRow[] = [];
  if (!policy) return rows;
  if (options?.linkOnly) return buildLinkOnlyPolicyRows(policy);

  // "required" is only true for the deposit_required mode — under
  // client_choice the client can still pay in full, so labelling the deposit
  // as required would misstate the provider's own policy back to them.
  const depositMode = resolveDepositMode(policy);
  if (depositMode && depositMode !== 'full_only' && policy.depositAmount) {
    const amount = policy.depositType === 'percent'
      ? `${policy.depositAmount}%`
      : `£${policy.depositAmount}`;
    rows.push({
      icon: 'card-outline',
      label: 'Deposit',
      value: depositMode === 'deposit_required' ? `${amount} required` : `${amount} (optional)`,
    });
  }

  const cancelPenaltyText = policy.cancelPenalty && policy.cancelPenalty !== 'none'
    ? ` · ${policy.cancelPenalty === 'deposit' ? 'deposit kept' : 'half the price kept'}`
    : '';
  let cancelRule: string | null = null;
  if (enforcedCancellationNoticeHours && enforcedCancellationNoticeHours > 0) {
    cancelRule = `${enforcedCancellationNoticeHours} hours' notice${cancelPenaltyText}`;
  } else if (policy.cancelNotice && policy.cancelNotice !== 'none') {
    cancelRule = `${policy.cancelNotice} notice${cancelPenaltyText}`;
  }
  pushRow(rows, sectionRow('time-outline', 'Cancellation', [cancelRule, policy.cancelNote]));

  pushRow(rows, sectionRow('calendar-outline', 'Reschedule', [rescheduleSummary(policy), policy.rescheduleNote]));

  // The grace period applies whatever the no-show action is — it's how long
  // after the start time before the provider can mark a no-show at all
  // (server-enforced in provider_update_booking_status()) — so it shows here
  // even when the action itself is "none".
  const grace = Number(policy.noShowGraceMinutes) || 0;
  const noShowRule = policy.noShowAction && policy.noShowAction !== 'none'
    // 'charge_full' was never enforced and is read as keeping the deposit;
    // an actual extra charge is the no-show fee row below.
    ? (policy.noShowAction === 'warn' ? 'Warning issued' : 'Deposit kept')
    : null;
  pushRow(rows, sectionRow('close-circle-outline', 'No-show', [
    noShowRule,
    grace > 0 ? `${grace} min grace period` : null,
    policy.noShowNote,
  ]));

  const lateFee = feeLabel(policy.lateFee);
  if (lateFee) {
    rows.push({ icon: 'alarm-outline', label: 'Late fee', value: grace > 0 ? `${lateFee} after ${grace} min` : lateFee });
  }
  const noShowFee = feeLabel(policy.noShowFee);
  if (noShowFee) {
    rows.push({ icon: 'close-circle-outline', label: 'No-show fee', value: noShowFee });
  }

  if (policy.refundPolicyNote) {
    rows.push({ icon: 'cash-outline', label: 'Refunds', value: policy.refundPolicyNote });
  }

  return rows;
}

function buildLinkOnlyPolicyRows(policy: PolicyDisplayData): PolicyDisplayRow[] {
  const rows: PolicyDisplayRow[] = [];
  const cancelRule = policy.cancelNotice && policy.cancelNotice !== 'none' ? `${policy.cancelNotice} notice` : null;
  pushRow(rows, sectionRow('time-outline', 'Cancellation', [cancelRule, policy.cancelNote]));
  pushRow(rows, sectionRow('calendar-outline', 'Reschedule', [rescheduleSummary(policy), policy.rescheduleNote]));
  if (policy.refundPolicyNote) {
    rows.push({ icon: 'cash-outline', label: 'Refunds', value: policy.refundPolicyNote });
  }
  return rows;
}

/** "£10" / "£12.50" for a policy fee, or null when there's no valid fee. */
function feeLabel(value: string | undefined): string | null {
  if (!value || !/^\d+(\.\d{1,2})?$/.test(value) || Number(value) <= 0) return null;
  const n = Number(value);
  return `£${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

/**
 * Mirror of cancel_notice_hours() (SQL) and apply-cancellation-refund's
 * noticeHours(): the explicit column wins, else the cancelNotice policy maps
 * to hours, else there is no notice window. Keep the three in step.
 */
export function cancellationNoticeHours(
  columnHours: number | null | undefined,
  policies: { cancelNotice?: unknown } | null | undefined,
): number {
  const col = Number(columnHours);
  if (Number.isFinite(col) && col > 0) return col;
  switch (policies?.cancelNotice) {
    case '24h': return 24;
    case '48h': return 48;
    case '72h': return 72;
    default: return 0;
  }
}
