// A client cannot be in two places at once — and until now nothing checked.
//
// bookings_no_overlap keys on provider_id, so it stops a PROVIDER being
// double-booked and is silent about the client. AvailabilityService.isSlotAvailable
// asks whether the provider is free. And the cart's own cross-check used to bail
// out unless two items shared a provider. So Provider A at 2pm and Provider B at
// 2:30pm was legal to every layer in the app.
jest.mock('../services/databaseService', () => ({
  __esModule: true,
  getBookableServiceIds: jest.fn(),
  getMyUpcomingBookedSpans: jest.fn(),
  getAvailabilityDateBundle: jest.fn(),
  getAvailabilityEmergencyPolicyRow: jest.fn(),
  getAvailabilityDateExceptions: jest.fn(),
  getAvailabilityNoticeSettings: jest.fn(),
  getAvailabilityProviderCore: jest.fn(),
  getAvailabilityServiceBufferRows: jest.fn(),
  getAvailabilityWeeklyScheduleRows: jest.fn(),
  getProviderBusySpans: jest.fn(),
  getProviderBookingWindowDays: jest.fn(),
  resolveActiveProviderIdByDisplayName: jest.fn(),
}));

const DAY = '2026-09-01';

function load() {
  const db = require('../services/databaseService');
  db.getBookableServiceIds.mockResolvedValue(new Set());
  db.getMyUpcomingBookedSpans.mockResolvedValue([]);
  const { AvailabilityService } = require('../services/AvailabilityService');
  jest.spyOn(AvailabilityService, 'isSlotAvailable').mockResolvedValue({ hasConflict: false });
  return { db, AvailabilityService };
}

describe('two providers, one client, same hour', () => {
  beforeEach(() => jest.resetModules());

  it('flags an overlap between two DIFFERENT providers in one cart', async () => {
    const { AvailabilityService } = load();

    const result = await AvailabilityService.validateCartBookings([
      { providerName: 'Nails by Mia', date: DAY, time: '2:00 PM', duration: '1h', cartItemId: 'a' },
      { providerName: 'Brows by Sam', date: DAY, time: '2:30 PM', duration: '1h', cartItemId: 'b' },
    ]);

    expect(result.isValid).toBe(false);
    // Named, not "another service in your cart" — the cart collapses by
    // provider, so the clashing item can be behind a closed section.
    expect(result.conflicts.map((c: { message: string }) => c.message).join(' '))
      .toMatch(/Brows by Sam|Nails by Mia/);
  });

  it('still allows two non-overlapping appointments on the same day', async () => {
    const { AvailabilityService } = load();

    const result = await AvailabilityService.validateCartBookings([
      { providerName: 'Nails by Mia', date: DAY, time: '10:00 AM', duration: '1h', cartItemId: 'a' },
      { providerName: 'Brows by Sam', date: DAY, time: '2:00 PM', duration: '1h', cartItemId: 'b' },
    ]);

    expect(result.isValid).toBe(true);
  });

  it('flags a cart item that overlaps an appointment the client ALREADY has', async () => {
    const { db, AvailabilityService } = load();
    db.getMyUpcomingBookedSpans.mockResolvedValue([
      {
        booking_date: DAY,
        booking_time: '14:00',
        end_time: '15:00',
        provider_name_snapshot: 'Lashes by Jo',
        service_name_snapshot: 'Infills',
      },
    ]);

    const result = await AvailabilityService.validateCartBookings([
      { providerName: 'Nails by Mia', date: DAY, time: '2:30 PM', duration: '1h', cartItemId: 'a' },
    ]);

    expect(result.isValid).toBe(false);
    expect(result.conflicts[0].message).toContain('Lashes by Jo');
    expect(result.conflicts[0].message).toContain('Infills');
  });

  it('fails OPEN when the diary lookup errors', async () => {
    const { db, AvailabilityService } = load();
    db.getMyUpcomingBookedSpans.mockRejectedValue(new Error('network'));

    const result = await AvailabilityService.validateCartBookings([
      { providerName: 'Nails by Mia', date: DAY, time: '2:30 PM', duration: '1h', cartItemId: 'a' },
    ]);

    // A hiccup must not invent a clash and block a legitimate checkout. There
    // is no DB backstop for this one, so the tradeoff is deliberate: a missed
    // check beats a false block.
    expect(result.isValid).toBe(true);
  });

  it('asks for the client diary ONCE for the whole cart, not per item', async () => {
    const { db, AvailabilityService } = load();

    await AvailabilityService.validateCartBookings([
      { providerName: 'A', date: DAY, time: '9:00 AM', duration: '30m', cartItemId: 'a' },
      { providerName: 'B', date: '2026-09-03', time: '9:00 AM', duration: '30m', cartItemId: 'b' },
      { providerName: 'C', date: '2026-09-05', time: '9:00 AM', duration: '30m', cartItemId: 'c' },
    ]);

    expect(db.getMyUpcomingBookedSpans).toHaveBeenCalledTimes(1);
    // Bounded to the days the cart actually touches.
    expect(db.getMyUpcomingBookedSpans).toHaveBeenCalledWith(DAY, '2026-09-05');
  });
});
