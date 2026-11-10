import { act, renderHook } from '@testing-library/react-native';
import { allPartsDone, useRevealTogether } from '../features/home/useRevealTogether';

const PARTS = ['providers', 'rails'] as const;

describe('useRevealTogether', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('waits for every part, then shows them together', () => {
    const { result } = renderHook(() => useRevealTogether(PARTS, 1500));
    expect(result.current.ready).toBe(false);
    act(() => result.current.markDone('providers'));
    expect(result.current.ready).toBe(false);
    act(() => result.current.markDone('providers')); // twice is still once
    expect(result.current.ready).toBe(false);
    act(() => result.current.markDone('rails'));
    expect(result.current.ready).toBe(true);
  });

  it('never holds the screen longer than the limit', () => {
    const { result } = renderHook(() => useRevealTogether(PARTS, 1500));
    act(() => result.current.markDone('providers'));
    act(() => { jest.advanceTimersByTime(1499); });
    expect(result.current.ready).toBe(false);
    act(() => { jest.advanceTimersByTime(1); });
    expect(result.current.ready).toBe(true);
  });

  it('keeps the same markDone between renders, so effects using it do not re-run', () => {
    const { result, rerender } = renderHook(() => useRevealTogether(PARTS, 1500));
    const first = result.current.markDone;
    rerender({});
    expect(result.current.markDone).toBe(first);
  });

  it('allPartsDone needs every part', () => {
    expect(allPartsDone(PARTS, new Set(['providers']))).toBe(false);
    expect(allPartsDone(PARTS, new Set(['providers', 'rails']))).toBe(true);
  });
});
