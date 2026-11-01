import type { CartItem } from '../contexts/CartContext';
import { BookingService, type ServiceBookingData } from '../services/bookingService';

function item(id: string, price: number): CartItem {
  return {
    id,
    providerName: `Provider ${id}`,
    providerImage: null,
    providerService: 'Beauty',
    serviceName: `Service ${id}`,
    serviceDescription: '',
    price,
    duration: '60 min',
    quantity: 1,
    serviceId: `service-${id}`,
    addedAt: '2026-11-01T10:00:00.000Z',
  };
}

const slot = { selectedDate: '2026-11-20', selectedTime: '10:00', notes: '' };
const customer = { name: 'Amy', email: 'amy@example.com', phone: '07700900000' };

describe('checkout fee split', () => {
  it('bases the fee on what the card is charged and gives the deposit booking its share', () => {
    const bookings: Record<string, ServiceBookingData> = {
      a: { ...slot },
      b: { ...slot, isDepositOnly: true, depositPolicy: { type: 'fixed', amount: 60 } },
    };
    const [full, deposit] = BookingService.createAppointmentData(
      [item('a', 120), item('b', 300)], bookings, customer,
    );
    if (!full || !deposit) throw new Error('expected two appointments');

    // £120 + £60 deposit = £180 charged -> fee £9.40, split 120:60.
    expect(full.serviceCharge).toBe(6.27);
    expect(deposit.serviceCharge).toBe(3.13);
    expect(full.serviceCharge + deposit.serviceCharge).toBeCloseTo(9.4, 10);

    expect(full.amountPaid).toBe(126.27);
    expect(full.remainingBalance).toBe(0);
    // The deposit itself is never reduced: £60 + its fee share; £240 is paid in person.
    expect(deposit.depositAmount).toBe(60);
    expect(deposit.amountPaid).toBe(63.13);
    expect(deposit.remainingBalance).toBe(240);
  });

  it('charges a deposit-only booking on the deposit, not the full price', () => {
    const [only] = BookingService.createAppointmentData(
      [item('c', 400)], { c: { ...slot, isDepositOnly: true, depositPolicy: { type: 'percentage', amount: 20 } } }, customer,
    );
    if (!only) throw new Error('expected one appointment');
    expect(only.depositAmount).toBe(80);
    expect(only.serviceCharge).toBe(4.4);
    expect(only.amountPaid).toBe(84.4);
    expect(only.remainingBalance).toBe(320);
  });
});
