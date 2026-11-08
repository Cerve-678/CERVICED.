import { activityTimeline, bookingTodoCounts, buildClientActivity, type ActivityBooking } from '../features/bookings/activityCentre';
import type { ClientActivityRemote } from '../services/databaseService';
import { BookingStatus, PaymentStatus } from '../types/booking';

const NOW = new Date(2026, 10, 8, 12, 0); // Sun 8 Nov 2026, 12:00 local

const none: ClientActivityRemote = {
  pendingFormBookingIds: [], unreadPackBookingIds: [], openRefundRequests: [], feesToPay: [], waitlistHolds: [],
};

function booking(id: string, over: Partial<ActivityBooking> = {}): ActivityBooking {
  return {
    id,
    serviceName: 'Knotless braids',
    providerName: 'Braids by Amara',
    bookingDate: '2026-11-12',
    bookingTime: '14:30',
    status: BookingStatus.UPCOMING,
    paymentStatus: PaymentStatus.PAID_IN_FULL,
    ...over,
  };
}

describe('buildClientActivity', () => {
  it('is empty when nothing is waiting on anyone', () => {
    const result = buildClientActivity([booking('b1')], none, NOW);
    expect(result).toEqual({ needsYou: [], inProgress: [] });
  });

  it('asks the client to pick a time once the provider has sent some, and waits before that', () => {
    const offered = booking('b1', {
      isPendingReschedule: true,
      rescheduleRequest: { providerAvailableDates: [{ date: '2026-11-14', times: ['10:00'] }] },
    });
    const sent = booking('b2', { isPendingReschedule: true, rescheduleRequest: {} });
    const { needsYou, inProgress } = buildClientActivity([offered, sent], none, NOW);

    expect(needsYou).toHaveLength(1);
    expect(needsYou[0]).toMatchObject({ kind: 'reschedule_pick', title: 'Pick a new time', target: { type: 'reschedule', bookingId: 'b1' } });
    expect(inProgress).toHaveLength(1);
    expect(inProgress[0]).toMatchObject({ kind: 'reschedule_waiting', detail: 'Waiting for Braids by Amara to send new times for Knotless braids.' });
  });

  it('ignores a reschedule left on a cancelled booking', () => {
    const cancelled = booking('b1', {
      status: BookingStatus.CANCELLED,
      isPendingReschedule: true,
      rescheduleRequest: { providerAvailableDates: [{ date: '2026-11-14', times: ['10:00'] }] },
    });
    expect(buildClientActivity([cancelled], none, NOW)).toEqual({ needsYou: [], inProgress: [] });
  });

  it('shows one row per booking for forms and packs, and only before the appointment', () => {
    const remote: ClientActivityRemote = {
      ...none,
      pendingFormBookingIds: ['b1', 'b1', 'past'],
      unreadPackBookingIds: ['b1', 'b1'],
    };
    const { needsYou } = buildClientActivity(
      [booking('b1'), booking('past', { status: BookingStatus.COMPLETED })],
      remote,
      NOW,
    );
    expect(needsYou.map(i => i.kind)).toEqual(['intake_form', 'info_pack']);
    expect(needsYou[1]!.title).toBe('Read 2 info packs');
  });

  it('puts the nearest deadline first', () => {
    const remote: ClientActivityRemote = {
      ...none,
      pendingFormBookingIds: ['b1'],
      feesToPay: [{ id: 'f1', bookingId: 'old', kind: 'late', amountPence: 1500, payBy: '2026-11-09T12:00:00Z' }],
    };
    const { needsYou } = buildClientActivity([booking('b1')], remote, NOW);
    expect(needsYou.map(i => i.kind)).toEqual(['fee_to_pay', 'intake_form']);
    // The fee's booking is older than what's loaded: still shown, with a fallback name.
    expect(needsYou[0]!.title).toBe('Pay your late fee · £15.00');
    expect(needsYou[0]!.detail).toContain("Your provider couldn't take it from your saved card.");
  });

  it('offers a no-show dispute only inside the window, and only with a recorded mark time', () => {
    const recent = booking('b1', { status: BookingStatus.NO_SHOW, noShowMarkedAt: '2026-11-06T10:00:00Z' });
    const stale = booking('b2', { status: BookingStatus.NO_SHOW, noShowMarkedAt: '2026-10-20T10:00:00Z' });
    const unmarked = booking('b3', { status: BookingStatus.NO_SHOW });
    const disputed = booking('b4', { status: BookingStatus.NO_SHOW, noShowMarkedAt: '2026-11-06T10:00:00Z', noShowDisputedAt: '2026-11-07T10:00:00Z' });
    const { needsYou } = buildClientActivity([recent, stale, unmarked, disputed], none, NOW);
    expect(needsYou.map(i => i.key)).toEqual(['noshow:b1']);
  });

  it('tracks open refund requests and does not repeat a pending refund the request already covers', () => {
    const remote: ClientActivityRemote = {
      ...none,
      openRefundRequests: [
        { id: 'r1', bookingId: 'b1', status: 'with_provider', createdAt: '2026-11-07T09:00:00Z', passedAutomatically: false },
        { id: 'r2', bookingId: 'b2', status: 'under_review', createdAt: '2026-11-01T09:00:00Z', passedAutomatically: true },
      ],
    };
    const { inProgress, needsYou } = buildClientActivity(
      [
        booking('b1', { status: BookingStatus.CANCELLED, paymentStatus: PaymentStatus.REFUND_PENDING }),
        booking('b2', { status: BookingStatus.COMPLETED }),
        booking('b3', { status: BookingStatus.CANCELLED, paymentStatus: PaymentStatus.REFUND_PENDING }),
      ],
      remote,
      NOW,
    );
    expect(needsYou).toEqual([]);
    expect(inProgress.map(i => i.key).sort()).toEqual(['refund:r1', 'refund:r2', 'refundpending:b3']);
    const withProvider = inProgress.find(i => i.key === 'refund:r1')!;
    expect(withProvider.detail).toBe("With Braids by Amara for Knotless braids. If they haven't replied by Tue 10 Nov, it comes to Cerviced.");
    const review = inProgress.find(i => i.key === 'refund:r2')!;
    expect(review.title).toBe('Refund under review by Cerviced');
    expect(review.detail).toMatch(/^Braids by Amara didn't reply in time/);
    // Never promises the money is coming.
    for (const item of inProgress) {
      expect(item.detail).not.toMatch(/you will get|on its way/i);
      expect(item.summary).not.toMatch(/you will get|on its way|refunded/i);
    }
  });

  it('lists booking requests still waiting for the provider', () => {
    const { inProgress } = buildClientActivity([booking('b1', { status: BookingStatus.PENDING })], none, NOW);
    expect(inProgress).toHaveLength(1);
    expect(inProgress[0]!.title).toBe('Waiting to be confirmed');
    expect(inProgress[0]!.detail).toBe("Braids by Amara hasn't confirmed Knotless braids on Thu 12 Nov at 2:30pm yet.");
  });

  it('sends a waitlist hold to the hold popup', () => {
    const remote: ClientActivityRemote = {
      ...none,
      waitlistHolds: [{
        bookingId: 'h1', serviceName: 'Silk press', providerName: 'Hair by Jo',
        bookingDate: '2026-11-10', bookingTime: '09:00:00', holdExpiresAt: '2026-11-08T13:00:00Z',
      }],
    };
    const { needsYou } = buildClientActivity([], remote, NOW);
    expect(needsYou[0]).toMatchObject({ kind: 'waitlist_hold', target: { type: 'waitlist_hold', bookingId: 'h1' } });
    expect(needsYou[0]!.detail).toMatch(/^Silk press with Hair by Jo · Tue 10 Nov at 09:00am\. Confirm it before /);
  });
});

describe('live tiles: pulse, caption and status-pill line', () => {
  const hold = {
    bookingId: 'h1', serviceName: 'Lash lift', providerName: 'Amara Cole',
    bookingDate: '2026-11-12', bookingTime: '14:30:00', holdExpiresAt: '2026-11-08T16:15:00Z',
  };

  it('pulses fast inside a day, slow for a further hard deadline, and stays still for an appointment-only item', () => {
    const remote: ClientActivityRemote = {
      ...none,
      waitlistHolds: [hold],
      feesToPay: [{ id: 'f1', bookingId: 'b1', kind: 'late', amountPence: 1250, payBy: '2026-11-10T12:00:00Z' }],
      pendingFormBookingIds: ['b2'],
    };
    const { needsYou, inProgress } = buildClientActivity(
      [booking('b1'), booking('b2', { bookingDate: '2026-11-14', bookingTime: '11:00' }), booking('b3', { status: BookingStatus.PENDING })],
      remote,
      NOW,
    );
    expect(needsYou.map(i => [i.kind, i.pulse])).toEqual([
      ['waitlist_hold', 'urgent'],
      ['fee_to_pay', 'soon'],
      ['intake_form', 'still'],
    ]);
    expect(inProgress.map(i => i.pulse)).toEqual(['waiting']);
    expect(needsYou.map(i => i.caption)).toEqual([expect.stringMatching(/^Ends at /), 'Pay by Tue 10 Nov', 'Before Sat 14 Nov']);
    expect(needsYou[1]!.summary).toBe('Late fee of £12.50 to pay by Tue 10 Nov');
    expect(needsYou[2]!.summary).toBe('Braids by Amara needs your form');
    expect(inProgress[0]!.summary).toBe('Waiting for Braids by Amara to confirm Knotless braids');
  });

  it('an appointment-tied item due within a day is urgent too', () => {
    const { needsYou } = buildClientActivity(
      [booking('b1', { bookingDate: '2026-11-08', bookingTime: '18:00' })],
      { ...none, pendingFormBookingIds: ['b1'] },
      NOW,
    );
    expect(needsYou[0]!.pulse).toBe('urgent');
  });
});

describe('activityTimeline', () => {
  it('stays plain tiles while everything waiting on the client falls on one day, however much is in progress', () => {
    const activity = buildClientActivity(
      [booking('b1', { bookingDate: '2026-11-08', bookingTime: '18:00' }), booking('b2', { status: BookingStatus.PENDING, bookingDate: '2026-11-20' })],
      { ...none, pendingFormBookingIds: ['b1'], unreadPackBookingIds: ['b1'] },
      NOW,
    );
    expect(activityTimeline(activity, NOW)).toBeNull();
  });

  it('lays the list on a dated line once two or more days are involved, overdue items counting as today', () => {
    const activity = buildClientActivity(
      [booking('b1'), booking('b2', { bookingDate: '2026-11-14', bookingTime: '11:00' }), booking('b3', { status: BookingStatus.PENDING })],
      {
        ...none,
        feesToPay: [{ id: 'f1', bookingId: 'b1', kind: 'late', amountPence: 1250, payBy: '2026-11-07T12:00:00Z' }],
        pendingFormBookingIds: ['b2'],
      },
      NOW,
    );
    const line = activityTimeline(activity, NOW)!;
    expect(line.days.map(d => [d.label, d.isToday, d.items.map(i => i.kind)])).toEqual([
      ['TODAY', true, ['fee_to_pay']],
      ['SAT 14 NOV', false, ['intake_form']],
    ]);
    expect(line.inProgress.map(i => i.kind)).toEqual(['awaiting_confirmation']);
  });
});

describe('bookingTodoCounts', () => {
  it('counts forms and unread packs per booking', () => {
    expect(bookingTodoCounts({ pendingFormBookingIds: ['a', 'b'], unreadPackBookingIds: ['a'] })).toEqual({ a: 2, b: 1 });
  });
});
