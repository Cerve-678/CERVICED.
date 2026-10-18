jest.mock('../services/databaseService', () => ({
  invokeSendSupportRequest: jest.fn(async () => ({ ticketNumber: 1042, notified: true })),
  requestBookingRefund: jest.fn(async () => 'rr-1'),
  passRefundRequestToCerviced: jest.fn(async () => undefined),
}));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.0' } }));
jest.mock('../utils/logger', () => ({ logger: { error: jest.fn() } }));

import { invokeSendSupportRequest, passRefundRequestToCerviced, requestBookingRefund } from '../services/databaseService';
import {
  buildBookingSupportDescription,
  describeRefundScope,
  fileBookingSupportRequest,
  getRefundRequestScope,
  isSupportRequestReady,
  OTHER_SUPPORT_REASON,
  passRefundRequestOn,
  SUPPORT_REASONS,
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

describe('getRefundRequestScope', () => {
  it('treats only money paid through the app as something Cerviced can review', () => {
    expect(getRefundRequestScope({ paymentStatus: PaymentStatus.DEPOSIT_PAID })).toBe('in_app');
    expect(getRefundRequestScope({ paymentStatus: PaymentStatus.PAID_IN_FULL })).toBe('in_app');
    expect(getRefundRequestScope({ paymentStatus: PaymentStatus.PARTIALLY_REFUNDED })).toBe('in_app');
    expect(getRefundRequestScope({ paymentStatus: PaymentStatus.PENDING })).toBe('off_app');
    expect(getRefundRequestScope({ paymentStatus: PaymentStatus.FAILED })).toBe('off_app');
    expect(getRefundRequestScope({ paymentStatus: PaymentStatus.REFUND_PENDING })).toBe('settled');
    expect(getRefundRequestScope({ paymentStatus: PaymentStatus.REFUNDED })).toBe('settled');
  });
});

describe('describeRefundScope', () => {
  const base = { providerName: 'Braids by Amara', amountPaid: 20, remainingBalance: 60 };

  it('tells an off-app client it is between them and the provider', () => {
    const { title, lines } = describeRefundScope({ ...base, paymentStatus: PaymentStatus.PENDING, paymentType: 'full', amountPaid: 0 });
    expect(title).toBe('Not paid through Cerviced');
    expect(lines.join(' ')).toContain('between you and Braids by Amara');
  });

  it('limits a deposit request to the deposit, and says a broken policy stands', () => {
    const { lines } = describeRefundScope({ ...base, paymentStatus: PaymentStatus.DEPOSIT_PAID, paymentType: 'deposit' });
    expect(lines[0]).toContain('£20.00 deposit');
    expect(lines[0]).toContain('£60.00 balance due at the appointment is between you and Braids by Amara');
    expect(lines[1]).toMatch(/cancelled late, didn't turn up, or rescheduled late/);
    expect(lines[1]).toContain("Cerviced won't overturn it");
  });

  it('still says a broken policy stands for a full in-app payment', () => {
    const { lines } = describeRefundScope({ ...base, paymentStatus: PaymentStatus.PAID_IN_FULL, paymentType: 'full', remainingBalance: 0 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^Braids by Amara can keep some or all/);
  });
});

describe('fileBookingSupportRequest', () => {
  beforeEach(() => jest.clearAllMocks());

  it('records a refund request (telling the provider) before filing its ticket', async () => {
    const result = await fileBookingSupportRequest(booking, 'refund', 'The provider cancelled', '  Service was cut short  ', 'client');
    expect(result).toEqual({ ticketNumber: 1042 });
    expect(requestBookingRefund).toHaveBeenCalledWith('b-1', 'The provider cancelled', 'Service was cut short');
    const input = (invokeSendSupportRequest as jest.Mock).mock.calls[0][0];
    expect(input.refundRequestId).toBe('rr-1');
    expect(input.category).toBe('Payment');
    expect(input.activeMode).toBe('client');
    expect(input.description).toContain('REFUND REQUEST');
    expect(input.description).toContain('Booking id: b-1');
    expect(input.description).toContain('Reason: The provider cancelled');
    expect(input.description).toMatch(/Service was cut short$/);
  });

  it('files a complaint as a provider issue, and never as a refund request the provider sees', async () => {
    await fileBookingSupportRequest(booking, 'complaint', 'Lateness or a no-show', 'Late by an hour', 'client');
    const input = (invokeSendSupportRequest as jest.Mock).mock.calls[0][0];
    expect(input.category).toBe('Provider Issue');
    expect(input.refundRequestId).toBeUndefined();
    expect(requestBookingRefund).not.toHaveBeenCalled();
  });

  it('throws when a complaint ticket fails, since the ticket is the whole record', async () => {
    (invokeSendSupportRequest as jest.Mock).mockRejectedValueOnce(new Error('down'));
    await expect(fileBookingSupportRequest(booking, 'complaint', 'Hygiene or safety', 'x', 'client')).rejects.toThrow('down');
  });

  it('does not report a recorded refund request as failed when only its ticket fails', async () => {
    (invokeSendSupportRequest as jest.Mock).mockRejectedValueOnce(new Error('down'));
    await expect(fileBookingSupportRequest(booking, 'refund', 'The provider cancelled', '', 'client')).resolves.toEqual({ ticketNumber: null });
  });

  it('throws, and files no ticket, when the refund request itself is refused', async () => {
    (requestBookingRefund as jest.Mock).mockRejectedValueOnce(new Error('You already have a refund request open for this booking.'));
    await expect(fileBookingSupportRequest(booking, 'refund', 'The provider cancelled', '', 'client')).rejects.toThrow('already have');
    expect(invokeSendSupportRequest).not.toHaveBeenCalled();
  });

  it('leads the description with the kind and booking reference', () => {
    const d = buildBookingSupportDescription(booking, 'complaint', 'Hygiene or safety', 'x');
    expect(d.split('\n')[0]).toMatch(/^COMPLAINT — /);
  });
});

describe('isSupportRequestReady', () => {
  it('needs a reason, and a note only when the reason is "Something else"', () => {
    expect(isSupportRequestReady(null, 'anything')).toBe(false);
    expect(isSupportRequestReady('The provider cancelled', '')).toBe(true);
    expect(isSupportRequestReady(OTHER_SUPPORT_REASON, '   ')).toBe(false);
    expect(isSupportRequestReady(OTHER_SUPPORT_REASON, 'It rained')).toBe(true);
  });

  it('offers "Something else" last on both kinds', () => {
    expect(SUPPORT_REASONS.refund[SUPPORT_REASONS.refund.length - 1]).toBe(OTHER_SUPPORT_REASON);
    expect(SUPPORT_REASONS.complaint[SUPPORT_REASONS.complaint.length - 1]).toBe(OTHER_SUPPORT_REASON);
  });

  it('marks a ticket with no note rather than leaving it blank', () => {
    expect(buildBookingSupportDescription(booking, 'refund', 'The provider cancelled', '')).toMatch(/\(no note\)$/);
  });
});

describe('passRefundRequestOn', () => {
  beforeEach(() => jest.clearAllMocks());

  it("records the hand-off, then gives support the provider's reason", async () => {
    const result = await passRefundRequestOn(booking, { id: 'rr-1', reason: 'The provider cancelled' }, '  Client cancelled late  ', 'provider');
    expect(result).toEqual({ ticketNumber: 1042 });
    expect(passRefundRequestToCerviced).toHaveBeenCalledWith('rr-1', 'Client cancelled late');
    const input = (invokeSendSupportRequest as jest.Mock).mock.calls[0][0];
    expect(input.category).toBe('Payment');
    expect(input.description).toMatch(/^REFUND REQUEST PASSED TO CERVICED/);
    expect(input.description).toMatch(/Client cancelled late$/);
  });

  it('files no ticket when the hand-off is refused', async () => {
    (passRefundRequestToCerviced as jest.Mock).mockRejectedValueOnce(new Error('This refund request has already moved on.'));
    await expect(passRefundRequestOn(booking, { id: 'rr-1', reason: 'x' }, 'note', 'provider')).rejects.toThrow('moved on');
    expect(invokeSendSupportRequest).not.toHaveBeenCalled();
  });
});
