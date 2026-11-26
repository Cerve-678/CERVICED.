// Every bell and the Notifications screen listen to one shared realtime
// channel per user, closed only when the last listener leaves.
const mockHandlers: Record<string, (payload: { new: unknown }) => void> = {};
interface FakeChannel {
  on: jest.Mock<FakeChannel, [string, { event: string }, (payload: { new: unknown }) => void]>;
  subscribe: jest.Mock<FakeChannel, []>;
}
const mockChannel: FakeChannel = {
  on: jest.fn((_kind: string, filter: { event: string }, cb: (payload: { new: unknown }) => void): FakeChannel => {
    mockHandlers[filter.event] = cb;
    return mockChannel;
  }),
  subscribe: jest.fn((): FakeChannel => mockChannel),
};
const mockSupabase = {
  channel: jest.fn(() => mockChannel),
  removeChannel: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../lib/supabase', () => ({
  get supabase() { return mockSupabase; },
  clearCachedReads: jest.fn(),
}));

import { subscribeToNotificationChanges } from '../services/database/notifications';

test('two listeners share one channel, and it closes after the last one leaves', () => {
  const bell = { insert: jest.fn(), update: jest.fn() };
  const screen = { insert: jest.fn(), update: jest.fn() };

  const stopBell = subscribeToNotificationChanges('user-1', bell.insert, bell.update);
  const stopScreen = subscribeToNotificationChanges('user-1', screen.insert, screen.update);
  expect(mockSupabase.channel).toHaveBeenCalledTimes(1);

  mockHandlers['INSERT']!({ new: { id: 'n1', recipient_role: 'client' } });
  expect(bell.insert).toHaveBeenCalledTimes(1);
  expect(screen.insert).toHaveBeenCalledTimes(1);

  stopScreen();
  expect(mockSupabase.removeChannel).not.toHaveBeenCalled();
  mockHandlers['UPDATE']!({ new: { id: 'n1', recipient_role: 'client' } });
  expect(bell.update).toHaveBeenCalledTimes(1);
  expect(screen.update).not.toHaveBeenCalled();

  stopBell();
  expect(mockSupabase.removeChannel).toHaveBeenCalledWith(mockChannel);

  // A later listener opens a fresh channel.
  subscribeToNotificationChanges('user-1', jest.fn(), jest.fn())();
  expect(mockSupabase.channel).toHaveBeenCalledTimes(2);
});
