import { earliestBookableStartMs, slotStartMs } from '../services/AvailabilityService';

// Every slot generator in AvailabilityService used to gate on
//   noticeHrs > 0 ? Date.now() + noticeHrs * 3600000 : null
// and skip the filter entirely when the cutoff was null. min_booking_notice_hrs
// defaults to 0 ("No minimum" is what SchedulingScreen seeds), so for the
// default provider there was NO past-time filter at all: at 3pm the picker
// still offered 9:00 AM today, resolveNextAvailableSlot handed that straight
// to the booking sheet as "your earliest available time", and the client only
// found out at checkout when checkNoticeWindow rejected it with "That time has
// already passed".
describe('earliestBookableStartMs', () => {
  const NOW = new Date('2026-08-20T15:00:00').getTime();

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('floors at now when the provider requires no minimum notice', () => {
    expect(earliestBookableStartMs(0)).toBe(NOW);
    expect(earliestBookableStartMs(null)).toBe(NOW);
    expect(earliestBookableStartMs(undefined)).toBe(NOW);
  });

  it('pushes the floor out by the notice window when one is set', () => {
    expect(earliestBookableStartMs(24)).toBe(NOW + 24 * 60 * 60 * 1000);
  });

  it('never lets a negative stored value pull the floor into the past', () => {
    expect(earliestBookableStartMs(-5)).toBe(NOW);
  });

  it('rejects a slot earlier today but keeps one later today, on a 0-notice provider', () => {
    const floor = earliestBookableStartMs(0);
    const nineAm = slotStartMs('2026-08-20', 9 * 60);
    const fivePm = slotStartMs('2026-08-20', 17 * 60);
    expect(nineAm >= floor).toBe(false);
    expect(fivePm >= floor).toBe(true);
  });

  it('rejects tomorrow morning under a 24h notice window', () => {
    const floor = earliestBookableStartMs(24);
    expect(slotStartMs('2026-08-21', 9 * 60) >= floor).toBe(false);
    expect(slotStartMs('2026-08-22', 9 * 60) >= floor).toBe(true);
  });
});
