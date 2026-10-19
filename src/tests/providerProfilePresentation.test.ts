import { BUSINESS_TYPE_LABEL, formatServiceDuration, hasProviderPolicyInfo } from '../features/providers/profilePresentation';

describe('provider profile presentation', () => {
  it('formats service durations consistently', () => {
    expect(formatServiceDuration(45)).toBe('45 min');
    expect(formatServiceDuration(60)).toBe('1 hour');
    expect(formatServiceDuration(90)).toBe('1h 30min');
  });

  it('uses one canonical display label for each business type', () => {
    expect(BUSINESS_TYPE_LABEL.home_based).toBe('Home Studio');
  });

  it('only exposes policy details when there is actionable policy information', () => {
    expect(hasProviderPolicyInfo({ cancellationNoticeHours: 24, bookingPolicies: null } as any)).toBe(true);
    expect(hasProviderPolicyInfo({ cancellationNoticeHours: 0, bookingPolicies: { cancelNotice: 'none' } } as any)).toBe(false);
  });
});
