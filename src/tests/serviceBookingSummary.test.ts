import { chartTicks, summariseServiceBookings } from '../features/providers/serviceBookingSummary';

const today = new Date(2026, 10, 2); // 2 Nov 2026

it('ranks services busiest first, within 90 days', () => {
  const { ranked } = summariseServiceBookings([
    { name: 'Braids', date: '2026-10-20' },
    { name: 'Braids', date: '2026-11-10' },
    { name: 'Gel nails', date: '2026-10-21' },
    { name: 'Lashes', date: '2026-07-01' },
  ], today);
  expect(ranked).toEqual([{ name: 'Braids', count: 2 }, { name: 'Gel nails', count: 1 }]);
});

it('keeps the ranking to five', () => {
  const rows = ['a', 'b', 'c', 'd', 'e', 'f'].map(name => ({ name, date: '2026-10-01' }));
  expect(summariseServiceBookings(rows, today).ranked).toHaveLength(5);
});

it('covers the last six calendar months, ending this month', () => {
  const { months } = summariseServiceBookings([], today);
  expect(months.map(m => m.key)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
});

it('counts the three busiest services per month, with empty months as zero', () => {
  const { trend } = summariseServiceBookings([
    { name: 'A', date: '2026-06-01' }, { name: 'A', date: '2026-06-02' }, { name: 'A', date: '2026-11-01' },
    { name: 'B', date: '2026-10-01' }, { name: 'B', date: '2026-10-02' },
    { name: 'C', date: '2026-09-01' },
    { name: 'D', date: '2026-05-31' },
  ], today);
  expect(trend.map(t => t.name)).toEqual(['A', 'B', 'C']);
  expect(trend[0]!.counts).toEqual([2, 0, 0, 0, 0, 1]);
  expect(trend[0]!.total).toBe(3);
});

it('leaves out bookings with no service name', () => {
  expect(summariseServiceBookings([{ name: '  ', date: '2026-10-01' }], today).ranked).toEqual([]);
});

it('uses whole-number gridlines', () => {
  expect(chartTicks(0)).toEqual([0, 1]);
  expect(chartTicks(2)).toEqual([0, 1, 2]);
  expect(chartTicks(7)).toEqual([0, 4, 8]);
  expect(chartTicks(8)).toEqual([0, 4, 8]);
});
