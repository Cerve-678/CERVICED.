import { getProviderConversations } from '../services/databaseService';

const mockState = {
  conversations: [] as any[],
  bookings: [] as any[],
  bookingError: null as any,
  calls: [] as { table: string; filters: any[]; range?: number[] }[],
};

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) },
    rpc: async () => ({ data: [], error: null }),
    from: (table: string) => {
      const call: any = { table, filters: [] };
      mockState.calls.push(call);
      const query: any = {};
      for (const method of ['select', 'eq', 'neq', 'in', 'order', 'limit', 'maybeSingle']) {
        query[method] = (...args: any[]) => { call.filters.push([method, ...args]); return query; };
      }
      query.range = (from: number, to: number) => { call.range = [from, to]; return query; };
      query.then = (resolve: any, reject: any) => {
        let data: any = table === 'providers' ? { id: 'provider-1' } : mockState.conversations;
        if (table === 'bookings') {
          data = mockState.bookings.filter(row => call.filters.every(([method, key, value]: any[]) => {
            if (method === 'eq') return row[key] === value;
            if (method === 'neq') return row[key] !== value;
            if (method === 'in') return value.includes(row[key]);
            return true;
          }));
          if (call.range) data = data.slice(call.range[0], call.range[1] + 1);
        }
        return Promise.resolve({ data, error: table === 'bookings' ? mockState.bookingError : null }).then(resolve, reject);
      };
      return query;
    },
  },
}));

const conversation = (userId: string) => ({ id: `conversation-${userId}`, user_id: userId, provider_id: 'provider-1' });
const booking = (userId: string, status = 'completed', providerId = 'provider-1') => ({
  id: `booking-${userId}`, user_id: userId, provider_id: providerId, status,
});

beforeEach(() => {
  mockState.conversations = [];
  mockState.bookings = [];
  mockState.bookingError = null;
  mockState.calls = [];
});

it('separates enquiries from pending, current and past clients of this provider', async () => {
  mockState.conversations = ['enquiry', 'pending', 'past', 'current', 'cancelled', 'other-provider'].map(conversation);
  mockState.bookings = [booking('pending', 'pending'), booking('past'), booking('current', 'confirmed'), booking('cancelled', 'cancelled'), booking('other-provider', 'completed', 'provider-2')];
  const result = await getProviderConversations();
  expect(result.filter(c => c.has_booking).map(c => c.user_id)).toEqual(['pending', 'past', 'current']);
  expect(result.filter(c => !c.has_booking).map(c => c.user_id)).toEqual(['enquiry', 'cancelled', 'other-provider']);
});

it('finds clients beyond the first booking page without a diary date cutoff', async () => {
  mockState.conversations = ['frequent', 'older', 'enquiry'].map(conversation);
  mockState.bookings = [...Array.from({ length: 500 }, () => booking('frequent')), booking('older')];
  const result = await getProviderConversations();
  expect(result.find(c => c.user_id === 'older')?.has_booking).toBe(true);
  expect(mockState.calls.filter(c => c.table === 'bookings').map(c => c.range)).toEqual([[0, 499], [500, 999]]);
});

it('moves an enquiry into messages after a booking while preserving the conversation', async () => {
  mockState.conversations = [conversation('new-client')];
  expect((await getProviderConversations())[0]?.has_booking).toBe(false);
  mockState.bookings = [booking('new-client', 'pending')];
  expect((await getProviderConversations())[0]).toMatchObject({ id: 'conversation-new-client', has_booking: true });
});

it('surfaces a classification failure rather than silently treating clients as enquiries', async () => {
  mockState.conversations = [conversation('client')];
  mockState.bookingError = new Error('Offline');
  await expect(getProviderConversations()).rejects.toThrow('Offline');
});

it('does not fetch booking history for an empty inbox', async () => {
  expect(await getProviderConversations()).toEqual([]);
  expect(mockState.calls.some(c => c.table === 'bookings')).toBe(false);
});
