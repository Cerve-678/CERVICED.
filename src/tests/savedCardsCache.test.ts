const mockInvoke = jest.fn();
let mockUserId = 'client-a';

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: mockUserId } } }, error: null }),
      signOut: async () => ({ error: null }),
    },
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}));

import {
  forgetSavedCards,
  getCachedSavedCards,
  listSavedCards,
  removeSavedCard,
} from '../services/databaseService';

const visa = { id: 'pm_1', brand: 'visa', last4: '4242', expMonth: 8, expYear: 2030, wallet: null };

function answer(cards: unknown[]) {
  return { data: { cards }, error: null };
}

beforeEach(() => {
  forgetSavedCards();
  mockInvoke.mockReset();
  mockUserId = 'client-a';
});

describe('saved card cache', () => {
  it('remembers the list for the account that read it', async () => {
    mockInvoke.mockResolvedValue(answer([visa]));
    expect(getCachedSavedCards('client-a')).toBeUndefined();
    await listSavedCards();
    expect(getCachedSavedCards('client-a')).toEqual([visa]);
    expect(getCachedSavedCards('client-b')).toBeUndefined();
  });

  it('shares one read between the cart and the sheet opening on top of it', async () => {
    let resolve: (value: unknown) => void = () => {};
    mockInvoke.mockReturnValue(new Promise(r => { resolve = r; }));
    const fromCart = listSavedCards({ maxAgeMs: 60_000 });
    const fromSheet = listSavedCards({ maxAgeMs: 60_000 });
    resolve(answer([visa]));
    expect(await fromCart).toEqual([visa]);
    expect(await fromSheet).toEqual([visa]);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('skips a read inside maxAgeMs, and reads again with none given', async () => {
    mockInvoke.mockResolvedValue(answer([visa]));
    await listSavedCards();
    await listSavedCards({ maxAgeMs: 60_000 });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    await listSavedCards();
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it('forgets the list once a card is removed, even with a read in flight', async () => {
    let resolve: (value: unknown) => void = () => {};
    const pendingList = new Promise(r => { resolve = r; });
    mockInvoke.mockImplementation((_fn: string, { body }: { body: { action: string } }) =>
      body.action === 'list' ? pendingList : Promise.resolve({ data: {}, error: null }));
    const inFlight = listSavedCards();
    await removeSavedCard('pm_1');
    resolve(answer([visa]));
    await inFlight;
    expect(getCachedSavedCards('client-a')).toBeUndefined();
  });

  it('does not keep a failed read', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('boom') });
    await expect(listSavedCards()).rejects.toThrow();
    expect(getCachedSavedCards('client-a')).toBeUndefined();
  });
});
