import { readEmergencyPolicy, takesEmergencyRequests } from '../services/AvailabilityService';

const row = (over: Record<string, unknown> = {}) => ({
  allow_out_of_hours_requests: false,
  allow_blocked_date_requests: false,
  allow_short_notice_requests: false,
  allow_beyond_window_requests: false,
  request_window_before_mins: null,
  request_window_after_mins: null,
  ...over,
});

/**
 * "Does this provider take requests?" is asked in two places that must agree:
 * the client's booking picker (whether to offer a "Request a time" link) and
 * the provider's own Additional Terms editor (whether an out-of-hours booking
 * can happen at all, and so whether terms for one are worth writing). One
 * predicate, so they can't drift.
 */
describe('takesEmergencyRequests', () => {
  it('is false for a provider who has opted into nothing', () => {
    expect(takesEmergencyRequests(readEmergencyPolicy(row()))).toBe(false);
  });

  it('is true on any one of the four opt-ins', () => {
    for (const column of [
      'allow_out_of_hours_requests',
      'allow_blocked_date_requests',
      'allow_short_notice_requests',
      'allow_beyond_window_requests',
    ]) {
      expect(takesEmergencyRequests(readEmergencyPolicy(row({ [column]: true })))).toBe(true);
    }
  });

  it('ignores the request window, which bounds WHERE a request lands, not whether any are taken', () => {
    // A provider with a window set but no opt-in still takes nothing.
    const windowed = row({ request_window_before_mins: 120, request_window_after_mins: 180 });
    expect(takesEmergencyRequests(readEmergencyPolicy(windowed))).toBe(false);
  });

  it('fails closed on a missing or unreadable row', () => {
    expect(takesEmergencyRequests(readEmergencyPolicy(null))).toBe(false);
    // Anything that isn't literally `true` is not an opt-in — a stray string
    // or 1 from a loose caller must not switch requests on.
    expect(takesEmergencyRequests(readEmergencyPolicy(row({ allow_out_of_hours_requests: 'true' })))).toBe(false);
    expect(takesEmergencyRequests(readEmergencyPolicy(row({ allow_out_of_hours_requests: 1 })))).toBe(false);
  });
});
