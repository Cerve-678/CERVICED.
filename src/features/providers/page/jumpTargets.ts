import type React from 'react';
import type { ViewInstance } from 'react-native';

import type { PageSectionKey } from '../../../constants/pageStyles';
import { hasProviderPolicyInfo } from '../profilePresentation';
import type { ProviderProfileData } from '../profileTypes';

type SectionRef = React.RefObject<ViewInstance | null>;

export interface PageJumpTarget {
  key: PageSectionKey;
  ref: SectionRef;
}

/**
 * The section links a page style's jump bar shows, only for sections this
 * profile actually has: no Services or Reviews on a link-only page, and
 * Policies lands on the written policies when there are any, else on the
 * policy pictures. Shared by the app's profile and the website so the two
 * offer the same links.
 */
export function pageJumpTargets(
  provider: ProviderProfileData,
  hasJumpBar: boolean,
  policyPageCount: number,
  refs: {
    about: SectionRef;
    services: SectionRef;
    policies: SectionRef;
    policyPages: SectionRef;
    reviews: SectionRef;
  },
): PageJumpTarget[] {
  if (!hasJumpBar) return [];
  const targets: PageJumpTarget[] = [{ key: 'about', ref: refs.about }];
  if (!provider.isLinkOnly) targets.push({ key: 'services', ref: refs.services });
  if (hasProviderPolicyInfo(provider)) targets.push({ key: 'policies', ref: refs.policies });
  else if (policyPageCount > 0) targets.push({ key: 'policies', ref: refs.policyPages });
  if (!provider.isLinkOnly) targets.push({ key: 'reviews', ref: refs.reviews });
  return targets;
}
