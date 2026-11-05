import {
  clientBookingStatusLabel,
  formatBookingTimeRange,
  formatNoticePhrase,
  formatNoticeWindow,
  isLongBookingInfoPack,
} from '../features/bookings/clientBookingPresentation';
import { BookingStatus } from '../types/booking';

describe('client booking presentation', () => {
  it('uses concise, readable notice windows', () => {
    expect(formatNoticeWindow(24)).toBe('24 hours');
    expect(formatNoticeWindow(96)).toBe('4 days');
  });

  it("puts the apostrophe in the right place for notice", () => {
    expect(formatNoticePhrase(24)).toBe("24 hours' notice");
    expect(formatNoticePhrase(1)).toBe("1 hour's notice");
    expect(formatNoticePhrase(96)).toBe("4 days' notice");
  });

  it('uses a full-screen reader for substantial info packs', () => {
    expect(isLongBookingInfoPack({ title: 'Prep', content: 'x'.repeat(237) } as never)).toBe(true);
    expect(isLongBookingInfoPack({ title: 'Prep', content: 'Bring a photo.' } as never)).toBe(false);
  });
});

describe('client booking status and time wording', () => {
  it('never shows a raw status code', () => {
    expect(clientBookingStatusLabel({ status: BookingStatus.PROVIDER_NO_SHOW })).toBe("Provider didn't turn up");
    expect(clientBookingStatusLabel({ status: BookingStatus.NO_SHOW })).toBe('Marked as missed');
    expect(clientBookingStatusLabel({ status: BookingStatus.IN_PROGRESS })).toBe('Happening now');
    expect(clientBookingStatusLabel({ status: BookingStatus.PENDING })).toBe('Request sent');
    for (const s of Object.values(BookingStatus)) {
      expect(clientBookingStatusLabel({ status: s })).not.toMatch(/_/);
    }
  });

  it('says where a reschedule is up to', () => {
    expect(clientBookingStatusLabel({ status: BookingStatus.UPCOMING, isPendingReschedule: true })).toBe('Waiting on a new time');
    expect(clientBookingStatusLabel({ status: BookingStatus.UPCOMING, isPendingReschedule: true, newTimesOffered: true })).toBe('New times offered');
  });

  it('shows the appointment as a start-to-end range', () => {
    expect(formatBookingTimeRange('2:30 PM', '3:30 PM')).toBe('2:30 PM to 3:30 PM');
    expect(formatBookingTimeRange('2:30 PM', '2:30 PM')).toBe('2:30 PM');
    expect(formatBookingTimeRange('2:30 PM', undefined)).toBe('2:30 PM');
  });
});
