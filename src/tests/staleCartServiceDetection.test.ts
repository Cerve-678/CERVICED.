import { CART_ISSUE } from '../features/cart/presentation';

// A cart persists across sessions, so an item can outlive the service it was
// added from — deleted, withdrawn by its provider, or its provider
// unpublished. Nothing downstream catches that kindly: hold_cart_booking_slots
// hits bookings_service_id_fkey and fails the WHOLE batch with a raw 23503.
// These pin the two halves of the fix: the item is named before checkout, and
// the failure that slips past is never reported as retryable.
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
}));

const LIVE = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const GONE = 'e44f0097-3cf6-44fa-b27a-ea030fb4ef77';

describe('a cart item whose service no longer exists', () => {
  beforeEach(() => jest.resetModules());

  it('names the stale item rather than blaming the whole cart', async () => {
    const db = require('../services/databaseService');
    // The services_public_read RLS policy already filters to bookable rows, so
    // an id simply missing from the result covers all three ways to go stale.
    db.getBookableServiceIds.mockResolvedValue(new Set([LIVE]));

    const { AvailabilityService } = require('../services/AvailabilityService');
    const spy = jest
      .spyOn(AvailabilityService, 'isSlotAvailable')
      .mockResolvedValue({ hasConflict: false });

    const result = await AvailabilityService.validateCartBookings([
      { providerName: 'p', date: '2026-09-01', time: '10:00 AM', duration: '1h', cartItemId: 'ok', serviceId: LIVE },
      { providerName: 'p', date: '2026-09-01', time: '2:00 PM', duration: '1h', cartItemId: 'stale', serviceId: GONE },
    ]);

    expect(result.isValid).toBe(false);
    expect(result.conflicts.map((c: { cartItemId: string }) => c.cartItemId)).toEqual(['stale']);
    expect(result.conflicts[0].message).toBe(CART_ISSUE.serviceUnavailable);

    // The stale item is reported once, for the reason that actually blocks it
    // — a slot check on a service that no longer exists would only add a
    // second, less useful reason.
    expect(spy.mock.calls.every(call => call[4] !== GONE)).toBe(true);
  });

  it('fails open when the lookup itself fails, rather than flagging everything', async () => {
    const db = require('../services/databaseService');
    db.getBookableServiceIds.mockRejectedValue(new Error('network'));

    const { AvailabilityService } = require('../services/AvailabilityService');
    jest.spyOn(AvailabilityService, 'isSlotAvailable').mockResolvedValue({ hasConflict: false });

    const result = await AvailabilityService.validateCartBookings([
      { providerName: 'p', date: '2026-09-01', time: '10:00 AM', duration: '1h', cartItemId: 'a', serviceId: LIVE },
      { providerName: 'p', date: '2026-09-01', time: '2:00 PM', duration: '1h', cartItemId: 'b', serviceId: GONE },
    ]);

    // A network hiccup must not tell a client every service was withdrawn.
    // The foreign key is still the real backstop.
    expect(result.isValid).toBe(true);
    expect(result.conflicts).toEqual([]);
  });
});
