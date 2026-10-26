const mockWrite = jest.fn();
const mockOwnership = jest.fn();
const mockEq = jest.fn();
const mockDeleteEq = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'viewer' } } }, error: null }) },
    from: (table: string) => {
      if (table === 'providers') {
        const chain = {
          select: () => chain,
          eq: (...args: unknown[]) => { mockEq(...args); return chain; },
          maybeSingle: () => mockOwnership(),
        };
        return chain;
      }
      return {
        insert: mockWrite,
        upsert: mockWrite,
        // delete().eq().eq() — resolves after the second filter.
        delete: () => {
          mockWrite();
          const filter = {
            eq: (...args: unknown[]) => {
              mockDeleteEq(...args);
              return mockDeleteEq.mock.calls.length >= 2 ? Promise.resolve({ error: null }) : filter;
            },
          };
          return filter;
        },
      };
    },
  },
}));

import { addBookmark, setProviderFollowNotify } from '../services/databaseService';

const providerId = '11111111-1111-4111-8111-111111111111';
const actions = [
  ['bookmark', () => addBookmark(providerId)],
  ['bell', () => setProviderFollowNotify(providerId, true)],
] as const;

beforeEach(() => {
  jest.clearAllMocks();
  mockWrite.mockResolvedValue({ error: null });
});

it.each(actions)('blocks own-profile %s writes', async (_, action) => {
  mockOwnership.mockResolvedValue({ data: { id: providerId }, error: null });
  await expect(action()).rejects.toThrow('own profile');
  expect(mockWrite).not.toHaveBeenCalled();
  expect(mockEq).toHaveBeenCalledWith('id', providerId);
  expect(mockEq).toHaveBeenCalledWith('user_id', 'viewer');
});

it.each(actions)('blocks %s when ownership cannot be verified', async (_, action) => {
  mockOwnership.mockResolvedValue({ data: null, error: new Error('offline') });
  await expect(action()).rejects.toThrow('offline');
  expect(mockWrite).not.toHaveBeenCalled();
});

it.each(actions)('allows %s for another provider', async (_, action) => {
  mockOwnership.mockResolvedValue({ data: null, error: null });
  await action();
  expect(mockWrite).toHaveBeenCalledTimes(1);
});

// The bell is the follow. Turning it off must remove the row, not clear a
// flag: promotion/announcement audiences and follower counts read every row.
it('deletes the follow when the bell is turned off', async () => {
  mockOwnership.mockResolvedValue({ data: null, error: null });
  await setProviderFollowNotify(providerId, false);
  expect(mockWrite).toHaveBeenCalledTimes(1);
  expect(mockDeleteEq).toHaveBeenCalledWith('user_id', 'viewer');
  expect(mockDeleteEq).toHaveBeenCalledWith('provider_id', providerId);
});
