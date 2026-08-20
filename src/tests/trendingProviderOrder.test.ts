import { getTrendingProviders } from '../services/databaseService';

// The RPC returns provider ids already ranked by 7-day booking count, but the
// rows are hydrated with a .in() filter, which does NOT preserve the order of
// the ids passed to it. Observed live on 2026-08-20: the RPC ranked
// Aestheticsby N (5 bookings) first, and .in() returned Tiago Hairs (2) first.
// Without the re-sort, "Trending This Week" renders in effectively arbitrary
// order while still looking plausible — so this is the rule worth pinning.
const RANKED = {
  top:    'b6f60c71-4df6-4822-a3b5-331af4554cce', // 5 bookings
  middle: 'd631959b-468c-4a94-a4d3-df69bf4c5687', // 2 bookings
  bottom: 'a2d33893-5c62-4af9-bd4d-ebcff85504f9', // 1 booking
};

const mockRpc = jest.fn();
const mockIn = jest.fn();

jest.mock('../services/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: () => ({
      select: () => ({
        in: (...args: unknown[]) => mockIn(...args),
      }),
    }),
  },
}));

// .eq() is chained twice after .in() for has_gone_live / is_active.
const chainable = (rows: unknown[]) => {
  const result = { data: rows, error: null };
  const chain: Record<string, unknown> = {
    eq: () => chain,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return chain;
};

describe('getTrendingProviders', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockIn.mockReset();
  });

  it('restores the RPC ranking order after .in() returns rows shuffled', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { provider_id: RANKED.top,    booking_count_7d: 5 },
        { provider_id: RANKED.middle, booking_count_7d: 2 },
        { provider_id: RANKED.bottom, booking_count_7d: 1 },
      ],
      error: null,
    });
    // Deliberately the order .in() actually returned live, not the ranked one.
    mockIn.mockReturnValue(
      chainable([
        { id: RANKED.middle },
        { id: RANKED.top },
        { id: RANKED.bottom },
      ]),
    );

    const result = await getTrendingProviders(15);

    expect(result.map((p) => p.id)).toEqual([
      RANKED.top,
      RANKED.middle,
      RANKED.bottom,
    ]);
  });

  it('drops ranked ids whose provider row was filtered out', async () => {
    // A provider can rank in the RPC (it only checks has_gone_live/is_active
    // at aggregation time) but still be missing from the hydrate query. The
    // result must not contain an undefined hole where that row would be.
    mockRpc.mockResolvedValue({
      data: [
        { provider_id: RANKED.top,    booking_count_7d: 5 },
        { provider_id: RANKED.middle, booking_count_7d: 2 },
      ],
      error: null,
    });
    mockIn.mockReturnValue(chainable([{ id: RANKED.middle }]));

    const result = await getTrendingProviders(15);

    expect(result.map((p) => p.id)).toEqual([RANKED.middle]);
    expect(result).not.toContain(undefined);
  });

  it('skips the hydrate query entirely when nothing is trending', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const result = await getTrendingProviders(15);

    expect(result).toEqual([]);
    expect(mockIn).not.toHaveBeenCalled();
  });
});
