/**
 * A provider wearing their client hat is a normal client everywhere else in
 * the app, which is exactly why every discovery query happily recommended
 * them their own business — a result they can neither book nor usefully
 * browse. These pin the exclusion, and the two ways it is easy to get wrong:
 * dropping only the canonical provider row when an account owns duplicates,
 * and taking the whole feed down when the ownership lookup itself fails.
 */

const mockState: {
  userId: string | null;
  ownRows: { id: string }[];
  ownError: { message: string } | null;
  /** Every filter call made on the discovery query, in order. */
  filters: { method: string; args: unknown[] }[];
} = { userId: null, ownRows: [], ownError: null, filters: [] };

jest.mock('../lib/supabase', () => {
  const chain = (result: () => unknown, record: boolean) => {
    const self: Record<string, unknown> = {};
    for (const method of ['eq', 'not', 'in', 'or', 'gte', 'order', 'limit']) {
      self[method] = (...args: unknown[]) => {
        if (record) mockState.filters.push({ method, args });
        return self;
      };
    }
    self['then'] = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve);
    return self;
  };

  return {
    supabase: {
      auth: {
        getSession: async () => ({
          data: {
            session: mockState.userId ? { user: { id: mockState.userId } } : null,
          },
          error: null,
        }),
      },
      // `select("id")` is the ownership lookup; anything else is the
      // client-facing query under test.
      from: () => ({
        select: (columns: string) =>
          columns === 'id'
            ? chain(
                () => ({
                  data: mockState.ownError ? null : mockState.ownRows,
                  error: mockState.ownError,
                }),
                false,
              )
            : chain(() => ({ data: [], error: null }), true),
      }),
    },
  };
});

import { getProviders, getPortfolioItems } from '../services/databaseService';

/** The `.not(column, "in", …)` filter the query under test was given. */
const exclusion = (): { column: string; value: string } | null => {
  const call = mockState.filters.find(
    (f) => f.method === 'not' && f.args[1] === 'in',
  );
  return call
    ? { column: call.args[0] as string, value: call.args[2] as string }
    : null;
};

const NO_SUCH_PROVIDER = '(00000000-0000-0000-0000-000000000000)';

describe('own profile is never recommended back to its owner', () => {
  beforeEach(() => {
    mockState.ownRows = [];
    mockState.ownError = null;
    mockState.filters = [];
    // The ownership answer is memoised per auth user id, so each case signs
    // in as a different user rather than reaching into module state — which
    // also pins that the cache is keyed, and can't leak between accounts.
    mockState.userId = `user-${Math.random().toString(36).slice(2)}`;
  });

  it('excludes the signed-in provider from the provider list', async () => {
    mockState.ownRows = [{ id: 'mine-1' }];

    await getProviders();

    expect(exclusion()).toEqual({ column: 'id', value: '(mine-1)' });
  });

  it('excludes every provider row the account owns, not just the first', async () => {
    // Duplicate provider rows exist on a handful of accounts from earlier
    // account churn (see getProviderProfileForUserId). Excluding only the
    // canonical row would leave the duplicate sitting in the feed.
    mockState.ownRows = [{ id: 'mine-1' }, { id: 'mine-dupe' }];

    await getProviders();

    expect(exclusion()?.value).toBe('(mine-1,mine-dupe)');
  });

  it('excludes nothing real for a client with no provider profile', async () => {
    await getProviders();

    expect(exclusion()?.value).toBe(NO_SUCH_PROVIDER);
  });

  it('excludes nothing real when signed out', async () => {
    mockState.userId = null;

    await getProviders();

    expect(exclusion()?.value).toBe(NO_SUCH_PROVIDER);
  });

  it('filters portfolio discovery on provider_id, not the joined row', async () => {
    // portfolio_items.provider_id is NOT NULL, so this needs no foreign-table
    // filter and loses no rows to `NULL NOT IN (…)` evaluating to NULL.
    mockState.ownRows = [{ id: 'mine-1' }];

    await getPortfolioItems();

    expect(exclusion()).toEqual({ column: 'provider_id', value: '(mine-1)' });
  });

  it('still returns the feed when the ownership lookup fails', async () => {
    // The exclusion decorates an otherwise valid query. Failing hard here
    // would blank out Home and Explore over a filter whose worst case is
    // seeing your own card once.
    mockState.ownError = { message: 'network' };

    await expect(getProviders()).resolves.toEqual([]);
    expect(exclusion()?.value).toBe(NO_SUCH_PROVIDER);
  });
});
