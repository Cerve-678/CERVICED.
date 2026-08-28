import { BookingService, DEPOSIT_PERCENTAGE, ServiceBookingData } from '../services/bookingService';
import type { CartItem } from '../contexts/CartContext';

// Regression test for the 2026-08-28 cart audit blocker: every deposit
// booking silently used BookingService's legacy 20% fallback because nothing
// upstream (CartScreen's bookingsByItemId) threaded the provider's actual
// fetched depositPolicy into ServiceBookingData. createAppointmentData itself
// already preferred booking.depositPolicy when present — the bug was that it
// was never present. This locks that contract in from the bookingService side
// so it can't regress silently again.

function makeItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: 'item-1',
    providerName: 'Aestheticsby N',
    providerDisplayName: 'Aestheticsby N',
    providerImage: null,
    providerService: 'AESTHETICS',
    serviceName: 'Lip Filler',
    serviceDescription: '',
    price: 50,
    duration: '30 mins',
    quantity: 1,
    serviceId: 'svc-1',
    addedAt: new Date().toISOString(),
    ...overrides,
  };
}

const customerInfo = { name: 'Client', email: 'client@example.com', phone: '' };

describe('BookingService.createAppointmentData — deposit policy', () => {
  it('books the provider\'s actual fixed deposit, not the legacy 20% fallback', () => {
    const item = makeItem();
    const bookings: Record<string, ServiceBookingData> = {
      'item-1': {
        selectedDate: '2026-09-01',
        selectedTime: '10:00',
        notes: '',
        isDepositOnly: true,
        // Provider's real policy: a flat £30 deposit on a £50 service —
        // deliberately NOT 20% (£10), so a regression back to the fallback
        // is caught rather than coincidentally matching.
        depositPolicy: { type: 'fixed', amount: 30 },
      },
    };

    const [appointment] = BookingService.createAppointmentData([item], bookings, customerInfo);

    expect(appointment!.paymentType).toBe('deposit');
    expect(appointment!.depositAmount).toBe(30);
    expect(appointment!.remainingBalance).toBe(20);
  });

  it('books the provider\'s actual percentage deposit when that is their policy', () => {
    const item = makeItem({ price: 100 });
    const bookings: Record<string, ServiceBookingData> = {
      'item-1': {
        selectedDate: '2026-09-01',
        selectedTime: '10:00',
        notes: '',
        isDepositOnly: true,
        depositPolicy: { type: 'percentage', amount: 35 },
      },
    };

    const [appointment] = BookingService.createAppointmentData([item], bookings, customerInfo);

    expect(appointment!.depositAmount).toBe(35);
    expect(appointment!.remainingBalance).toBe(65);
  });

  it('falls back to the legacy 20% only when no depositPolicy was supplied at all', () => {
    const item = makeItem({ price: 100 });
    const bookings: Record<string, ServiceBookingData> = {
      'item-1': {
        selectedDate: '2026-09-01',
        selectedTime: '10:00',
        notes: '',
        isDepositOnly: true,
        // No depositPolicy — the provider genuinely has none fetched.
      },
    };

    const [appointment] = BookingService.createAppointmentData([item], bookings, customerInfo);

    expect(appointment!.depositAmount).toBe(DEPOSIT_PERCENTAGE);
  });
});
