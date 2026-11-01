// Pins the timing rules for My Profile's two "today" cards: the summary leads
// until 2pm, the booking cards lead from 2pm, and the summary leads again once
// the last client is done (when the cards look at tomorrow instead).
import {
  buildTodaySchedule,
  minutesOfDay,
  shortClientName,
  type ScheduleBooking,
} from '../features/providers/todaySchedule';

const TODAY = '2026-10-26';
const TOMORROW = '2026-10-27';

function booking(id: string, time: string, end: string | null, extra: Partial<ScheduleBooking> = {}): ScheduleBooking {
  return {
    id,
    booking_date: TODAY,
    booking_time: time,
    end_time: end,
    status: 'confirmed',
    customer_name: `Client ${id}`,
    service_name_snapshot: 'Gel manicure',
    service_id: `svc-${id}`,
    base_price: 40,
    add_ons_total: 5,
    ...extra,
  };
}

const DAY = [
  booking('a', '09:00:00', '10:00:00'),
  booking('b', '10:30:00', '11:15:00'),
  booking('c', '14:30:00', '15:15:00', { service_id: 'svc-patch' }),
];

function at(hours: number, minutes: number, bookings: ScheduleBooking[] = DAY, patch: string[] = ['svc-patch']) {
  return buildTodaySchedule({
    now: new Date(2026, 9, 26, hours, minutes),
    todayYmd: TODAY,
    tomorrowYmd: TOMORROW,
    bookings,
    patchTestServiceIds: new Set(patch),
  });
}

describe('buildTodaySchedule', () => {
  it('leads with the summary before 2pm and marks the next client', () => {
    const s = at(8, 30);
    expect(s.phase).toBe('summaryLeads');
    expect(s.today.map(x => x.state)).toEqual(['next', 'later', 'later']);
    expect(s.today[0]!.minutesUntil).toBe(30);
    expect(s.leadIndex).toBe(0);
  });

  it('marks a booking under way as now, with finished ones done', () => {
    const s = at(10, 45);
    expect(s.today.map(x => x.state)).toEqual(['done', 'now', 'later']);
    expect(s.today[1]!.minutesUntil).toBeNull();
    expect(s.doneCount).toBe(1);
  });

  it('leads with the booking cards from 2pm while clients are left', () => {
    const s = at(14, 0);
    expect(s.phase).toBe('cardsLead');
    expect(s.leadIndex).toBe(2);
    expect(s.today[2]!.minutesUntil).toBe(30);
  });

  it('goes back to the summary once the last client is done, even after 2pm', () => {
    const s = at(16, 0);
    expect(s.phase).toBe('dayDone');
    expect(s.leadIndex).toBeNull();
    expect(s.doneCount).toBe(3);
  });

  it('treats a day with nothing booked as done', () => {
    expect(at(9, 0, []).phase).toBe('dayDone');
  });

  it('counts a completed booking as done even before its end time', () => {
    const s = at(9, 15, [booking('a', '09:00:00', '10:00:00', { status: 'completed' }), booking('b', '11:00:00', '12:00:00')]);
    expect(s.today.map(x => x.state)).toEqual(['done', 'next']);
  });

  it('leaves out cancelled bookings and no-shows, and sorts by time', () => {
    const s = at(8, 0, [
      booking('late', '15:00:00', '16:00:00'),
      booking('gone', '09:00:00', '10:00:00', { status: 'cancelled' }),
      booking('noshow', '10:00:00', '11:00:00', { status: 'no_show' }),
      booking('early', '08:30:00', '09:00:00'),
    ]);
    expect(s.today.map(x => x.booking.id)).toEqual(['early', 'late']);
  });

  it('adds service price and add-ons across the day', () => {
    expect(at(8, 0).bookedValue).toBe(135);
  });

  it('lists requests and patch-test services still to come as things to do', () => {
    const s = at(8, 0, [...DAY, booking('d', '16:00:00', '16:30:00', { status: 'pending' })]);
    expect(s.todos.map(t => `${t.kind}:${t.booking.id}`)).toEqual(['patchTest:c', 'request:d']);
  });

  it('drops a to-do once that booking is done', () => {
    expect(at(15, 30).todos).toEqual([]);
  });

  it('reads tomorrow, first one marked next, and takes its to-dos once today is done', () => {
    const tomorrowRows = [
      booking('t2', '11:00:00', '12:00:00', { booking_date: TOMORROW, status: 'pending' }),
      booking('t1', '09:30:00', '10:15:00', { booking_date: TOMORROW }),
    ];
    const s = at(18, 0, [...DAY, ...tomorrowRows]);
    expect(s.tomorrow.map(x => `${x.booking.id}:${x.state}`)).toEqual(['t1:next', 't2:later']);
    expect(s.todos.map(t => `${t.kind}:${t.booking.id}`)).toEqual(['request:t2']);
  });

  it('finishes a legacy booking with no end time a minute after it starts', () => {
    const s = at(9, 1, [booking('a', '09:00:00', null), booking('b', '12:00:00', '13:00:00')]);
    expect(s.today.map(x => x.state)).toEqual(['done', 'next']);
    expect(s.today[0]!.lengthMinutes).toBe(0);
  });
});

describe('minutesOfDay', () => {
  it('reads HH:MM and the HH:MM:SS Postgres sends', () => {
    expect(minutesOfDay('14:30')).toBe(870);
    expect(minutesOfDay('14:30:00')).toBe(870);
    expect(minutesOfDay('nope')).toBeNull();
    expect(minutesOfDay(null)).toBeNull();
  });
});

describe('shortClientName', () => {
  it('shortens to first name and last initial', () => {
    expect(shortClientName('Amira Khan')).toBe('Amira K.');
    expect(shortClientName('Mary Jane van Dyke')).toBe('Mary D.');
    expect(shortClientName('Jade')).toBe('Jade');
    expect(shortClientName('  ')).toBe('Client');
    expect(shortClientName(null)).toBe('Client');
  });
});
