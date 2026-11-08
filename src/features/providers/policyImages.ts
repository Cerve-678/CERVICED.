// src/features/providers/policyImages.ts
//
// A provider's detailed policy can be several pictures (pages of a sheet, a
// consent form). They live in booking_policies.policyImageUrls, in order. The
// older single policyImageUrl is still written as the first page, so an app
// build from before this keeps showing a policy instead of none.

export const MAX_POLICY_IMAGES = 5;

export interface PolicyImageFields {
  policyImageUrl?: unknown;
  policyImageUrls?: unknown;
}

/** Every policy page, in order. Reads the list, else the old single image. */
export function policyImageUrls(policies: PolicyImageFields | null | undefined): string[] {
  const list = Array.isArray(policies?.policyImageUrls)
    ? (policies!.policyImageUrls as unknown[]).filter((u): u is string => typeof u === 'string' && u.trim() !== '')
    : [];
  if (list.length > 0) return [...new Set(list)].slice(0, MAX_POLICY_IMAGES);
  const single = policies?.policyImageUrl;
  return typeof single === 'string' && single.trim() !== '' ? [single] : [];
}

/** The two keys to save for `urls`: the list, and the first page on its own. */
export function policyImageFields(urls: readonly string[]): { policyImageUrls: string[]; policyImageUrl: string } {
  const pages = [...new Set(urls.filter(u => u.trim() !== ''))].slice(0, MAX_POLICY_IMAGES);
  return { policyImageUrls: pages, policyImageUrl: pages[0] ?? '' };
}
