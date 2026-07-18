// Portfolio data now comes from Supabase via databaseService.getPortfolioItems().
// These stubs exist only for backward-compat during the transition.

import { PortfolioItem, ProviderProfile } from '../types/providers';

export function getAllPortfolioItems(): PortfolioItem[] { return []; }
export function getPortfolioByCategory(): PortfolioItem[] { return []; }
export function getPortfolioByProvider(): PortfolioItem[] { return []; }
export function searchPortfolio(): PortfolioItem[] { return []; }
export function getProviderForItem(_item: PortfolioItem): ProviderProfile | undefined { return undefined; }
export function getPortfolioItemById(_id: string): PortfolioItem | undefined { return undefined; }
