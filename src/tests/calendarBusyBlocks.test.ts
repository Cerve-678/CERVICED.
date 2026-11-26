import { addDaysYmd, toUkBusyBlocks, ukTodayYmd, type BusyEventInput } from '../features/providers/calendarBusyBlocks';

const ev = (start: string, end: string, extra: Partial<BusyEventInput> = {}): BusyEventInput => ({
  start: new Date(start),
  end: new Date(end),
  allDay: false,
  free: false,
  ...extra,
});

describe('toUkBusyBlocks', () => {
  it('reads winter times as UK time (GMT)', () => {
    expect(toUkBusyBlocks([ev('2026-12-01T10:00:00Z', '2026-12-01T11:30:00Z')], '2026-12-01', '2026-12-31'))
      .toEqual([{ date: '2026-12-01', start: '10:00:00', end: '11:30:00' }]);
  });

  it('reads summer times as UK time (BST, an hour ahead of UTC)', () => {
    expect(toUkBusyBlocks([ev('2027-07-01T09:00:00Z', '2027-07-01T10:00:00Z')], '2027-07-01', '2027-07-31'))
      .toEqual([{ date: '2027-07-01', start: '10:00:00', end: '11:00:00' }]);
  });

  it('splits an event that runs past midnight into one block per day', () => {
    expect(toUkBusyBlocks([ev('2026-12-01T22:00:00Z', '2026-12-02T01:00:00Z')], '2026-12-01', '2026-12-31'))
      .toEqual([
        { date: '2026-12-01', start: '22:00:00', end: '23:59:59' },
        { date: '2026-12-02', start: '00:00:00', end: '01:00:00' },
      ]);
  });

  it('merges overlapping and touching events on the same day', () => {
    expect(toUkBusyBlocks([
      ev('2026-12-01T13:00:00Z', '2026-12-01T14:00:00Z'),
      ev('2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z'),
      ev('2026-12-01T10:30:00Z', '2026-12-01T12:00:00Z'),
      ev('2026-12-01T12:00:00Z', '2026-12-01T12:30:00Z'),
    ], '2026-12-01', '2026-12-31')).toEqual([
      { date: '2026-12-01', start: '10:00:00', end: '12:30:00' },
      { date: '2026-12-01', start: '13:00:00', end: '14:00:00' },
    ]);
  });

  it('skips all-day events, events marked free, and empty or backwards ones', () => {
    expect(toUkBusyBlocks([
      ev('2026-12-01T00:00:00Z', '2026-12-02T00:00:00Z', { allDay: true }),
      ev('2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z', { free: true }),
      ev('2026-12-01T12:00:00Z', '2026-12-01T12:00:00Z'),
      ev('2026-12-01T15:00:00Z', '2026-12-01T14:00:00Z'),
    ], '2026-12-01', '2026-12-31')).toEqual([]);
  });

  it('never makes a block shorter than the event: starts round down, ends round up', () => {
    expect(toUkBusyBlocks([ev('2026-12-01T10:00:40Z', '2026-12-01T10:30:10Z')], '2026-12-01', '2026-12-31'))
      .toEqual([{ date: '2026-12-01', start: '10:00:00', end: '10:31:00' }]);
  });

  it('keeps only days inside the range', () => {
    expect(toUkBusyBlocks([
      ev('2026-11-30T10:00:00Z', '2026-11-30T11:00:00Z'),
      ev('2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z'),
      ev('2026-12-03T10:00:00Z', '2026-12-03T11:00:00Z'),
    ], '2026-12-01', '2026-12-02')).toEqual([{ date: '2026-12-01', start: '10:00:00', end: '11:00:00' }]);
  });
});

describe('UK dates', () => {
  it('gives the UK date, not the UTC one, late on a summer evening', () => {
    expect(ukTodayYmd(new Date('2027-07-01T23:30:00Z'))).toBe('2027-07-02');
  });

  it('adds days across a month end', () => {
    expect(addDaysYmd('2026-12-30', 3)).toBe('2027-01-02');
  });
});
