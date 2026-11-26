import { pageJumpTargets } from '../features/providers/page/jumpTargets';
import type { ProviderProfileData } from '../features/providers/profileTypes';

/** A provider with only the fields the jump bar reads. */
function provider(overrides: Partial<ProviderProfileData>): ProviderProfileData {
  return { isLinkOnly: false, bookingPolicies: null, cancellationNoticeHours: 24, ...overrides } as unknown as ProviderProfileData;
}

const refs = {
  about: { current: null },
  services: { current: null },
  policies: { current: null },
  policyPages: { current: null },
  reviews: { current: null },
};

describe('the section links on a page (app and website)', () => {
  it('shows nothing on a style without a jump bar', () => {
    expect(pageJumpTargets(provider({}), false, 2, refs)).toEqual([]);
  });

  it('links only sections the page has', () => {
    expect(pageJumpTargets(provider({}), true, 0, refs).map(t => t.key)).toEqual(['about', 'services', 'reviews']);
  });

  it('sends Policies to the policy pictures when nothing is written', () => {
    const targets = pageJumpTargets(provider({}), true, 2, refs);
    expect(targets.map(t => t.key)).toEqual(['about', 'services', 'policies', 'reviews']);
    expect(targets[2]!.ref).toBe(refs.policyPages);
  });

  it('has no Services or Reviews on a link-only page', () => {
    expect(pageJumpTargets(provider({ isLinkOnly: true }), true, 0, refs).map(t => t.key)).toEqual(['about']);
  });
});
