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

import { getMyProviderRelease } from '../services/databaseService';

// Edit Profile re-reads the release day and time on focus, so a change made
// in Scheduling & Availability shows there too instead of being saved over.
describe('getMyProviderRelease', () => {
  beforeEach(() => {
    mockEq.mockReset();
    mockResult.data = null;
    mockResult.error = null;
  });

  it('reads the signed-in provider own row', async () => {
    mockResult.data = { schedule_release_day: 25, schedule_release_time: '19:00' };
    await expect(getMyProviderRelease('u1')).resolves.toEqual({ day: 25, time: '19:00' });
    expect(mockEq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('has no day, and the 9am default, with no release day or no provider row', async () => {
    mockResult.data = { schedule_release_day: null, schedule_release_time: null };
    await expect(getMyProviderRelease('u1')).resolves.toEqual({ day: null, time: '09:00' });
    mockResult.data = null;
    await expect(getMyProviderRelease('u1')).resolves.toEqual({ day: null, time: '09:00' });
  });

  it('throws when the read fails', async () => {
    mockResult.error = new Error('offline');
    await expect(getMyProviderRelease('u1')).rejects.toThrow('offline');
  });
});
