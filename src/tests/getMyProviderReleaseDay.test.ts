const mockResult: { data: unknown; error: unknown } = { data: null, error: null };
const mockEq = jest.fn();

// "Mock" prefix: jest.mock factories may only reference names starting with it.
type MockChain = {
  select: () => MockChain;
  eq: (...args: unknown[]) => MockChain;
  order: () => MockChain;
  limit: () => MockChain;
  maybeSingle: () => Promise<typeof mockResult>;
};

jest.mock('../lib/supabase', () => {
  const chain: MockChain = {
    select: () => chain,
    eq: (...args: unknown[]) => { mockEq(...args); return chain; },
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve(mockResult),
  };
  return { supabase: { from: () => chain }, clearCachedReads: jest.fn() };
});

import { getMyProviderReleaseDay } from '../services/databaseService';

// Edit Profile re-reads the release day on focus, so a day changed in
// Scheduling & Availability shows there too instead of being saved over.
describe('getMyProviderReleaseDay', () => {
  beforeEach(() => {
    mockEq.mockReset();
    mockResult.data = null;
    mockResult.error = null;
  });

  it('reads the signed-in provider own row', async () => {
    mockResult.data = { schedule_release_day: 25 };
    await expect(getMyProviderReleaseDay('u1')).resolves.toBe(25);
    expect(mockEq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('is null with no release day or no provider row', async () => {
    mockResult.data = { schedule_release_day: null };
    await expect(getMyProviderReleaseDay('u1')).resolves.toBeNull();
    mockResult.data = null;
    await expect(getMyProviderReleaseDay('u1')).resolves.toBeNull();
  });

  it('throws when the read fails', async () => {
    mockResult.error = new Error('offline');
    await expect(getMyProviderReleaseDay('u1')).rejects.toThrow('offline');
  });
});
