import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.join(__dirname, '..', 'screens', 'provider', 'ProviderMyProfileScreen.tsx'),
  'utf8',
);

describe('Today and upcoming cards', () => {
  it('open the booking in the format the detail screen reads', () => {
    expect(source).toContain(
      "navigation.navigate('BookingDetail', { bookingId: booking.id, booking: mapDbBookingToConfirmed(booking) })",
    );
  });
});
