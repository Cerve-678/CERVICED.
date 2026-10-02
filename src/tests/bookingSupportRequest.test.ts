jest.mock('../services/databaseService', () => ({
  invokeSendSupportRequest: jest.fn(async () => ({ ticketNumber: 1042, notified: true })),
}));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.0' } }));

import { invokeSendSupportRequest } from '../services/databaseService';
import {
  buildBookingSupportDescription,
  canRequestRefund,
  fileBookingSupportRequest,
} from '../features/bookings/bookingSupportRequest';
import { PaymentStatus, type ConfirmedBooking } from '../types/booking';

const booking = {
  id: 'b-1',
  bookingRef: 'CRV-7K2P',
  serviceName: 'Knotless braids',
  providerName: 'Braids by Amara',
  bookingDate: '2026-10-04',
  bookingTime: '10:00',
  status: 'completed',
  paymentStatus: PaymentStatus.PAID_IN_FULL,
} as unknown as ConfirmedBooking;

describe('canRequestRefund', () => {
  it('allows a refund request only for money paid through the app', () => {
    expect(canRequestRefund({ paymentStatus: PaymentStatus.DEPOSIT_PAID })).toBe(true);
    expect(canRequestRefund({ paymentStatus: PaymentStatus.PAID_IN_FULL })).toBe(true);
    expect(canRequestRefund({ paymentStatus: PaymentStatus.PENDING })).toBe(false);
    expect(canRequestRefund({ paymentStatus: PaymentStatus.REFUND_PENDING })).toBe(false);
    expect(canRequestRefund({ paymentStatus: PaymentStatus.REFUNDED })).toBe(false);
    expect(canRequestRefund({ paymentStatus: PaymentStatus.FAILED })).toBe(false);
  });
});

describe('fileBookingSupportRequest', () => {
  it('files a refund request under a category send-support-request accepts', async () => {
    const result = await fileBookingSupportRequest(booking, 'refund', '  Service was cut short  ', 'client');
    expect(result).toEqual({ ticketNumber: 1042 });
    const input = (invokeSendSupportRequest as jest.Mock).mock.calls[0][0];
    expect(input.category).toBe('Payment');
    expect(input.activeMode).toBe('client');
    expect(input.description).toContain('REFUND REQUEST');
    expect(input.description).toContain('Booking id: b-1');
    expect(input.description).toMatch(/Service was cut short$/);
  });

  it('files a complaint as a provider issue', async () => {
    (invokeSendSupportRequest as jest.Mock).mockClear();
    await fileBookingSupportRequest(booking, 'complaint', 'Late by an hour', 'client');
    expect((invokeSendSupportRequest as jest.Mock).mock.calls[0][0].category).toBe('Provider Issue');
  });

  it('throws when the ticket fails, since the ticket is the whole record', async () => {
    (invokeSendSupportRequest as jest.Mock).mockRejectedValueOnce(new Error('down'));
    await expect(fileBookingSupportRequest(booking, 'complaint', 'x', 'client')).rejects.toThrow('down');
  });

  it('leads the description with the kind and booking reference', () => {
    const d = buildBookingSupportDescription(booking, 'complaint', 'x');
    expect(d.split('\n')[0]).toMatch(/^COMPLAINT — /);
  });
});
