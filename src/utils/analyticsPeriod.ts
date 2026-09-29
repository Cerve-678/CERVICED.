import { dateToYMD } from './dateUtils';

/** The range selector on the provider analytics screen. Only "7d" is a
 *  day-level window. Despite the label, '30d' is bucketed as the last six
 *  calendar months, and '90d' as the last several quarters — both in real
 *  calendar months, not a literal day count. */
export type AnalyticsRange = '7d' | '30d' | '90d' | 'all';

/** Inclusive YYYY-MM-DD window. */
export interface PeriodWindow {
  start: string;
  end: string;
}

export interface ChartBucket {
  label: string;
  start: string;
  end: string;
}

// Parsed at noon so a DST change can never roll the calendar day.
function parseYMD(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 12);
}

export function addDays(ymd: string, n: number): string {
  const d = parseYMD(ymd);
  d.setDate(d.getDate() + n);
  return dateToYMD(d);
}

function shiftMonthStart(ymd: string, months: number): string {
  const d = parseYMD(ymd);
  return dateToYMD(new Date(d.getFullYear(), d.getMonth() + months, 1, 12));
}

// The '30d' pill shows the last six calendar months as 6 single-month bars.
// '90d' = 5 three-month (quarter) bars, i.e. 15 months of history grouped in 3s.
// Both end on the current, partial month/quarter.
const MONTH_RANGE_CONFIG = {
  '30d': { bars: 6, monthsPerBar: 1 },
  '90d': { bars: 5, monthsPerBar: 3 },
} as const;

/** `barCount` buckets of `monthsPerBar` calendar months each, most recent
 *  first-of-month back to oldest, ending on the month/quarter `today` falls
 *  in. The last bucket's end is capped at `today` when `capCurrent` (the
 *  in-progress month/quarter hasn't happened yet); earlier buckets always
 *  run to their real end-of-period. */
function calendarBuckets(
  barCount: number,
  monthsPerBar: number,
  today: string,
  capCurrent: boolean,
): ChartBucket[] {
  const now = parseYMD(today);
  return Array.from({ length: barCount }, (_, i) => {
    const monthsBackToEnd = (barCount - 1 - i) * monthsPerBar;
    const endMonth = new Date(now.getFullYear(), now.getMonth() - monthsBackToEnd, 1, 12);
    const startMonth = new Date(endMonth.getFullYear(), endMonth.getMonth() - (monthsPerBar - 1), 1, 12);
    const periodEnd = new Date(endMonth.getFullYear(), endMonth.getMonth() + 1, 0, 12);
    const isCurrent = i === barCount - 1;
    const label =
      monthsPerBar === 1
        ? startMonth.toLocaleDateString('en-GB', { month: 'short' })
        : `${startMonth.toLocaleDateString('en-GB', { month: 'short' })}–${endMonth.toLocaleDateString('en-GB', { month: 'short' })}`;
    return {
      label,
      start: dateToYMD(startMonth),
      end: dateToYMD(capCurrent && isCurrent ? now : periodEnd),
    };
  });
}

function monthRangeStart(range: '30d' | '90d', today: string): string {
  const { bars, monthsPerBar } = MONTH_RANGE_CONFIG[range];
  return calendarBuckets(bars, monthsPerBar, today, true)[0]!.start;
}

/** The current period: last 7 calendar days (today included) for 7d, or
 *  the current + preceding calendar months/quarters for 30d/90d — `null`
 *  for "all time". Compared as date strings, so the boundary day is never
 *  lost to a time-of-day comparison. */
export function currentWindow(range: AnalyticsRange, today: string): PeriodWindow | null {
  if (range === 'all') return null;
  if (range === '7d') return { start: addDays(today, -6), end: today };
  return { start: monthRangeStart(range, today), end: today };
}

/** The window of equal span immediately before `currentWindow`. */
export function previousWindow(range: AnalyticsRange, today: string): PeriodWindow | null {
  const current = currentWindow(range, today);
  if (!current) return null;
  if (range === '7d') {
    return { start: addDays(current.start, -7), end: addDays(current.start, -1) };
  }
  const { bars, monthsPerBar } = MONTH_RANGE_CONFIG[range as '30d' | '90d'];
  return {
    start: shiftMonthStart(current.start, -(bars * monthsPerBar)),
    end: addDays(current.start, -1),
  };
}

export function inWindow(date: string, window: PeriodWindow | null): boolean {
  if (!window) return true;
  return date >= window.start && date <= window.end;
}

/** Copy for "vs X" under the hero number. `null` when there's nothing to compare. */
export function previousPeriodLabel(range: AnalyticsRange): string | null {
  switch (range) {
    case '7d': return 'previous 7 days';
    case '30d': return 'previous 6 months';
    case '90d': return 'previous 5 quarters';
    case 'all': return null;
  }
}

const MIN_MONTH_BARS = 6;
const MAX_MONTH_BARS = 12;

/** Chart bars that tile the selected range exactly, so they always add up to
 *  the headline number: 7d → 7 daily bars, 30d → 6 single-month bars (six
 *  months), 90d → 5 three-month (quarter) bars, all time → calendar months
 *  (6 to 12 of the most recent). */
export function chartBuckets(
  range: AnalyticsRange,
  today: string,
  earliest?: string | null,
): ChartBucket[] {
  if (range === '7d') {
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(today, i - 6);
      return {
        label: parseYMD(day).toLocaleDateString('en-GB', { weekday: 'short' }),
        start: day,
        end: day,
      };
    });
  }

  if (range === '30d' || range === '90d') {
    const { bars, monthsPerBar } = MONTH_RANGE_CONFIG[range];
    return calendarBuckets(bars, monthsPerBar, today, /* capCurrent */ true);
  }

  const now = parseYMD(today);
  let count = MIN_MONTH_BARS;
  if (earliest) {
    const from = parseYMD(earliest);
    const span = (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth()) + 1;
    count = Math.min(MAX_MONTH_BARS, Math.max(MIN_MONTH_BARS, span));
  }
  return calendarBuckets(count, 1, today, /* capCurrent */ false);
}
