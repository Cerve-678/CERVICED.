import type { PortfolioItem } from '../../types/providers';

export interface MoreLikeThisResult {
  items: PortfolioItem[];
  isFallback: boolean;
}

const kindOf = (item: PortfolioItem): NonNullable<PortfolioItem['kind']> =>
  item.kind ?? 'portfolio';

const imageUri = (item: PortfolioItem): string =>
  (item.image as { uri?: string } | undefined)?.uri ?? '';

const normalizedServiceName = (item: PortfolioItem): string =>
  item.serviceName?.trim().replace(/\s+/g, ' ').toLocaleLowerCase() ?? '';

/**
 * Builds a stable, intentionally mixed recommendation row.
 *
 * Recommendations never cross categories. Within the category we balance
 * providers first, then rotate portfolio work and bookable services. If the opened card is a named service, that same service from other
 * providers is preferred before broader options in the category.
 */
export function buildMoreLikeThis(
  anchor: PortfolioItem,
  source: readonly PortfolioItem[],
  limit = 12,
): MoreLikeThisResult {
  const eligible = source.filter(item => item.id !== anchor.id);
  const sameCategory = eligible.filter(item => item.category === anchor.category);
  const pool = sameCategory;
  const anchorTags = new Set(anchor.tags ?? []);
  const anchorServiceName = normalizedServiceName(anchor);

  const ranked = pool
    .map((item, position) => ({
      item,
      position,
      sharedTags: (item.tags ?? []).filter(tag => anchorTags.has(tag)).length,
      differentProvider: item.providerId !== anchor.providerId ? 1 : 0,
      sameService:
        anchorServiceName !== '' && normalizedServiceName(item) === anchorServiceName
          ? 1
          : 0,
    }))
    .sort(
      (a, b) =>
        b.sharedTags - a.sharedTags ||
        b.sameService - a.sameService ||
        b.differentProvider - a.differentProvider ||
        a.position - b.position,
    );

  const result: PortfolioItem[] = [];
  const usedIds = new Set<string>();
  const usedUris = new Set<string>();
  const providerUseCount = new Map<string, number>();
  const kindUseCount = new Map<NonNullable<PortfolioItem['kind']>, number>();
  const remaining = ranked.filter(({ item }) => {
    const uri = imageUri(item);
    if (usedIds.has(item.id) || (uri && usedUris.has(uri))) return false;
    usedIds.add(item.id);
    if (uri) usedUris.add(uri);
    return true;
  });

  // Re-score after every pick. Provider diversity is the primary balance:
  // use every available business before repeating one. Within that, rotate
  // portfolio work, bookable services and provider covers. Shared tags and
  // the original feed position only decide between equally diverse choices.
  while (result.length < limit && remaining.length > 0) {
    remaining.sort((a, b) => {
      const aProviderUses = providerUseCount.get(a.item.providerId) ?? 0;
      const bProviderUses = providerUseCount.get(b.item.providerId) ?? 0;
      const aKindUses = kindUseCount.get(kindOf(a.item)) ?? 0;
      const bKindUses = kindUseCount.get(kindOf(b.item)) ?? 0;
      return (
        aProviderUses - bProviderUses ||
        b.differentProvider - a.differentProvider ||
        b.sameService - a.sameService ||
        aKindUses - bKindUses ||
        b.sharedTags - a.sharedTags ||
        a.position - b.position
      );
    });

    const chosen = remaining.shift()!;
    const chosenKind = kindOf(chosen.item);
    result.push(chosen.item);
    providerUseCount.set(
      chosen.item.providerId,
      (providerUseCount.get(chosen.item.providerId) ?? 0) + 1,
    );
    kindUseCount.set(chosenKind, (kindUseCount.get(chosenKind) ?? 0) + 1);
  }

  return {
    items: result.slice(0, limit),
    isFallback: false,
  };
}
