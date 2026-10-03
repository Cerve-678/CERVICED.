import { describeSettlementTiming } from '../features/bookings/paymentPresentation';
import { cancellationNoticeHours } from '../utils/policyDisplay';

describe('cancellationNoticeHours', () => {
  it('prefers the explicit column, then the policy text, else no window', () => {
    expect(cancellationNoticeHours(12, { cancelNotice: '48h' })).toBe(12);
    expect(cancellationNoticeHours(null, { cancelNotice: '48h' })).toBe(48);
    expect(cancellationNoticeHours(0, { cancelNotice: '24h' })).toBe(24);
    expect(cancellationNoticeHours(null, { cancelNotice: 'none' })).toBe(0);
    expect(cancellationNoticeHours(undefined, null)).toBe(0);
  });
});

describe('describeSettlementTiming', () => {
  it('says how long before, and the notice it fell inside', () => {
    expect(describeSettlementTiming(6.4, 24)).toBe('Cancelled 6 hours before, inside your 24-hour notice.');
    expect(describeSettlementTiming(1, 24)).toBe('Cancelled 1 hour before, inside your 24-hour notice.');
  });

  it('switches to minutes inside the last hour', () => {
    expect(describeSettlementTiming(0.25, 24)).toBe('Cancelled 15 minutes before, inside your 24-hour notice.');
    expect(describeSettlementTiming(0.001, 24)).toBe('Cancelled 1 minute before, inside your 24-hour notice.');
  });

  it('handles a cancel after the start, no notice window, and missing timing', () => {
    expect(describeSettlementTiming(-0.5, 24)).toBe('Cancelled after the appointment start time.');
    expect(describeSettlementTiming(30, 0)).toBe('Cancelled 30 hours before.');
    expect(describeSettlementTiming(null, 24)).toBeNull();
  });
});
