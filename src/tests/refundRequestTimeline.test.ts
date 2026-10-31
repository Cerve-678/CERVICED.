import { readFileSync } from 'fs';
import { join } from 'path';
import { describeRefundRequestTimeline, isRefundRequestOpen, refundReplyDeadline } from '../features/bookings/refundRequestTimeline';
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
  passedAutomatically: false,
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

  it("speaks to the provider in the Issue a refund sheet, without the client's 'you'", () => {
    const provider = (r: RefundRequest) => describeRefundRequestTimeline(r, null, 'provider');
    expect(provider(base).map(s => `${s.title}:${s.state}`)).toEqual(['Refund requested:done', 'With you:current', 'Outcome:upcoming']);
    const review = provider({ ...base, status: 'under_review', passedToCervicedAt: '2026-10-11T09:00:00Z' });
    expect(review[1]?.detail).toMatch(/^You passed it to Cerviced/);
    const refunded = provider({ ...base, status: 'refunded', refundedAmount: 20 });
    expect(refunded[1]?.detail).toBe('£20.00 went back to the client.');
  });
});

describe('the 3-day reply deadline', () => {
  it('goes to Cerviced 3 days after the client asked', () => {
    expect(refundReplyDeadline('2026-10-10T09:00:00Z')).toBe('2026-10-13T09:00:00.000Z');
    expect(refundReplyDeadline('not a date')).toBeNull();
  });

  it('tells both sides the date while it is with the provider', () => {
    const client = describeRefundRequestTimeline(base, 'Braids by Amara');
    const provider = describeRefundRequestTimeline(base, 'Braids by Amara', 'provider');
    expect(client[1]?.detail).toMatch(/If they haven't replied by .+, it comes to Cerviced\./);
    expect(provider[1]?.detail).toMatch(/If you haven't by .+, it goes to Cerviced\./);
  });

  it('says the provider did not reply, not that they passed it on', () => {
    const r: RefundRequest = { ...base, status: 'under_review', passedToCervicedAt: '2026-10-13T09:25:00Z', passedAutomatically: true };
    expect(describeRefundRequestTimeline(r, 'Braids by Amara')[1]?.detail).toBe("Braids by Amara didn't reply within 3 days, so we're reviewing it against their policy.");
    expect(describeRefundRequestTimeline(r, 'Braids by Amara', 'provider')[1]?.detail).toMatch(/^You didn't reply within 3 days/);
  });

  it('matches the hourly job: reminder at 2 days, Cerviced at 3', () => {
    const sql = readFileSync(join(__dirname, '..', '..', 'supabase/migrations/20261031201000_refund_request_reply_deadline.sql'), 'utf8');
    expect(sql).toMatch(/created_at <= now\(\) - interval '2 days'/);
    expect(sql).toMatch(/created_at <= now\(\) - interval '3 days';/);
    expect(sql).toMatch(/GRANT SELECT \(passed_automatically\) ON public\.refund_requests TO authenticated/);
  });
});
