import { BookingStatus } from '../types/booking';
import { canDisputeNoShow, NO_SHOW_DISPUTE_WINDOW_DAYS } from '../types/booking';

const DAY = 86400000;
const NOW = new Date('2026-08-27T12:00:00Z').getTime();
const iso = (ms: number) => new Date(ms).toISOString();

describe('canDisputeNoShow', () => {
  it('offers the dispute to the party the no-show was recorded against', () => {
    expect(
      canDisputeNoShow(
        { status: BookingStatus.NO_SHOW, noShowMarkedAt: iso(NOW - DAY) },
        BookingStatus.NO_SHOW,
        NOW,
      ),
    ).toBe(true);
  });

  it('does not offer the client a dispute for the accusation they made', () => {
    // A client viewing a booking they marked PROVIDER_NO_SHOW on. Their screen
    // asks about NO_SHOW; the statuses don't match, so there's no button.
    expect(
      canDisputeNoShow(
        { status: BookingStatus.PROVIDER_NO_SHOW, noShowMarkedAt: iso(NOW - DAY) },
        BookingStatus.NO_SHOW,
        NOW,
      ),
    ).toBe(false);
  });

  it('offers the provider a dispute for a provider no-show', () => {
    expect(
      canDisputeNoShow(
        { status: BookingStatus.PROVIDER_NO_SHOW, noShowMarkedAt: iso(NOW - DAY) },
        BookingStatus.PROVIDER_NO_SHOW,
        NOW,
      ),
    ).toBe(true);
  });

  it('closes once the window has passed', () => {
    const justInside = NOW - NO_SHOW_DISPUTE_WINDOW_DAYS * DAY + 1000;
    const justOutside = NOW - NO_SHOW_DISPUTE_WINDOW_DAYS * DAY - 1000;
    expect(
      canDisputeNoShow({ status: BookingStatus.NO_SHOW, noShowMarkedAt: iso(justInside) }, BookingStatus.NO_SHOW, NOW),
    ).toBe(true);
    expect(
      canDisputeNoShow({ status: BookingStatus.NO_SHOW, noShowMarkedAt: iso(justOutside) }, BookingStatus.NO_SHOW, NOW),
    ).toBe(false);
  });

  it('will not offer a second dispute', () => {
    expect(
      canDisputeNoShow(
        { status: BookingStatus.NO_SHOW, noShowMarkedAt: iso(NOW - DAY), noShowDisputedAt: iso(NOW - 3600000) },
        BookingStatus.NO_SHOW,
        NOW,
      ),
    ).toBe(false);
  });

  it('treats a booking with no mark timestamp as still disputable', () => {
    // Marked before the dispute columns existed, or read from a source that
    // doesn't carry them. dispute_no_show() makes the same allowance — a
    // person should not lose the right to answer because of when the row was
    // written.
    expect(
      canDisputeNoShow({ status: BookingStatus.NO_SHOW }, BookingStatus.NO_SHOW, NOW),
    ).toBe(true);
    expect(
      canDisputeNoShow({ status: BookingStatus.NO_SHOW, noShowMarkedAt: 'not-a-date' }, BookingStatus.NO_SHOW, NOW),
    ).toBe(true);
  });

  it('offers nothing on a booking that is not a no-show at all', () => {
    expect(
      canDisputeNoShow({ status: BookingStatus.COMPLETED }, BookingStatus.NO_SHOW, NOW),
    ).toBe(false);
    expect(canDisputeNoShow({}, BookingStatus.NO_SHOW, NOW)).toBe(false);
  });
});
