import { describeRefundRequestTimeline, isRefundRequestOpen } from '../features/bookings/refundRequestTimeline';
import type { RefundRequest } from '../types/booking';

const base: RefundRequest = {
  id: 'rr-1',
  bookingId: 'b-1',
  status: 'with_provider',
  reason: 'The provider cancelled',
  message: null,
  outcomeNote: null,
  refundedAmount: null,
  createdAt: '2026-10-10T09:00:00Z',
  passedToCervicedAt: null,
  resolvedAt: null,
};

const shape = (r: RefundRequest) =>
  describeRefundRequestTimeline(r, 'Braids by Amara').map(s => `${s.title}:${s.state}`);

describe('describeRefundRequestTimeline', () => {
  it('starts with the provider, and ends on an undecided outcome rather than a promised refund', () => {
    expect(shape(base)).toEqual(['Refund requested:done', 'With Braids by Amara:current', 'Outcome:upcoming']);
  });

  it('shows Cerviced reviewing once the provider passes it on', () => {
    const steps = describeRefundRequestTimeline({ ...base, status: 'under_review', passedToCervicedAt: '2026-10-11T09:00:00Z' }, 'Braids by Amara');
    expect(steps.map(s => `${s.title}:${s.state}`)).toEqual(['Refund requested:done', 'Under review by Cerviced:current', 'Outcome:upcoming']);
  });

  it('ends refunded with the amount that came back', () => {
    const steps = describeRefundRequestTimeline({ ...base, status: 'refunded', refundedAmount: 20, resolvedAt: '2026-10-12T09:00:00Z' }, 'Braids by Amara');
    expect(steps.map(s => `${s.title}:${s.state}`)).toEqual(['Refund requested:done', 'Refunded:done']);
    expect(steps[1]?.detail).toContain('£20.00');
  });

  it('keeps the review step after a passed-on request is refunded', () => {
    expect(shape({ ...base, status: 'refunded', passedToCervicedAt: '2026-10-11T09:00:00Z', refundedAmount: 5 }))
      .toEqual(['Refund requested:done', 'Under review by Cerviced:done', 'Refunded:done']);
  });

  it("ends declined with Cerviced's note, or a plain fallback", () => {
    const withNote = describeRefundRequestTimeline({ ...base, status: 'declined', passedToCervicedAt: '2026-10-11T09:00:00Z', outcomeNote: 'Policy applied.' }, 'Braids by Amara');
    expect(withNote[withNote.length - 1]).toMatchObject({ title: 'Not refunded', state: 'declined', detail: 'Policy applied.' });
    const fallback = describeRefundRequestTimeline({ ...base, status: 'declined' }, 'Braids by Amara');
    expect(fallback[fallback.length - 1]?.detail).toMatch(/isn't refunding it/);
  });

  it('only counts waiting requests as open', () => {
    expect(isRefundRequestOpen({ status: 'with_provider' })).toBe(true);
    expect(isRefundRequestOpen({ status: 'under_review' })).toBe(true);
    expect(isRefundRequestOpen({ status: 'refunded' })).toBe(false);
    expect(isRefundRequestOpen({ status: 'declined' })).toBe(false);
  });
});
