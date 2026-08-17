import {
  formatNoticeWindow,
  isLongBookingInfoPack,
} from '../features/bookings/clientBookingPresentation';

describe('client booking presentation', () => {
  it('uses concise, readable notice windows', () => {
    expect(formatNoticeWindow(24)).toBe('24 hours');
    expect(formatNoticeWindow(96)).toBe('4 days');
  });

  it('uses a full-screen reader for substantial info packs', () => {
    expect(isLongBookingInfoPack({ title: 'Prep', content: 'x'.repeat(237) } as never)).toBe(true);
    expect(isLongBookingInfoPack({ title: 'Prep', content: 'Bring a photo.' } as never)).toBe(false);
  });
});
