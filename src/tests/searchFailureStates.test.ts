import fs from 'fs';
import path from 'path';

/**
 * A client who searches must be able to tell "nobody matches" from "the app
 * couldn't check". Before this, a failed lookup came back as an empty result
 * and Search said "No providers found" for a search it never ran.
 */

// Which of searchProviders' three parallel lookups should fail.
const mockFail: { lookup: 'services' | 'name' | 'category' | null } = { lookup: null };

jest.mock('../lib/supabase', () => {
  // `result` runs when the query is awaited, so it can see which filters the
  // caller chained on — that's how the category lookup (the only one that
  // filters on service_category) is told apart from the name lookup.
  const chain = (result: (filteredOn: string[]) => unknown) => {
    const filteredOn: string[] = [];
    const self: Record<string, unknown> = {};
    for (const method of ['eq', 'in', 'or', 'order', 'limit', 'overlaps']) {
      self[method] = (...args: unknown[]) => {
        if (method === 'eq') filteredOn.push(String(args[0]));
        return self;
      };
    }
    self['then'] = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result(filteredOn)).then(resolve, reject);
    return self;
  };

  return {
    supabase: {
      from: (table: string) => ({
        select: (columns: string) => {
          if (table === 'services') {
            return chain(() =>
              mockFail.lookup === 'services'
                ? { data: null, error: { message: 'services lookup failed' } }
                : { data: [{ provider_id: 'p1' }], error: null },
            );
          }
          if (columns === 'id') {
            return chain((filteredOn) => {
              const which = filteredOn.includes('service_category') ? 'category' : 'name';
              return mockFail.lookup === which
                ? { data: null, error: { message: `${which} lookup failed` } }
                : { data: [{ id: 'p1' }], error: null };
            });
          }
          // The final provider fetch.
          return chain(() => ({ data: [], error: null }));
        },
      }),
    },
  };
});

import { searchProviders } from '../services/databaseService';

const read = (...parts: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

describe('searchProviders reports a failed lookup instead of returning "no matches"', () => {
  beforeEach(() => {
    mockFail.lookup = null;
  });

  it('resolves normally when every lookup succeeds', async () => {
    await expect(searchProviders('lashes')).resolves.toEqual([]);
  });

  it('rejects when the service lookup fails', async () => {
    mockFail.lookup = 'services';
    await expect(searchProviders('lashes')).rejects.toMatchObject({ message: 'services lookup failed' });
  });

  it('rejects when the provider name lookup fails', async () => {
    mockFail.lookup = 'name';
    await expect(searchProviders('lashes')).rejects.toMatchObject({ message: 'name lookup failed' });
  });

  it('rejects when the category lookup fails', async () => {
    mockFail.lookup = 'category';
    // "lashes" resolves a category hint, which is what makes lookup 3 run.
    await expect(searchProviders('lashes')).rejects.toMatchObject({ message: 'category lookup failed' });
  });
});

describe('SearchScreen tells "couldn\'t check" apart from "no matches"', () => {
  const source = read('screens', 'client', 'SearchScreen.tsx');

  it('no longer turns a failed availability or service lookup into empty data', () => {
    // The old catch blocks wrote empty Maps/Sets, which every filter then
    // read as "nobody matches".
    expect(source).not.toMatch(/\.catch\(\(\) => \{\s*if \(cancelled\) return;\s*setAvailabilityBySlug\(new Map\(\)\)/);
    expect(source).not.toMatch(/\.catch\(\(\) => \{\s*if \(cancelled\) return;\s*setPriceRangeByProviderId\(new Map\(\)\)/);
    expect(source).toContain('setAvailabilityError(true)');
    expect(source).toContain('setFacetsError(true)');
  });

  it('only marks the service lookup "loaded" when it actually answered', () => {
    const finallyBlock = source.slice(
      source.indexOf("setFacetsError(true);"),
      source.indexOf('}, [providerData, facetsRetryKey]);'),
    );
    expect(finallyBlock).not.toContain('setFacetsLoaded(true)');
  });

  it('logs every swallowed-looking failure so developers still get the real reason', () => {
    expect(source).toContain("logger.error('[Search] availability lookup failed:'");
    expect(source).toContain("logger.error('[Search] service details lookup failed:'");
    expect(source).toContain("'SearchScreen.load'");
  });

  it('shows "Couldn\'t check" (not "No providers found") when an active filter can\'t be answered', () => {
    expect(source).toContain('Couldn’t check {failedCheck.what}');
    // The empty grid comes before the filter loop, so a failed lookup can't
    // be read as every provider failing the filter.
    expect(source).toContain('if (failedCheck) return [];');
  });

  it('gives every failed operation its own retry', () => {
    expect(source).toContain('setProvidersRetryKey(k => k + 1)');
    expect(source).toContain('setAvailabilityRetryKey(k => k + 1)');
    expect(source).toContain('setFacetsRetryKey(k => k + 1)');
    // Each key is a dependency of exactly the effect it retries.
    expect(source).toContain('user?.id, providersRetryKey]');
    expect(source).toContain('activeFilters.hairType, availabilityRetryKey]');
    expect(source).toContain('[providerData, facetsRetryKey]');
  });

  it('retries a failed refresh as a refresh, so the results it says are still shown are not wiped', () => {
    const banner = source.slice(source.indexOf('Failure banner'), source.indexOf('Provider grid'));
    expect(banner).toContain('? handleRefresh');
    expect(banner).not.toContain('setProvidersRetryKey');
  });

  it('only says "Couldn\'t load providers" when no providers loaded', () => {
    expect(source).toContain('const loadFailed = providersError != null && providerData.length === 0;');
    expect(source).toContain("{loadFailed ? 'Couldn’t load providers' : 'No providers found'}");
  });

  it('shows the spinner, not "No one matches", while a hair-type or audience retry is in flight', () => {
    expect(source).toContain('(activeFilters.availableOnly || !!activeFilters.hairType) && availabilityLoading');
    expect(source).toContain('!!activeFilters.audience && !facetsLoaded && !facetsError');
  });

  it('whichever request is current clears both loading flags, so a lost race cannot pin the spinner', () => {
    const cleanups = source.match(/setProvidersLoading\(false\);\s*setRefreshing\(false\)|setRefreshing\(false\);\s*setProvidersLoading\(false\)/g) ?? [];
    expect(cleanups.length).toBeGreaterThanOrEqual(2);
  });

  it('does not claim a count of 0 when nothing could be checked', () => {
    expect(source).toContain('const countUnknown = failedCheck != null || loadFailed;');
    expect(source).toContain("countUnknown ? 'Show results'");
  });

  it('"Clear" on a failed check clears only the filters that failed, not every filter', () => {
    expect(source).toContain('clearFilterKeys(failedCheck.keys)');
  });

  it('keeps the list when a pull-to-refresh fails, but not when a new query fails', () => {
    const refresh = source.slice(
      source.indexOf('const handleRefresh = useCallback'),
      source.indexOf('const handleProviderPress'),
    );
    // Same query, so the list on screen is still the last good answer.
    expect(refresh).not.toContain('setProviderData([])');

    const load = source.slice(
      source.indexOf("'SearchScreen.load'") - 400,
      source.indexOf("'SearchScreen.load'"),
    );
    // A new query's failure must not leave the previous query's results up.
    expect(load).toContain('setProviderData([])');
  });
});
