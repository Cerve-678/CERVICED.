import {
  addDays,
  chartBuckets,
  currentWindow,
  inWindow,
  previousPeriodLabel,
  previousWindow,
} from '../utils/analyticsPeriod';

const TODAY = '2026-09-27';

describe('analytics period windows', () => {
  it('7 days is today plus the six days before it, boundary day included', () => {
    const w = currentWindow('7d', TODAY)!;
    expect(w).toEqual({ start: '2026-09-21', end: TODAY });
    expect(inWindow('2026-09-21', w)).toBe(true);
    expect(inWindow('2026-09-20', w)).toBe(false);
    expect(inWindow('2026-09-28', w)).toBe(false);
  });

  it('the previous 7-day window is the same length and never overlaps the current one', () => {
    const cur = currentWindow('7d', TODAY)!;
    const prev = previousWindow('7d', TODAY)!;
    expect(addDays(prev.end, 1)).toBe(cur.start);
    expect(prev).toEqual({ start: '2026-09-14', end: '2026-09-20' });
  });

  it('30 days is the last 5 calendar months, the current one partial', () => {
    expect(currentWindow('30d', TODAY)).toEqual({ start: '2026-05-01', end: TODAY });
  });

  it('the previous 30-day window is the 5 calendar months before that, with no gap or overlap', () => {
    const cur = currentWindow('30d', TODAY)!;
    const prev = previousWindow('30d', TODAY)!;
    expect(prev).toEqual({ start: '2025-12-01', end: '2026-04-30' });
    expect(addDays(prev.end, 1)).toBe(cur.start);
  });

  it('90 days is the last 5 quarters (15 months), the current one partial', () => {
    expect(currentWindow('90d', TODAY)).toEqual({ start: '2025-07-01', end: TODAY });
  });

  it('the previous 90-day window is the 5 quarters before that, with no gap or overlap', () => {
    const cur = currentWindow('90d', TODAY)!;
    const prev = previousWindow('90d', TODAY)!;
    expect(prev).toEqual({ start: '2024-04-01', end: '2025-06-30' });
    expect(addDays(prev.end, 1)).toBe(cur.start);
  });

  it('all time has no window and nothing to compare against', () => {
    expect(currentWindow('all', TODAY)).toBeNull();
    expect(previousWindow('all', TODAY)).toBeNull();
    expect(previousPeriodLabel('all')).toBeNull();
    expect(inWindow('1999-01-01', null)).toBe(true);
    expect(previousPeriodLabel('7d')).toBe('previous 7 days');
    expect(previousPeriodLabel('30d')).toBe('previous 5 months');
    expect(previousPeriodLabel('90d')).toBe('previous 5 quarters');
  });

  it('month arithmetic survives a short month', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('chart buckets tile the range exactly', () => {
  it('7d: one bar per day, contiguous, ends today', () => {
    const buckets = chartBuckets('7d', TODAY);
    const window = currentWindow('7d', TODAY)!;
    expect(buckets).toHaveLength(7);
    expect(buckets[0]!.start).toBe(window.start);
    expect(buckets[buckets.length - 1]!.end).toBe(TODAY);
    for (let i = 1; i < buckets.length; i++) {
      expect(addDays(buckets[i - 1]!.end, 1)).toBe(buckets[i]!.start);
    }
  });

  it('30d: 5 single-month bars, May through the partial September', () => {
    const buckets = chartBuckets('30d', TODAY);
    expect(buckets.map(({ label: _label, ...rest }) => rest)).toEqual([
      { start: '2026-05-01', end: '2026-05-31' },
      { start: '2026-06-01', end: '2026-06-30' },
      { start: '2026-07-01', end: '2026-07-31' },
      { start: '2026-08-01', end: '2026-08-31' },
      { start: '2026-09-01', end: TODAY },
    ]);
  });

  it('90d: 5 quarter bars, contiguous back to last September, one genuinely starting in April', () => {
    const buckets = chartBuckets('90d', TODAY);
    expect(buckets.map(({ label: _label, ...rest }) => rest)).toEqual([
      { start: '2025-07-01', end: '2025-09-30' },
      { start: '2025-10-01', end: '2025-12-31' },
      { start: '2026-01-01', end: '2026-03-31' },
      { start: '2026-04-01', end: '2026-06-30' },
      { start: '2026-07-01', end: TODAY },
    ]);
    for (let i = 1; i < buckets.length; i++) {
      expect(addDays(buckets[i - 1]!.end, 1)).toBe(buckets[i]!.start);
    }
  });

  it('all time is calendar months: at least 6, at most 12, ending this month uncapped', () => {
    const fresh = chartBuckets('all', TODAY, '2026-09-01');
    expect(fresh).toHaveLength(6);
    expect(fresh[5]).toMatchObject({ start: '2026-09-01', end: '2026-09-30' });
    expect(fresh[0]!.start).toBe('2026-04-01');

    expect(chartBuckets('all', TODAY, '2026-01-15')).toHaveLength(9);
    expect(chartBuckets('all', TODAY, '2020-01-01')).toHaveLength(12);
    expect(chartBuckets('all', TODAY, null)).toHaveLength(6);
  });
});
