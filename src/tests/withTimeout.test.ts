import { withTimeout } from '../utils/withTimeout';

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('returns the operation result before its deadline', async () => {
  await expect(withTimeout(Promise.resolve('ready'), 1_000, 'test')).resolves.toBe('ready');
});

test('rejects a stalled operation with an actionable label', async () => {
  const result = withTimeout(new Promise<void>(() => {}), 1_000, 'Explore feed');
  jest.advanceTimersByTime(1_000);
  await expect(result).rejects.toThrow('Explore feed timed out');
});
