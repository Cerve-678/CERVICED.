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
  composePassOnReason,
  describeRefundScope,
  fileBookingSupportRequest,
  getRefundRequestScope,
  isRefundRequestWindowOpen,
  isSupportRequestReady,
  OTHER_SUPPORT_REASON,
  passRefundRequestOn,
  REFUND_REQUEST_DAYS,
  refundRequestLastDay,
  SUPPORT_REASONS,
} from '../features/bookings/bookingSupportRequest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Fri 13 Nov 2026, midday UK (GMT).
const NOW = new Date(Date.UTC(2026, 10, 13, 12, 0));
const RECENT = '2026-11-10';
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
    const scope = (paymentStatus: PaymentStatus) => getRefundRequestScope({ paymentStatus, bookingDate: RECENT, refundRequestWindowApplies: true }, NOW);
    expect(scope(PaymentStatus.DEPOSIT_PAID)).toBe('in_app');
    expect(scope(PaymentStatus.PAID_IN_FULL)).toBe('in_app');
    expect(scope(PaymentStatus.PARTIALLY_REFUNDED)).toBe('in_app');
    expect(scope(PaymentStatus.PENDING)).toBe('off_app');
    expect(scope(PaymentStatus.FAILED)).toBe('off_app');
    expect(scope(PaymentStatus.REFUND_PENDING)).toBe('settled');
    expect(scope(PaymentStatus.REFUNDED)).toBe('settled');
  });

  it('closes an in-app request once the five days are up, but still explains off-app ones', () => {
    const old = { bookingDate: '2026-11-07', refundRequestWindowApplies: true };
    expect(getRefundRequestScope({ ...old, paymentStatus: PaymentStatus.PAID_IN_FULL }, NOW)).toBe('closed');
    expect(getRefundRequestScope({ ...old, paymentStatus: PaymentStatus.PENDING }, NOW)).toBe('off_app');
    expect(getRefundRequestScope({ ...old, paymentStatus: PaymentStatus.REFUNDED }, NOW)).toBe('settled');
  });

  it('never closes a booking made before the limit went live', () => {
    expect(getRefundRequestScope({ paymentStatus: PaymentStatus.PAID_IN_FULL, bookingDate: '2026-01-07', refundRequestWindowApplies: false }, NOW)).toBe('in_app');
    expect(getRefundRequestScope({ paymentStatus: PaymentStatus.PAID_IN_FULL, bookingDate: '2026-01-07' }, NOW)).toBe('in_app');
  });
});

describe('the five-day refund window', () => {
  it("doesn't count the appointment day: the 10th can ask until the end of the 15th", () => {
    expect(refundRequestLastDay('2026-11-10')).toBe('2026-11-15');
    expect(refundRequestLastDay('2026-11-28')).toBe('2026-12-03');
  });

  const covered = (bookingDate: string) => ({ bookingDate, refundRequestWindowApplies: true });

  it('is open all of the last day, UK time, and closed from midnight', () => {
    expect(isRefundRequestWindowOpen(covered('2026-11-10'), new Date(Date.UTC(2026, 10, 15, 23, 59)))).toBe(true);
    expect(isRefundRequestWindowOpen(covered('2026-11-10'), new Date(Date.UTC(2026, 10, 16, 0, 0)))).toBe(false);
    // In summer the UK is an hour ahead: 23:30 UTC on the 20th is already the 21st there.
    expect(isRefundRequestWindowOpen(covered('2026-07-15'), new Date(Date.UTC(2026, 6, 20, 22, 30)))).toBe(true);
    expect(isRefundRequestWindowOpen(covered('2026-07-15'), new Date(Date.UTC(2026, 6, 20, 23, 30)))).toBe(false);
  });

  it('is open for an appointment still to come', () => {
    expect(isRefundRequestWindowOpen(covered('2026-12-01'), NOW)).toBe(true);
  });

  it("leaves it to the server when the date can't be read", () => {
    expect(isRefundRequestWindowOpen(covered(''), NOW)).toBe(true);
  });

  it('matches the database refusal', () => {
    const sql = readFileSync(join(__dirname, '..', '..', 'supabase/migrations/20261113190000_refund_request_five_days.sql'), 'utf8');
    expect(REFUND_REQUEST_DAYS).toBe(5);
    expect(sql).toContain(`(now() AT TIME ZONE 'Europe/London')::date > v_booking_date + ${REFUND_REQUEST_DAYS} THEN`);
    // Only bookings made once the rule started, the same flag the app reads.
    expect(sql).toContain('IF v_created_at >= public.refund_request_window_starts_at()');
    expect(sql).toMatch(/\(b\.created_at >= refund_request_window_starts_at\(\)\) AS refund_request_window_applies/);
    expect(sql).toContain(`TO_CHAR(v_booking_date + ${REFUND_REQUEST_DAYS},`);
  });
});

describe('describeRefundScope', () => {
  const base = { providerName: 'Braids by Amara', amountPaid: 20, remainingBalance: 60, bookingDate: RECENT, refundRequestWindowApplies: true };

  it('tells an off-app client it is between them and the provider', () => {
    const { title, lines } = describeRefundScope({ ...base, paymentStatus: PaymentStatus.PENDING, paymentType: 'full', amountPaid: 0 }, NOW);
    expect(title).toBe('Not paid through Cerviced');
    expect(lines.join(' ')).toContain('between you and Braids by Amara');
  });

  it('limits a deposit request to the deposit, and says a broken policy stands', () => {
    const { lines } = describeRefundScope({ ...base, paymentStatus: PaymentStatus.DEPOSIT_PAID, paymentType: 'deposit' }, NOW);
    expect(lines[0]).toContain('£20.00 deposit');
    expect(lines[0]).toContain('£60.00 balance due at the appointment is between you and Braids by Amara');
    expect(lines[1]).toMatch(/cancelled late, didn't turn up, or rescheduled late/);
    expect(lines[1]).toContain("Cerviced won't overturn it");
  });

  it('still says a broken policy stands for a full in-app payment', () => {
    const { lines } = describeRefundScope({ ...base, paymentStatus: PaymentStatus.PAID_IN_FULL, paymentType: 'full', remainingBalance: 0 }, NOW);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^Braids by Amara can keep some or all/);
  });

  it('says the last day to ask while it is open', () => {
    const { lines } = describeRefundScope({ ...base, paymentStatus: PaymentStatus.PAID_IN_FULL, paymentType: 'full' }, NOW);
    expect(lines[lines.length - 1]).toBe('You can ask until the end of Sunday 15th November, 5 days after the day of your appointment.');
  });

  it('gives no last day for a booking made before the limit', () => {
    const { lines } = describeRefundScope({ ...base, refundRequestWindowApplies: false, paymentStatus: PaymentStatus.PAID_IN_FULL, paymentType: 'full', remainingBalance: 0 }, NOW);
    expect(lines).toHaveLength(1);
    expect(lines.join(' ')).not.toMatch(/You can ask until/);
  });

  it('says when it closed, and that a complaint is still open', () => {
    const { title, lines } = describeRefundScope({ ...base, bookingDate: '2026-11-07', paymentStatus: PaymentStatus.PAID_IN_FULL, paymentType: 'full' }, NOW);
    expect(title).toBe('Refund requests have closed');
    expect(lines[0]).toContain('the last day was Thursday 12th November');
    expect(lines[1]).toMatch(/still make a complaint/);
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

describe('composePassOnReason', () => {
  it('needs a picked reason, and a note only for Other', () => {
    expect(composePassOnReason(null, 'anything')).toBeNull();
    expect(composePassOnReason('Other', '  ')).toBeNull();
    expect(composePassOnReason('Other', ' Client was rude ')).toBe('Client was rude');
  });

  it('sends the picked reason, with any note after it', () => {
    expect(composePassOnReason("Client didn't turn up", '')).toBe("Client didn't turn up");
    expect(composePassOnReason('Service was done as booked', 'Photos sent at the time')).toBe('Service was done as booked. Photos sent at the time');
  });
});
