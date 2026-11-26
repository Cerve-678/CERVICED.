import { readFileSync } from 'fs';
import { join } from 'path';
import { isPayoutOwed, PROVIDER_NO_SHOW_REFUND_REASON } from '../../supabase/functions/_shared/payableBooking';

const REPO = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(REPO, path), 'utf8');

// A client's "Provider didn't turn up" report marks the booking
// provider_no_show and opens a refund request. If Cerviced declines it, the
// provider did turn up and is owed their payout. Before 26 November nothing
// paid them: release-payouts only paid confirmed/completed bookings, so the
// money stayed with Cerviced. The booking keeps its status (owner's call), so
// the client gets no review prompt, points or reminders.
describe('who is owed a held payout', () => {
  it('pays confirmed and completed bookings', () => {
    expect(isPayoutOwed('confirmed')).toBe(true);
    expect(isPayoutOwed('completed')).toBe(true);
  });

  it('pays a provider no-show only once Cerviced declined the refund request', () => {
    expect(isPayoutOwed('provider_no_show', 'declined')).toBe(true);
    expect(isPayoutOwed('provider_no_show')).toBe(false);
    expect(isPayoutOwed('provider_no_show', null)).toBe(false);
    expect(isPayoutOwed('provider_no_show', 'refunded')).toBe(false);
    expect(isPayoutOwed('provider_no_show', 'with_provider')).toBe(false);
    expect(isPayoutOwed('provider_no_show', 'under_review')).toBe(false);
  });

  it('never pays a cancelled, client no-show, pending or missing booking', () => {
    for (const status of ['cancelled', 'no_show', 'pending', 'on_hold', null, undefined]) {
      expect(isPayoutOwed(status, 'declined')).toBe(false);
    }
  });

  it("matches the app's refund reason word for word", () => {
    // client_mark_provider_no_show files the same text (20261126170000, #823).
    expect(read('src/features/bookings/bookingSupportRequest.ts')).toContain(`"${PROVIDER_NO_SHOW_REFUND_REASON}"`);
  });

  it('is the rule release-payouts applies', () => {
    const fn = read('supabase/functions/release-payouts/index.ts');
    expect(fn).toContain('isPayoutOwed(booking.status, latestNoShowRequest.get(row.booking_id))');
    expect(fn).not.toContain('PAYABLE_BOOKING_STATUSES.includes');
  });
});
