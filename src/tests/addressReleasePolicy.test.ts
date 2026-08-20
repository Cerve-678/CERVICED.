import {
  ADDRESS_RELEASE_BY_BUSINESS_TYPE,
  isAddressReleaseAllowed,
  reconcileAddressReleasePolicy,
} from '../features/business-details/options';

describe('address release policy vs business type', () => {
  it('keeps the current policy when the new type still offers it', () => {
    expect(reconcileAddressReleasePolicy('studio', 'always')).toBe('always');
    expect(reconcileAddressReleasePolicy('home_based', 'week_before')).toBe('week_before');
  });

  // The bug this exists to prevent: a home_based provider on 'week_before'
  // switching to salon would otherwise keep a timing salon never offers,
  // leaving the picker with nothing selected and a stale value in the DB.
  it('falls back to on_confirmation when the new type does not offer it', () => {
    expect(reconcileAddressReleasePolicy('salon', 'week_before')).toBe('on_confirmation');
    expect(reconcileAddressReleasePolicy('studio', 'manual')).toBe('on_confirmation');
    expect(reconcileAddressReleasePolicy('home_based', 'always')).toBe('on_confirmation');
  });

  it('clears the policy for mobile, which never shares an address', () => {
    expect(reconcileAddressReleasePolicy('mobile', 'on_confirmation')).toBeNull();
    expect(ADDRESS_RELEASE_BY_BUSINESS_TYPE.mobile).toHaveLength(0);
  });

  it('handles a provider with no policy set yet', () => {
    expect(reconcileAddressReleasePolicy('salon', null)).toBe('on_confirmation');
    expect(isAddressReleaseAllowed('salon', null)).toBe(false);
  });

  it('always produces a value the resulting type actually offers', () => {
    const types = ['salon', 'studio', 'home_based', 'mobile'] as const;
    const policies = [
      'always', 'on_confirmation', 'day_before', 'two_days_before',
      'three_days_before', 'five_days_before', 'week_before', 'manual',
    ] as const;

    for (const type of types) {
      for (const policy of policies) {
        const result = reconcileAddressReleasePolicy(type, policy);
        if (type === 'mobile') expect(result).toBeNull();
        else expect(isAddressReleaseAllowed(type, result)).toBe(true);
      }
    }
  });
});
