import React from 'react';
import { act, render } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BookingProvider, useBooking } from '../contexts/BookingContext';
import { STORAGE_KEYS } from '../utils/storageKeys';

// BookingProvider sits above the auth-gated navigator for the whole app
// session. It used to load once at launch, so a logout → login left the next
// account waiting on whichever screen happened to ask, kept the previous
// account's bookings in memory, and kept its realtime subscription pointed at
// the previous account. These pin the provider to the signed-in session.

let mockSession: { user: { id: string } } | null = null;
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ session: mockSession }),
}));

const mockGetMyBookings = jest.fn();
const mockUnsubscribe = jest.fn();
const mockSubscribe = jest.fn((_userId: string, _onChange: () => void) => mockUnsubscribe);
jest.mock('../services/databaseService', () => ({
  getMyBookings: () => mockGetMyBookings(),
  getSessionUserId: async () => mockSession?.user.id ?? null,
  getCurrentAuthUserId: async () => mockSession?.user.id ?? null,
  getActiveRescheduleRequestsForBookings: async () => ({}),
  subscribeToUserBookingChanges: (userId: string, onChange: () => void) => mockSubscribe(userId, onChange),
  subscribeToRescheduleRequestChanges: () => () => {},
}));

// The real mapper's field-by-field conversion isn't what's under test here.
jest.mock('../services/bookingService', () => ({
  mapDbBookingToConfirmed: (row: { id: string }) => ({
    id: row.id,
    bookingDate: '2099-01-01',
    bookingTime: '10:00 AM',
    endTime: '11:00 AM',
    status: 'upcoming',
  }),
  applyRescheduleRequestRow: (booking: unknown) => booking,
}));

type Ctx = ReturnType<typeof useBooking>;
let ctx: Ctx | null = null;
const Probe = () => {
  ctx = useBooking();
  return null;
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
};

const renderProvider = () =>
  render(
    <BookingProvider>
      <Probe />
    </BookingProvider>,
  );

const ids = () => (ctx?.bookings ?? []).map(b => b.id);

beforeEach(async () => {
  mockSession = null;
  ctx = null;
  mockGetMyBookings.mockReset();
  mockSubscribe.mockClear();
  mockUnsubscribe.mockClear();
  await AsyncStorage.clear();
});

describe('BookingProvider follows sign-in', () => {
  it('starts loading the moment a session appears, without any screen asking', async () => {
    mockGetMyBookings.mockResolvedValue([{ id: 'a-1' }]);
    const view = renderProvider();
    expect(mockGetMyBookings).not.toHaveBeenCalled();

    mockSession = { user: { id: 'user-a' } };
    await act(async () => { view.rerender(<BookingProvider><Probe /></BookingProvider>); });

    expect(mockGetMyBookings).toHaveBeenCalledTimes(1);
    expect(ids()).toEqual(['a-1']);
    expect(ctx?.isLoading).toBe(false);
    expect(mockSubscribe).toHaveBeenCalledWith('user-a', expect.any(Function));
  });

  it('clears in-memory bookings and the realtime subscription on sign-out', async () => {
    mockSession = { user: { id: 'user-a' } };
    mockGetMyBookings.mockResolvedValue([{ id: 'a-1' }]);
    const view = renderProvider();
    await act(async () => {});
    expect(ids()).toEqual(['a-1']);

    mockSession = null;
    await act(async () => { view.rerender(<BookingProvider><Probe /></BookingProvider>); });

    expect(ids()).toEqual([]);
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it("drops a slow load for the previous account instead of showing it to the next", async () => {
    const slowA = deferred<{ id: string }[]>();
    mockGetMyBookings.mockReturnValueOnce(slowA.promise).mockResolvedValueOnce([{ id: 'b-1' }]);
    mockSession = { user: { id: 'user-a' } };
    const view = renderProvider();
    await act(async () => {});

    mockSession = null;
    await act(async () => { view.rerender(<BookingProvider><Probe /></BookingProvider>); });
    mockSession = { user: { id: 'user-b' } };
    await act(async () => { view.rerender(<BookingProvider><Probe /></BookingProvider>); });
    expect(ids()).toEqual(['b-1']);

    await act(async () => { slowA.resolve([{ id: 'a-1' }]); });

    expect(ids()).toEqual(['b-1']);
    const cached = JSON.parse((await AsyncStorage.getItem(STORAGE_KEYS.BOOKINGS)) ?? '[]');
    expect(cached.map((b: { id: string }) => b.id)).toEqual(['b-1']);
    expect(mockSubscribe).toHaveBeenLastCalledWith('user-b', expect.any(Function));
  });

  it("never shows another account's cache when sign-out skipped logout()'s cleanup", async () => {
    // Account A's cache left behind by a session that expired server-side —
    // logout() never ran, so @bookings was never removed.
    await AsyncStorage.setItem(STORAGE_KEYS.BOOKINGS, JSON.stringify([
      { id: 'booking_local-a', bookingDate: '2099-01-01', bookingTime: '10:00 AM', status: 'upcoming' },
    ]));
    await AsyncStorage.setItem(STORAGE_KEYS.BOOKINGS_OWNER, 'user-a');
    const seen: string[][] = [];
    const Recorder = () => {
      const c = useBooking();
      seen.push(c.bookings.map(b => b.id));
      return null;
    };
    mockGetMyBookings.mockResolvedValue([]);
    mockSession = { user: { id: 'user-b' } };
    render(<BookingProvider><Recorder /></BookingProvider>);
    await act(async () => {});

    expect(seen.flat()).not.toContain('booking_local-a');
    expect(await AsyncStorage.getItem(STORAGE_KEYS.BOOKINGS_OWNER)).toBe('user-b');
  });

  it("still shows the same account's cache straight away on the next launch", async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.BOOKINGS, JSON.stringify([
      { id: 'a-1', bookingDate: '2099-01-01', bookingTime: '10:00 AM', endTime: '11:00 AM', status: 'upcoming' },
    ]));
    await AsyncStorage.setItem(STORAGE_KEYS.BOOKINGS_OWNER, 'user-a');
    mockGetMyBookings.mockReturnValue(new Promise(() => {})); // network never answers
    mockSession = { user: { id: 'user-a' } };
    renderProvider();
    await act(async () => {});

    expect(ids()).toEqual(['a-1']);
    expect(ctx?.isLoading).toBe(false);
  });

  it('lets a screen join the sign-in load rather than starting a second one', async () => {
    const load = deferred<{ id: string }[]>();
    mockGetMyBookings.mockReturnValue(load.promise);
    mockSession = { user: { id: 'user-a' } };
    renderProvider();
    await act(async () => {});

    let joined: Promise<void> | undefined;
    act(() => { joined = ctx?.reloadBookingsIfStale(); });
    await act(async () => { load.resolve([{ id: 'a-1' }]); await joined; });

    expect(mockGetMyBookings).toHaveBeenCalledTimes(1);
    expect(ids()).toEqual(['a-1']);
  });
});
