import { getClientPointsBalance, getClientPointsHistory } from '../services/databaseService';

const mockRpc = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

describe('client points RPC wrappers', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('getClientPointsBalance returns the RPC result', async () => {
    mockRpc.mockResolvedValue({ data: 320, error: null });

    const balance = await getClientPointsBalance();

    expect(balance).toBe(320);
    expect(mockRpc).toHaveBeenCalledWith('get_client_points_balance');
  });

  it('getClientPointsBalance defaults to 0 when the RPC returns null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    expect(await getClientPointsBalance()).toBe(0);
  });

  it('getClientPointsBalance throws rather than swallowing an RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('permission denied') });

    await expect(getClientPointsBalance()).rejects.toThrow('permission denied');
  });

  it('getClientPointsHistory passes the limit through and returns typed rows', async () => {
    const rows = [
      { id: 'a', delta: 50, reason: 'booking_completed', created_at: '2026-08-28T10:00:00Z' },
      { id: 'b', delta: 20, reason: 'review_left', created_at: '2026-08-27T10:00:00Z' },
    ];
    mockRpc.mockResolvedValue({ data: rows, error: null });

    const history = await getClientPointsHistory(10);

    expect(history).toEqual(rows);
    expect(mockRpc).toHaveBeenCalledWith('get_client_points_history', { p_limit: 10 });
  });

  it('getClientPointsHistory defaults to an empty array when the RPC returns null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    expect(await getClientPointsHistory()).toEqual([]);
  });

  it('getClientPointsHistory throws rather than swallowing an RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('permission denied') });

    await expect(getClientPointsHistory()).rejects.toThrow('permission denied');
  });
});
