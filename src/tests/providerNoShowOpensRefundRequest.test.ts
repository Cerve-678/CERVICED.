import { readFileSync } from 'fs';
import { join } from 'path';

const REPO = join(__dirname, '..', '..');
const SCREEN = readFileSync(join(REPO, 'src/screens/client/BookingDetailScreen.tsx'), 'utf8');
const MIGRATION = readFileSync(join(REPO, 'supabase/migrations/20261126170000_provider_no_show_opens_refund_request.sql'), 'utf8');

// A client whose provider never came used to have two buttons after the start
// time: Cancel (charged the late-cancel fee) and the no-show report (which
// stopped the provider's payout but refunded nobody). The owner's call,
// 26 November 2026: Cancel goes once the appointment has started, and the
// report asks the provider for a refund.
describe('reporting that the provider did not turn up', () => {
  const start = SCREEN.indexOf('{/* Action Buttons */}');
  const actions = SCREEN.slice(start, SCREEN.indexOf('{booking.isPendingReschedule && (', start));

  it('replaces Cancel once the start time has passed', () => {
    expect(actions).toContain('{!hasStarted && (');
    expect(actions.indexOf('{!hasStarted && (')).toBeLessThan(actions.indexOf("tr('common.cancel')"));
    expect(actions).toContain('{canMarkProviderNoShow && (');
    expect(actions).toContain("tr('clientBooking.detail.providerNoShow')");
  });

  it('tells a client who paid in the app that the provider will be asked for a refund', () => {
    expect(SCREEN).toContain("tr('clientBooking.detail.providerNoShowSubRefund'");
    expect(SCREEN).toContain("tr('clientBooking.detail.noShowReportedRefund'");
    expect(SCREEN).toContain('setRefundRequestsNonce(n => n + 1)');
  });

  it('opens the refund request in the same call, only for a booking paid in the app', () => {
    expect(MIGRATION).toContain("PERFORM public.request_booking_refund(p_booking_id, 'The provider didn''t turn up', NULL);");
    expect(MIGRATION).toContain("v_payment_status IN ('deposit_paid', 'fully_paid', 'partially_refunded')");
  });

  it('reads the day and the start time in UK time', () => {
    expect(MIGRATION).toContain("(now() AT TIME ZONE 'Europe/London')");
    expect(MIGRATION).not.toContain('CURRENT_DATE');
  });
});
