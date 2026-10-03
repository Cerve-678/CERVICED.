import { withoutReplacedCancellations } from '../features/bookings/timelineBookings';
import { BookingStatus } from '../types/booking';

type B = { id: string; status: BookingStatus; bookingDate: string; start: number; end: number };
const span = (b: B) => ({ start: b.start, end: b.end });
const b = (id: string, status: BookingStatus, start: number, end: number, bookingDate = '2026-10-04'): B =>
  ({ id, status, bookingDate, start, end });

describe('withoutReplacedCancellations', () => {
  it('keeps a cancelled booking while its time is still free', () => {
    const list = [b('c', BookingStatus.CANCELLED, 600, 660), b('x', BookingStatus.UPCOMING, 720, 780)];
    expect(withoutReplacedCancellations(list, span).map(x => x.id)).toEqual(['c', 'x']);
  });

  it('drops it once any live booking overlaps that time', () => {
    const list = [b('c', BookingStatus.CANCELLED, 600, 660), b('new', BookingStatus.PENDING, 630, 690)];
    expect(withoutReplacedCancellations(list, span).map(x => x.id)).toEqual(['new']);
  });

  it('treats back-to-back as not overlapping, and other days as unrelated', () => {
    const list = [
      b('c', BookingStatus.CANCELLED, 600, 660),
      b('after', BookingStatus.UPCOMING, 660, 720),
      b('otherDay', BookingStatus.UPCOMING, 600, 660, '2026-10-05'),
    ];
    expect(withoutReplacedCancellations(list, span).map(x => x.id)).toEqual(['c', 'after', 'otherDay']);
  });

  it('never lets one cancellation replace another', () => {
    const list = [b('c1', BookingStatus.CANCELLED, 600, 660), b('c2', BookingStatus.CANCELLED, 600, 660)];
    expect(withoutReplacedCancellations(list, span).map(x => x.id)).toEqual(['c1', 'c2']);
  });
});
