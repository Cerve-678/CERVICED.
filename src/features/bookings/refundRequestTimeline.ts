import { formatShortDayDate } from '../../utils/dateUtils';
import type { RefundRequest } from '../../types/booking';

/**
 * The steps of a refund request, read straight off refund_requests.status:
 * the client sees them on BookingDetailScreen, the provider in
 * IssueRefundSheet. Same steps for both; only the wording differs.
 *
 * The wording never promises money: the last step is "Outcome" until there
 * is one, because a request can end in "Not refunded" as well as "Refunded".
 * The provider's reason for passing it to Cerviced never reaches the client:
 * its column isn't granted to app users at all, so it isn't on RefundRequest.
 */
export type RefundStepState = 'done' | 'current' | 'upcoming' | 'declined';

export interface RefundStep {
  key: string;
  title: string;
  detail: string | null;
  date: string | null;
  state: RefundStepState;
}

/** Days the provider has to refund or pass a request on before it goes to
 *  Cerviced by itself (process_refund_request_deadlines). */
export const REFUND_REPLY_DAYS = 3;

/** What Cerviced aims for once it has a request (Terms §15). */
export const REFUND_REVIEW_PROMISE = 'We aim to decide within 5 working days.';

/** When a request still with the provider goes to Cerviced. */
export function refundReplyDeadline(createdAt: string): string | null {
  const ms = Date.parse(createdAt);
  return Number.isFinite(ms) ? new Date(ms + REFUND_REPLY_DAYS * 86_400_000).toISOString() : null;
}

/** Open = still waiting on someone. Only one can be open per booking. */
export function isRefundRequestOpen(r: Pick<RefundRequest, 'status'>): boolean {
  return r.status === 'with_provider' || r.status === 'under_review';
}

function day(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return formatShortDayDate(new Date(iso));
  } catch {
    return null;
  }
}

export type RefundTimelineAudience = 'client' | 'provider';

export function describeRefundRequestTimeline(
  r: RefundRequest,
  providerName: string | null | undefined,
  audience: RefundTimelineAudience = 'client',
): RefundStep[] {
  const forProvider = audience === 'provider';
  const provider = providerName?.trim() || 'Your provider';
  const passed = r.status === 'under_review' || !!r.passedToCervicedAt;

  const steps: RefundStep[] = [
    { key: 'requested', title: 'Refund requested', detail: r.reason, date: day(r.createdAt), state: 'done' },
  ];

  if (r.status === 'with_provider') {
    const by = day(refundReplyDeadline(r.createdAt));
    steps.push({
      key: 'provider',
      title: forProvider ? 'With you' : `With ${provider}`,
      detail: forProvider
        ? `Refund it, or pass it to Cerviced to review.${by ? ` If you haven't by ${by}, it goes to Cerviced.` : ''}`
        : `${provider} has been told. They can refund you, or pass it to Cerviced to review.${by ? ` If they haven't replied by ${by}, it comes to Cerviced.` : ''}`,
      date: null,
      state: 'current',
    });
  } else if (passed) {
    steps.push({
      key: 'review',
      title: 'Under review by Cerviced',
      detail: r.status !== 'under_review' ? null
        : r.passedAutomatically
          ? forProvider
            ? `You didn't reply within ${REFUND_REPLY_DAYS} days, so we're reviewing it against your policy and will let you both know. ${REFUND_REVIEW_PROMISE}`
            : `${provider} didn't reply within ${REFUND_REPLY_DAYS} days, so we're reviewing it against their policy. ${REFUND_REVIEW_PROMISE}`
        : forProvider ? `You passed it to Cerviced. We'll review it against your policy and let you both know. ${REFUND_REVIEW_PROMISE}`
        : `${provider} passed it to Cerviced. We'll review it against their policy. ${REFUND_REVIEW_PROMISE}`,
      date: day(r.passedToCervicedAt),
      state: r.status === 'under_review' ? 'current' : 'done',
    });
  }

  if (r.status === 'refunded') {
    steps.push({
      key: 'outcome',
      title: 'Refunded',
      detail: forProvider
        ? (r.refundedAmount != null && r.refundedAmount > 0 ? `£${r.refundedAmount.toFixed(2)} went back to the client.` : null)
        : r.refundedAmount != null && r.refundedAmount > 0
          ? `£${r.refundedAmount.toFixed(2)} is on its way back to you. Your bank may take a few days to show it.`
          : 'Your bank may take a few days to show it.',
      date: day(r.resolvedAt),
      state: 'done',
    });
  } else if (r.status === 'declined') {
    steps.push({
      key: 'outcome',
      title: 'Not refunded',
      // A decline always carries a note (CHECK on refund_requests); the
      // fallback only covers a row read mid-migration.
      detail: r.outcomeNote?.trim() || "Cerviced reviewed it against the booking's policy and isn't refunding it.",
      date: day(r.resolvedAt),
      state: 'declined',
    });
  } else {
    steps.push({ key: 'outcome', title: 'Outcome', detail: null, date: null, state: 'upcoming' });
  }

  return steps;
}
