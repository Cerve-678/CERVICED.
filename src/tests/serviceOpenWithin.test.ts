const mockRpc = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
  clearCachedReads: jest.fn(),
}));

import { AvailabilityService } from '../services/AvailabilityService';

const ymd = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// The profile's "Fully Booked" asks the server's get_services_open_within —
// the same check the bell's "has space again" alert uses — so the two can't
// disagree about whether a provider is full.
describe('hasNearTermAvailabilityForServices', () => {
  beforeEach(() => mockRpc.mockReset());

  it('asks the shared server check once, over the larger horizon', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await AvailabilityService.hasNearTermAvailabilityForServices([{ serviceId: 'a' }], 180, 14);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('get_services_open_within', { p_service_ids: ['a'], p_within_days: 180 });
  });

  it('answers the 14-day question from the earliest free day', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { service_id: 'soon', has_slot: true, next_available: ymd(3) },
        { service_id: 'later', has_slot: true, next_available: ymd(40) },
        { service_id: 'full', has_slot: false, next_available: null },
      ],
      error: null,
    });
    const result = await AvailabilityService.hasNearTermAvailabilityForServices(
      [{ serviceId: 'soon' }, { serviceId: 'later' }, { serviceId: 'full' }],
      180,
      14,
    );
    expect([...result.entries()]).toEqual([['soon', true], ['later', true], ['full', false]]);
    expect([...result.secondary!.entries()]).toEqual([['soon', true], ['later', false], ['full', false]]);
  });

  it('fails open, never claiming "fully booked" off an error or a missing answer', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('offline') });
    const failed = await AvailabilityService.hasNearTermAvailabilityForServices([{ serviceId: 'a' }], 180, 14);
    expect(failed.get('a')).toBe(true);
    expect(failed.secondary!.get('a')).toBe(true);

    mockRpc.mockResolvedValue({ data: [], error: null });
    const missing = await AvailabilityService.hasNearTermAvailabilityForServices([{ serviceId: 'b' }], 180);
    expect(missing.get('b')).toBe(true);
  });
});
