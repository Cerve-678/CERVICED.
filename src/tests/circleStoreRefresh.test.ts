// The faces on cards are cached for 5 minutes; refresh() (run when the app
// comes back to the front) must re-read the stacks already shown, so a
// friend's new recommend appears without restarting the app.

const mockGetCircle = jest.fn();
const mockGetMine = jest.fn();
jest.mock('../services/databaseService', () => ({
  CIRCLE_BATCH_LIMIT: 300,
  getCircleForProviders: (...args: unknown[]) => mockGetCircle(...args),
  getMyRecommendedProviders: (...args: unknown[]) => mockGetMine(...args),
}));

import { useCircleStore } from '../stores/useCircleStore';

const amy = { personId: 'a', name: 'Amy', avatarUrl: null, recommends: true, visits: 0 };

describe('circle store refresh', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGetCircle.mockReset();
    mockGetMine.mockReset().mockResolvedValue({ name: 'Me', avatarUrl: null, providerIds: [] });
    useCircleStore.getState().setEnabled(false);
  });
  afterEach(() => jest.useRealTimers());

  it('re-reads stacks already shown, keeping them on screen meanwhile', async () => {
    mockGetCircle.mockResolvedValueOnce({}).mockResolvedValueOnce({ p1: [amy] });
    const store = useCircleStore.getState();
    store.setEnabled(true);
    store.request('p1');
    await jest.runAllTimersAsync();
    expect(mockGetCircle).toHaveBeenCalledTimes(1);
    expect(useCircleStore.getState().byProvider['p1']).toEqual([]);

    // Inside the 5-minute cache a plain request does nothing...
    useCircleStore.getState().request('p1');
    await jest.runAllTimersAsync();
    expect(mockGetCircle).toHaveBeenCalledTimes(1);

    // ...but coming back to the app re-reads it.
    useCircleStore.getState().refresh();
    await jest.runAllTimersAsync();
    expect(mockGetCircle).toHaveBeenCalledTimes(2);
    expect(mockGetCircle).toHaveBeenLastCalledWith(['p1']);
    expect(useCircleStore.getState().byProvider['p1']).toEqual([amy]);
    expect(mockGetMine).toHaveBeenCalledTimes(2);
  });

  it('does nothing while signed out or on the provider hat', async () => {
    useCircleStore.getState().refresh();
    await jest.runAllTimersAsync();
    expect(mockGetCircle).not.toHaveBeenCalled();
    expect(mockGetMine).not.toHaveBeenCalled();
  });
});
