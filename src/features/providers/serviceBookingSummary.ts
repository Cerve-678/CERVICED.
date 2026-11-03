// What the dashboard's two service graphs show, worked out from one narrow read
// of the provider's bookings (getMyServiceBookingRows). Pure, so it can be tested.
import { dateToYMD } from '../../utils/dateUtils';

export type ServiceBookingRow = { name: string; date: string };

export type ServiceBookingSummary = {
  /** Busiest first, last 90 days plus anything already booked ahead. */
  ranked: { name: string; count: number }[];
  /** The last six calendar months, oldest first, ending this month. */
  months: { key: string; label: string }[];
  /** The three busiest services across those months, busiest first. */
  trend: { name: string; counts: number[]; total: number }[];
};

const SERVICE_BOOKING_MONTHS = 6;
const RANKED_DAYS = 90;
const RANKED_LIMIT = 5;
const TREND_LIMIT = 3;

/** Days back to read so every chart is covered: six calendar months at most. */
export const SERVICE_BOOKING_LOOKBACK_DAYS = 186;

function busiestFirst(counts: Map<string, number>): [string, number][] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function summariseServiceBookings(
  rows: readonly ServiceBookingRow[],
  today: Date = new Date(),
): ServiceBookingSummary {
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - RANKED_DAYS);
  const rankedFrom = dateToYMD(cutoff);

  const months = Array.from({ length: SERVICE_BOOKING_MONTHS }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - (SERVICE_BOOKING_MONTHS - 1 - i), 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-GB', { month: 'short' }),
    };
  });
  const monthIndex = new Map(months.map((m, i) => [m.key, i]));

  const rankedCounts = new Map<string, number>();
  const trendCounts = new Map<string, number[]>();
  for (const { name, date } of rows) {
    const service = name.trim();
    if (!service) continue;
    if (date >= rankedFrom) rankedCounts.set(service, (rankedCounts.get(service) ?? 0) + 1);
    const index = monthIndex.get(date.slice(0, 7));
    if (index !== undefined) {
      const counts = trendCounts.get(service) ?? months.map(() => 0);
      counts[index] = (counts[index] ?? 0) + 1;
      trendCounts.set(service, counts);
    }
  }

  const trend = [...trendCounts.entries()]
    .map(([name, counts]) => ({ name, counts, total: counts.reduce((sum, n) => sum + n, 0) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, TREND_LIMIT);

  return {
    ranked: busiestFirst(rankedCounts).slice(0, RANKED_LIMIT).map(([name, count]) => ({ name, count })),
    months,
    trend,
  };
}

/** Whole-number gridlines for a chart whose highest point is `max`. */
export function chartTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  if (max <= 2) return Array.from({ length: max + 1 }, (_, i) => i);
  const top = max % 2 === 0 ? max : max + 1;
  return [0, top / 2, top];
}
