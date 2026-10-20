import { formatShortDayDate } from '../../utils/dateUtils';
import type { RefundRequest } from '../../types/booking';
import { tr } from '../../i18n';

/**
 * The steps a client sees for their refund request on BookingDetailScreen,
 * read straight off refund_requests.status.
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

export function describeRefundRequestTimeline(
  r: RefundRequest,
  providerName: string | null | undefined,
): RefundStep[] {
  const provider = providerName?.trim() || tr('clientBooking.refundTimeline.yourProvider');
  const passed = r.status === 'under_review' || !!r.passedToCervicedAt;

  const steps: RefundStep[] = [
    { key: 'requested', title: tr('clientBooking.refundTimeline.requested'), detail: r.reason, date: day(r.createdAt), state: 'done' },
  ];

  if (r.status === 'with_provider') {
    steps.push({
      key: 'provider',
      title: tr('clientBooking.refundTimeline.withProvider', { provider }),
      detail: tr('clientBooking.refundTimeline.withProviderDetail', { provider }),
      date: null,
      state: 'current',
    });
  } else if (passed) {
    steps.push({
      key: 'review',
      title: tr('clientBooking.refundTimeline.underReview'),
      detail: r.status === 'under_review'
        ? tr('clientBooking.refundTimeline.underReviewDetail', { provider })
        : null,
      date: day(r.passedToCervicedAt),
      state: r.status === 'under_review' ? 'current' : 'done',
    });
  }

  if (r.status === 'refunded') {
    steps.push({
      key: 'outcome',
      title: tr('clientBooking.refundTimeline.refunded'),
      detail: r.refundedAmount != null && r.refundedAmount > 0
        ? tr('clientBooking.refundTimeline.refundedDetailAmount', { amount: `£${r.refundedAmount.toFixed(2)}` })
        : tr('clientBooking.refundTimeline.refundedDetail'),
      date: day(r.resolvedAt),
      state: 'done',
    });
  } else if (r.status === 'declined') {
    steps.push({
      key: 'outcome',
      title: tr('clientBooking.refundTimeline.notRefunded'),
      // A decline always carries a note (CHECK on refund_requests); the
      // fallback only covers a row read mid-migration.
      detail: r.outcomeNote?.trim() || tr('clientBooking.refundTimeline.notRefundedDetail'),
      date: day(r.resolvedAt),
      state: 'declined',
    });
  } else {
    steps.push({ key: 'outcome', title: tr('clientBooking.refundTimeline.outcome'), detail: null, date: null, state: 'upcoming' });
  }

  return steps;
}
