// Favourites (and every collection) builds its service cards with the same
// mapper as the Discover feed, so the saved-looks query must ask for every
// column the Discover query does. When it left out service_category the
// mapper threw and folders said "Can't show these looks right now".

const selects = new Map<string, string>();

function mockChain(select: string, table: string) {
  const result = { data: [], error: null };
  const builder: Record<string, unknown> = {
    then: (resolve: (v: typeof result) => unknown) => resolve(result),
  };
  for (const m of ['eq', 'in', 'or', 'not', 'order', 'limit', 'range']) {
    builder[m] = () => builder;
  }
  selects.set(`${table}:${selects.size}`, select);
  return builder;
}

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({ select: (cols: string) => mockChain(cols, table) }),
    rpc: jest.fn(),
  },
  clearCachedReads: jest.fn(),
}));

jest.mock('../services/database/account', () => ({
  getSessionUser: jest.fn(),
  ownProviderIdExclusion: jest.fn(async () => '()'),
}));

import { getDiscoverServices, getSavedPortfolioDetails } from '../services/database/portfolio';

const columns = (select: string) =>
  select
    .replace(/!inner/g, '')
    .replace(/\s+/g, ' ')
    .trim();

describe('saved looks ask for what the service cards read', () => {
  beforeEach(() => selects.clear());

  it('selects the same service columns as the Discover feed', async () => {
    await getDiscoverServices('All', 10, undefined, { excludeOwnProvider: false });
    await getSavedPortfolioDetails(['service-abc__0']);
    const serviceSelects = [...selects.entries()].filter(([k]) => k.startsWith('services:')).map(([, v]) => v);
    expect(serviceSelects).toHaveLength(2);
    const [discover = '', saved = ''] = serviceSelects;
    expect(columns(saved)).toBe(columns(discover));
    expect(saved).toContain('service_category');
    expect(saved).toContain('aspect_ratio');
  });
});
