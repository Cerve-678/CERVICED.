// Shared row-building for a provider's cancellation/booking policy — used by
// ProviderProfileScreen's live Policy tab (reading providers.booking_policies)
// and BookingDetailScreen's per-booking policy card (reading a booking's
// frozen policy_snapshot, or the live policy as a fallback for older
// bookings). Single source of truth so the two views can never silently
// disagree on how a given policy field is worded.
import type { Ionicons } from '@expo/vector-icons';

export interface PolicyDisplayData {
  cancelNotice?: string;
  cancelPenalty?: string;
  cancelNote?: string;
  rescheduleNotice?: string;
  maxReschedules?: string;
  depositRequired?: boolean;
  depositOnly?: boolean;
  depositType?: string;
  depositAmount?: string;
  noShowAction?: string;
  policyImageUrl?: string;
  /** Free-text refund disclosure only — never a percentage/amount, since
   *  this app has no refund-processing infra and doesn't calculate or
   *  enforce refunds automatically. Same free-text pattern as cancelNote. */
  refundPolicyNote?: string;
}

export interface PolicyDisplayRow {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  /** Short badge next to the label — e.g. "ONLY" when the provider requires
   *  the deposit and won't accept payment in full. */
  tag?: string;
}

/**
 * `enforcedCancellationNoticeHours` is the Automations-screen number
 * (providers.cancellation_notice_hours) — when present and positive it wins
 * over the descriptive `cancelNotice` text, since that's what the cancel flow
 * actually enforces. A frozen booking snapshot has no equivalent enforced
 * number (only the descriptive text was ever captured), so callers reading a
 * snapshot should omit this parameter.
 */
export function buildPolicyDisplayRows(
  policy: PolicyDisplayData | null | undefined,
  enforcedCancellationNoticeHours?: number,
): PolicyDisplayRow[] {
  const rows: PolicyDisplayRow[] = [];
  if (!policy) return rows;

  if (policy.depositRequired && policy.depositAmount) {
    rows.push({
      icon: 'card-outline',
      label: 'Deposit',
      value: policy.depositType === 'percent'
        ? `${policy.depositAmount}% required`
        : `£${policy.depositAmount} required`,
    });
  }

  const cancelPenaltyText = policy.cancelPenalty && policy.cancelPenalty !== 'none'
    ? ` · ${policy.cancelPenalty === 'deposit' ? 'deposit kept' : 'full charge'}`
    : '';
  if (enforcedCancellationNoticeHours && enforcedCancellationNoticeHours > 0) {
    rows.push({
      icon: 'time-outline',
      label: 'Cancellation',
      value: `${enforcedCancellationNoticeHours} hours' notice${cancelPenaltyText}`,
    });
  } else if (policy.cancelNotice && policy.cancelNotice !== 'none') {
    rows.push({
      icon: 'time-outline',
      label: 'Cancellation',
      value: `${policy.cancelNotice} notice${cancelPenaltyText}`,
    });
  }

  if (policy.rescheduleNotice || policy.maxReschedules) {
    const parts: string[] = [];
    if (policy.rescheduleNotice && policy.rescheduleNotice !== 'same_day') {
      parts.push(`${policy.rescheduleNotice} notice`);
    }
    if (policy.maxReschedules && policy.maxReschedules !== 'unlimited') {
      parts.push(`max ${policy.maxReschedules}`);
    }
    if (parts.length > 0) {
      rows.push({ icon: 'calendar-outline', label: 'Reschedule', value: parts.join(' · ') });
    }
  }

  if (policy.noShowAction && policy.noShowAction !== 'none') {
    rows.push({
      icon: 'close-circle-outline',
      label: 'No-show',
      value: policy.noShowAction === 'warn'
        ? 'Warning issued'
        : policy.noShowAction === 'charge_deposit'
          ? 'Deposit charged'
          : 'Full charge',
    });
  }

  if (policy.cancelNote) {
    rows.push({ icon: 'information-circle-outline', label: 'Note', value: policy.cancelNote });
  }

  if (policy.refundPolicyNote) {
    rows.push({ icon: 'cash-outline', label: 'Refunds', value: policy.refundPolicyNote });
  }

  return rows;
}
