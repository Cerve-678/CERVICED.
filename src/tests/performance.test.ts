import { PerformanceUtils } from '../utils/performance';

describe('PerformanceUtils', () => {
  afterEach(() => jest.useRealTimers());

  it('scales oversized images while preserving their aspect ratio', () => {
    const result = PerformanceUtils.getOptimalImageSize(10_000, 5_000);

    expect(result.width).toBeLessThan(10_000);
    expect(result.height / result.width).toBe(0.5);
  });

  it('debounces calls to the latest argument set', () => {
    jest.useFakeTimers();
    const callback = jest.fn();
    const debounced = PerformanceUtils.debounce(callback, 100);

    debounced('first');
    debounced('latest');
    jest.advanceTimersByTime(100);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('latest');
  });

  it('throttles calls until the configured window closes', () => {
    jest.useFakeTimers();
    const callback = jest.fn();
    const throttled = PerformanceUtils.throttle(callback, 100);

    throttled('first');
    throttled('ignored');
    jest.advanceTimersByTime(100);
    throttled('next');

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenNthCalledWith(1, 'first');
    expect(callback).toHaveBeenNthCalledWith(2, 'next');
  });
});
