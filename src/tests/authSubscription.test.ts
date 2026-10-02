import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

let mockListener: (event: AuthChangeEvent, session: Session | null) => unknown;
const mockUnsubscribe = jest.fn();
const mockReportError = jest.fn();
jest.mock('../lib/supabase', () => ({
  supabase: { auth: { onAuthStateChange: (listener: typeof mockListener) => {
    mockListener = listener;
    return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
  } } },
}));
jest.mock('../utils/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

import { subscribeToAuthStateChanges } from '../services/databaseService';

beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('releases the auth lock before a listener queries the session', async () => {
  let locked = true;
  const query = jest.fn(async () => {
    if (locked) throw new Error('Session lock is still held');
  });
  const stop = subscribeToAuthStateChanges(query);
  expect(mockListener('INITIAL_SESSION', null)).toBeUndefined();
  expect(query).not.toHaveBeenCalled();
  locked = false;
  await jest.runAllTimersAsync();
  expect(query).toHaveBeenCalledWith('INITIAL_SESSION', null);
  expect(mockReportError).not.toHaveBeenCalled();
  stop();
});

test('does not block later auth events on a slow profile request', async () => {
  const received: AuthChangeEvent[] = [];
  const stop = subscribeToAuthStateChanges(event => {
    received.push(event);
    return new Promise<void>(() => {});
  });
  mockListener('SIGNED_IN', null);
  mockListener('SIGNED_OUT', null);
  await jest.runAllTimersAsync();
  expect(received).toEqual(['SIGNED_IN', 'SIGNED_OUT']);
  stop();
});

test('unsubscribe cancels queued callbacks', async () => {
  const listener = jest.fn();
  const stop = subscribeToAuthStateChanges(listener);
  mockListener('INITIAL_SESSION', null);
  stop();
  await jest.runAllTimersAsync();
  expect(listener).not.toHaveBeenCalled();
  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
});

test.each([false, true])('reports callback failure without an unhandled rejection (async=%s)', async asyncFailure => {
  const error = new Error('Profile failed');
  const stop = subscribeToAuthStateChanges(() => {
    if (asyncFailure) return Promise.reject(error);
    throw error;
  });
  mockListener('INITIAL_SESSION', null);
  await jest.runAllTimersAsync();
  expect(mockReportError).toHaveBeenCalledWith(error, 'auth:state-change');
  stop();
});
