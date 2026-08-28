import {
  buildPolicySnapshot,
  readProviderTermsSnapshot,
  buildPolicyDisplayRows,
} from '../utils/policyDisplay';

const TERMS = { title: 'My Terms', body: 'Patch test required 48h before.' };

describe('buildPolicySnapshot', () => {
  it('freezes the agreed terms alongside the policy', () => {
    const snap = buildPolicySnapshot({ cancelNotice: '24h' }, TERMS);
    expect(snap).toEqual({ cancelNotice: '24h', providerTerms: TERMS });
  });

  it('still records terms when the provider has no structured policy', () => {
    // The bug this replaces: `bookingPolicies ? {...} : {}` dropped the terms
    // entirely for a provider who wrote T&Cs but never filled in a policy.
    expect(buildPolicySnapshot(null, TERMS)).toEqual({ providerTerms: TERMS });
  });

  it('omits terms the client did not tick', () => {
    expect(buildPolicySnapshot({ cancelNotice: '24h' }, null)).toEqual({
      cancelNotice: '24h',
    });
  });

  it('emits nothing when there is neither', () => {
    expect(buildPolicySnapshot(null, null)).toBeUndefined();
    expect(buildPolicySnapshot(undefined, undefined)).toBeUndefined();
  });
});

describe('readProviderTermsSnapshot', () => {
  it('round-trips what buildPolicySnapshot wrote', () => {
    expect(readProviderTermsSnapshot(buildPolicySnapshot(null, TERMS))).toEqual(TERMS);
  });

  it('returns null for a booking that predates the snapshot', () => {
    expect(readProviderTermsSnapshot(null)).toBeNull();
    expect(readProviderTermsSnapshot(undefined)).toBeNull();
    expect(readProviderTermsSnapshot({ cancelNotice: '24h' })).toBeNull();
  });

  it('treats a malformed or empty body as no terms', () => {
    expect(readProviderTermsSnapshot({ providerTerms: 'oops' })).toBeNull();
    expect(readProviderTermsSnapshot({ providerTerms: { title: 'x' } })).toBeNull();
    expect(readProviderTermsSnapshot({ providerTerms: { title: 'x', body: '  ' } })).toBeNull();
  });

  it('falls back to a sensible title but never invents a body', () => {
    expect(readProviderTermsSnapshot({ providerTerms: { body: 'real text' } })).toEqual({
      title: 'Terms & Conditions',
      body: 'real text',
    });
  });
});

describe('policy display is unaffected by the extra key', () => {
  it('ignores providerTerms when building policy rows', () => {
    const withTerms = buildPolicyDisplayRows(
      buildPolicySnapshot({ cancelNotice: '24h' }, TERMS) as never,
    );
    const withoutTerms = buildPolicyDisplayRows({ cancelNotice: '24h' });
    expect(withTerms).toEqual(withoutTerms);
  });
});
