// Portfolio Feed Aggregator
// Flattens all provider portfolios into a single browsable feed

import { providerProfiles, PortfolioItem, ServiceCategory, ProviderProfile } from './providerProfiles';

// Deterministic shuffle seeded by date so feed looks different each day but stable within a session
function seededShuffle<T>(array: T[], seed: number): T[] {
  const result = [...array];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    const temp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = temp;
  }
  return result;
}

function getDaySeed(): number {
  const now = new Date();
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

let cachedFeed: PortfolioItem[] | null = null;

export function getAllPortfolioItems(): PortfolioItem[] {
  if (cachedFeed) return cachedFeed;

  const allItems: PortfolioItem[] = [];
  for (const provider of Object.values(providerProfiles)) {
    if (provider.portfolio) {
      allItems.push(...provider.portfolio);
    }
  }

  cachedFeed = seededShuffle(allItems, getDaySeed());
  return cachedFeed;
}

export function getPortfolioByCategory(category: ServiceCategory): PortfolioItem[] {
  return getAllPortfolioItems().filter(item => item.category === category);
}

export function getPortfolioByProvider(providerId: string): PortfolioItem[] {
  return getAllPortfolioItems().filter(item => item.providerId === providerId);
}

export function searchPortfolio(query: string): PortfolioItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return getAllPortfolioItems();

  return getAllPortfolioItems().filter(item => {
    const provider = getProviderForItem(item);
    const providerName = provider?.name?.toLowerCase() || '';
    const caption = item.caption.toLowerCase();
    const tags = (item.tags || []).join(' ').toLowerCase();
    const category = item.category.toLowerCase();

    return (
      caption.includes(q) ||
      tags.includes(q) ||
      providerName.includes(q) ||
      category.includes(q)
    );
  });
}

export function getProviderForItem(item: PortfolioItem): ProviderProfile | undefined {
  return providerProfiles[item.providerId];
}

export function getPortfolioItemById(id: string): PortfolioItem | undefined {
  return getAllPortfolioItems().find(item => item.id === id);
}
