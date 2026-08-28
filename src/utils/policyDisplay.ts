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
  depositMode?: string;
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
