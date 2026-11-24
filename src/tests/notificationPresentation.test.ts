import {
  isCertificateNotification,
  notificationAmount,
  notificationDayHeadings,
  notificationDayLabel,
  notificationKindLabel,
} from '../features/notifications/notificationPresentation';

describe('notificationAmount', () => {
  it('reads a payment figure from the message', () => {
    expect(notificationAmount('payment_success', 'Payment received', 'We received your payment of £93.99 for 2 services.')).toBe('£93.99');
  });

  it('reads a failed payout figure from the title, where the server writes it', () => {
    expect(notificationAmount('payout_failed', "Your bank didn't accept £112.40", 'Your bank turned down a payout from Stripe.')).toBe('£112.40');
    expect(notificationAmount('payout_failed', "We couldn't send your £1,204.50", 'Open Payments.')).toBe('£1,204.50');
  });

  it('never shows a figure on a tip, even though its wording has one', () => {
    expect(notificationAmount('tip_received', 'You received a tip', 'Priya left you a £8.00 tip.')).toBeNull();
  });

  it('shows nothing when the wording has no figure, or the type is not a money one', () => {
    expect(notificationAmount('payment_success', 'Payment received', 'Thanks for your payment.')).toBeNull();
    expect(notificationAmount('booking_pending', 'New request', 'Her £15.00 deposit is paid.')).toBeNull();
  });
});

describe('isCertificateNotification', () => {
  it('is true only for the whole-month kind', () => {
    expect(isCertificateNotification('schedule_fully_booked', { kind: 'fully_booked_certificate' })).toBe(true);
    expect(isCertificateNotification('schedule_fully_booked', { kind: 'fully_booked' })).toBe(false);
  });

  it('copes with rows that have no usable metadata', () => {
    expect(isCertificateNotification('schedule_fully_booked', null)).toBe(false);
    expect(isCertificateNotification('schedule_fully_booked', [])).toBe(false);
    expect(isCertificateNotification('points_earned', { kind: 'fully_booked_certificate' })).toBe(false);
  });
});

describe('notification day headings', () => {
  const now = new Date(2026, 10, 12, 9, 0);

  it('sorts a row by calendar day, not by hours ago', () => {
    expect(notificationDayLabel(new Date(2026, 10, 12, 0, 5).toISOString(), now)).toBe('Today');
    expect(notificationDayLabel(new Date(2026, 10, 11, 23, 55).toISOString(), now)).toBe('Yesterday');
    expect(notificationDayLabel(new Date(2026, 10, 6, 12, 0).toISOString(), now)).toBe('Earlier this week');
    expect(notificationDayLabel(new Date(2026, 10, 5, 12, 0).toISOString(), now)).toBe('Earlier');
  });

  it('still counts one day across the clocks going back', () => {
    const afterChange = new Date(2026, 9, 26, 9, 0);
    expect(notificationDayLabel(new Date(2026, 9, 25, 9, 0).toISOString(), afterChange)).toBe('Yesterday');
  });

  it('heads only the first row of each day', () => {
    const rows = [
      { id: 'a', timestamp: new Date(2026, 10, 12, 8, 0).toISOString() },
      { id: 'b', timestamp: new Date(2026, 10, 12, 7, 0).toISOString() },
      { id: 'c', timestamp: new Date(2026, 10, 11, 7, 0).toISOString() },
    ];
    expect([...notificationDayHeadings(rows, now)]).toEqual([['a', 'Today'], ['c', 'Yesterday']]);
  });
});

describe('notificationKindLabel', () => {
  it('names known types and falls back for a new one', () => {
    expect(notificationKindLabel('tip_received')).toBe('Tip');
    expect(notificationKindLabel('something_new')).toBe('Notification');
  });
});
