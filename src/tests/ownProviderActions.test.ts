const mockWrite = jest.fn();
const mockOwnership = jest.fn();
const mockEq = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'viewer' } } }) },
    from: (table: string) => {
      if (table === 'providers') {
        const chain = {
          select: () => chain,
          eq: (...args: unknown[]) => { mockEq(...args); return chain; },
          maybeSingle: () => mockOwnership(),
        };
        return chain;
      }
      return { insert: mockWrite, upsert: mockWrite };
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
