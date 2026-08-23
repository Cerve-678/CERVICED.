import {
  resolveWeeklyEnvelope,
  describeEmergencyReason,
} from '../services/AvailabilityService';

// The envelope is what stops "I'll take the odd late one" from meaning "any
// client may ask for 4am". It's calculated identically here and in
// enforce_booking_bookability() (20260821143821_emergency_booking_requests.sql)
// — if the two ever disagree, the picker offers times the database then
// rejects, which is exactly the dead-end this feature exists to remove.
describe('resolveWeeklyEnvelope', () => {
  it('spans the whole week, not just one day', () => {
    // Mon-Fri 9-5, Saturday 10-2. Saturday's envelope is still 9-5, so a
    // Saturday out-of-hours request can reach the provider's normal weekday
    // hours without any extension at all.
    const windows = [
      { start_time: '09:00:00', end_time: '17:00:00' },
      { start_time: '10:00:00', end_time: '14:00:00' },
    ];
    expect(resolveWeeklyEnvelope(windows, [])).toEqual({ openMins: 540, closeMins: 1020 });
  });

  it('takes the earliest start and latest end across split shifts', () => {
    const windows = [
      { start_time: '09:00:00', end_time: '12:00:00' },
      { start_time: '14:00:00', end_time: '20:30:00' },
      { start_time: '08:30:00', end_time: '11:00:00' },
    ];
    expect(resolveWeeklyEnvelope(windows, [])).toEqual({ openMins: 510, closeMins: 1230 });
  });

  it('falls back to the legacy single-period table only when there are no window rows', () => {
    const legacy = [
      { open_time: '10:00:00', close_time: '18:00:00', is_closed: false },
      { open_time: '00:00:00', close_time: '00:00:00', is_closed: true },
    ];
    expect(resolveWeeklyEnvelope([], legacy)).toEqual({ openMins: 600, closeMins: 1080 });

    // A window row wins outright — the legacy row is never blended in.
    expect(resolveWeeklyEnvelope([{ start_time: '09:00:00', end_time: '17:00:00' }], legacy))
      .toEqual({ openMins: 540, closeMins: 1020 });
  });

  it('ignores closed legacy days rather than reading them as a 00:00 open', () => {
    // Without the is_closed filter this would return openMins 0, and the
    // extension would then reach backwards from midnight.
    const legacy = [
      { open_time: '00:00:00', close_time: '00:00:00', is_closed: true },
      { open_time: '11:00:00', close_time: '19:00:00', is_closed: false },
    ];
    expect(resolveWeeklyEnvelope([], legacy)).toEqual({ openMins: 660, closeMins: 1140 });
  });

  it('has no envelope for a provider with no recurring schedule', () => {
    // Deliberately null, not a 24h default: nothing bounds the request, so
    // the trigger rejects it rather than opening the whole clock.
    expect(resolveWeeklyEnvelope([], [])).toBeNull();
    expect(resolveWeeklyEnvelope([], [{ open_time: '09:00:00', close_time: '17:00:00', is_closed: true }]))
      .toBeNull();
  });

  it('rejects a degenerate envelope where nothing is actually open', () => {
    expect(resolveWeeklyEnvelope([{ start_time: '12:00:00', end_time: '12:00:00' }], []))
      .toBeNull();
  });
});

describe('describeEmergencyReason', () => {
  it('names the provider in every reason', () => {
    const reasons = ['outside_hours', 'blocked_date', 'short_notice', 'beyond_window'] as const;
    for (const reason of reasons) {
      expect(describeEmergencyReason(reason, 'Ana')).toContain('Ana');
    }
  });

  it('reads as a clause the confirmation can drop into a sentence', () => {
    expect(describeEmergencyReason('outside_hours', 'Ana')).toBe("outside Ana's working hours");
    expect(describeEmergencyReason('blocked_date', 'Ana')).toBe('on a date Ana has marked unavailable');
  });
});
