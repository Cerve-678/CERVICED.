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

  // Mobile used to be excluded from address release entirely. It now gets the
  // same private-until-released set as home_based — but never 'always': the
  // address a mobile provider has on file is typically their home, so a
  // standing-visible option would publish it to anyone with a booking.
  it('gives mobile the private-until-released timings, but never always', () => {
    expect(reconcileAddressReleasePolicy('mobile', 'on_confirmation')).toBe('on_confirmation');
    expect(reconcileAddressReleasePolicy('mobile', 'manual')).toBe('manual');
    expect(ADDRESS_RELEASE_BY_BUSINESS_TYPE.mobile).not.toContain('always');
  });

  // 'always' is the only standing-visible option, so it stays limited to the
  // two business types whose address is a commercial premises.
  it('offers always only to salon and studio', () => {
    expect(ADDRESS_RELEASE_BY_BUSINESS_TYPE.salon).toContain('always');
    expect(ADDRESS_RELEASE_BY_BUSINESS_TYPE.studio).toContain('always');
    expect(ADDRESS_RELEASE_BY_BUSINESS_TYPE.home_based).not.toContain('always');
    expect(ADDRESS_RELEASE_BY_BUSINESS_TYPE.mobile).not.toContain('always');
  });

  it('handles a provider with no policy set yet', () => {
    expect(reconcileAddressReleasePolicy('salon', null)).toBe('on_confirmation');
    expect(isAddressReleaseAllowed('salon', null)).toBe(false);
  });

  // The regression this guards: every pre-existing mobile row has a NULL
  // policy from when mobile had no picker at all. If reconcile handed them
  // the 'on_confirmation' default like every other type, the next unrelated
  // save on Business Info would start releasing a home address to every
  // confirmed client without the provider ever choosing to share it.
  it('never defaults a mobile provider into sharing', () => {
    expect(reconcileAddressReleasePolicy('mobile', null)).toBeNull();
    // 'always' is not offered to mobile, so it falls back — to null, not to
    // the premises-type default.
    expect(reconcileAddressReleasePolicy('mobile', 'always')).toBeNull();
  });

  it('always produces a value the resulting type actually offers, or null', () => {
    const types = ['salon', 'studio', 'home_based', 'mobile'] as const;
    const policies = [
      'always', 'on_confirmation', 'day_before', 'two_days_before',
      'three_days_before', 'five_days_before', 'week_before', 'manual',
    ] as const;

    for (const type of types) {
      for (const policy of policies) {
        const result = reconcileAddressReleasePolicy(type, policy);
        // null is a legitimate outcome for mobile — it means "never share" —
        // but never a stale timing the type doesn't offer.
        if (result === null) expect(type).toBe('mobile');
        else expect(isAddressReleaseAllowed(type, result)).toBe(true);
      }
    }
  });
});
