// src/features/providers/todaySchedule.ts
// Pure shaping for the two "today" cards on My Profile's Dashboard: the
// full-day summary (TodaySummaryCard) and the swipeable booking cards
// (TodayBookingCards). Kept free of React/Supabase so the timing rules can be
// tested directly.
//
// Which card leads (owner's call, 2026-10-29): the summary until 2pm, the
// booking cards from 2pm, and the summary again once the last client is done,
// The other card sits under Your work. The booking cards always show the next
// few bookings still to come, on any date (owner's call, 2026-11-01).
// Designs: https://claude.ai/artifact/GAhSKrF5aDFEiNJsThtmMy
import type { BookingStatus, BookingWithAddOns } from '../../types/database';

/** From this hour the booking cards lead instead of the summary. */
export const CARDS_LEAD_FROM_HOUR = 14;

/** How many bookings the swipeable cards show. */
export const UPCOMING_CARD_COUNT = 5;

/** The booking fields the cards read — a structural subset of
 *  BookingWithAddOns, so tests don't have to build whole rows. */
export interface ScheduleBooking {
  id: string;
  booking_date: string;
  booking_time: string;
  end_time: string | null;
  status: BookingStatus;
  customer_name: string | null;
  service_name_snapshot: string;
  service_id: string | null;
  base_price: number;
  add_ons_total: number;
}

/** Statuses that are a real appointment on the day — the same set the 07:00
 *  daily recap counts, plus the later states of those same appointments.
 *  Cancelled bookings and no-shows are not on the day. */
const ON_THE_DAY: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  'pending',
  'confirmed',
  'in_progress',
  'completed',
]);

/** The statuses of a booking that hasn't happened yet, for the cards' look
 *  ahead. Also what getProviderUpcomingBookings fetches. */
const STILL_TO_COME: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  'pending',
  'confirmed',
  'in_progress',
]);

/** summaryLeads: before 2pm. cardsLead: from 2pm. dayDone: nothing left today
 *  (including a day with nothing booked), so the summary leads again. */
export type DayPhase = 'summaryLeads' | 'cardsLead' | 'dayDone';

/** done: finished. now: under way. next: the first one still to start.
 *  later: everything after that. */
export type SlotState = 'done' | 'now' | 'next' | 'later';

export interface ScheduleSlot<B extends ScheduleBooking> {
  booking: B;
  state: SlotState;
  /** Booked length in minutes; 0 for a legacy row with no end_time. */
  lengthMinutes: number;
  /** Minutes until a 'next' slot starts; null for every other state. */
  minutesUntil: number | null;
  /** A request the provider hasn't accepted or declined yet. */
  isRequest: boolean;
  /** The booked service says it needs a patch test. Nothing records whether
   *  one has been done, so the cards say "needs", never "due". */
  needsPatchTest: boolean;
}

export interface ScheduleTodo<B extends ScheduleBooking> {
  kind: 'request' | 'patchTest';
  booking: B;
}

export interface TodaySchedule<B extends ScheduleBooking> {
  phase: DayPhase;
  todayYmd: string;
  tomorrowYmd: string;
  today: ScheduleSlot<B>[];
  tomorrow: ScheduleSlot<B>[];
  /** The next bookings still to come, soonest first, on any date: what the
   *  swipeable cards show. At most UPCOMING_CARD_COUNT. */
  upcoming: ScheduleSlot<B>[];
  /** Index into `today` of the 'now' or 'next' slot; null once the day is done. */
  leadIndex: number | null;
  doneCount: number;
  /** Service price plus add-ons across today's bookings. The client's
   *  platform fee is on top of this and never the provider's. */
  bookedValue: number;
  /** What needs doing before the clients still to come today. Once the day
   *  is done this looks at tomorrow instead. */
  todos: ScheduleTodo<B>[];
}

/** "HH:MM" or "HH:MM:SS" (how Postgres sends a time) → minutes after
 *  midnight. Null when the value can't be read. */
export function minutesOfDay(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time.trim());
  if (!match) return null;
  return parseInt(match[1]!, 10) * 60 + parseInt(match[2]!, 10);
}

/** The client's name as it was booked, in full, as every other booking card
 *  shows it; no name at all reads as "Client". The cards used to cut it to
 *  "Amira K.", which left the provider guessing who was coming (owner,
 *  2026-11-03). */
export function clientName(name: string | null | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ') || 'Client';
}

/** "£45" or "£45.50". */
export function pounds(value: number): string {
  return Number.isInteger(value) ? `£${value}` : `£${value.toFixed(2)}`;
}

/** Service price plus add-ons: what the client booked, without CERVICED's
 *  platform fee, which is never the provider's. */
export function serviceTotal(booking: Pick<ScheduleBooking, 'base_price' | 'add_ons_total'>): number {
  return (Number(booking.base_price) || 0) + (Number(booking.add_ons_total) || 0);
}

/** What has been paid through the app, in the same terms as the booking card
 *  on Home. Null when nothing has been taken through the app: the app only
 *  speaks for its own payments, never for money handed over in person. */
export function paymentLine(
  booking: Pick<BookingWithAddOns, 'payment_status' | 'deposit_amount' | 'remaining_balance'>,
): string | null {
  switch (booking.payment_status) {
    case 'fully_paid':
      return 'Paid in full';
    case 'deposit_paid': {
      const deposit = `${pounds(Number(booking.deposit_amount) || 0)} deposit paid`;
      const balance = Number(booking.remaining_balance) || 0;
      return balance > 0 ? `${deposit} · ${pounds(balance)} balance due` : deposit;
    }
    case 'refunded':
      return 'Refunded';
    case 'partially_refunded':
      return 'Partly refunded';
    default:
      return null;
  }
}

function dayRows<B extends ScheduleBooking>(bookings: B[], ymd: string): B[] {
  return bookings
    .filter(b => b.booking_date === ymd && ON_THE_DAY.has(b.status))
    .sort((a, b) => a.booking_time.localeCompare(b.booking_time));
}

function lengthOf(booking: ScheduleBooking): number {
  const start = minutesOfDay(booking.booking_time);
  const end = minutesOfDay(booking.end_time);
  return start !== null && end !== null && end > start ? end - start : 0;
}

function todosFrom<B extends ScheduleBooking>(slots: ScheduleSlot<B>[]): ScheduleTodo<B>[] {
  const todos: ScheduleTodo<B>[] = [];
  for (const slot of slots) {
    if (slot.state === 'done') continue;
    if (slot.isRequest) todos.push({ kind: 'request', booking: slot.booking });
    if (slot.needsPatchTest) todos.push({ kind: 'patchTest', booking: slot.booking });
  }
  return todos;
}

export function buildTodaySchedule<B extends ScheduleBooking>(input: {
  now: Date;
  todayYmd: string;
  tomorrowYmd: string;
  bookings: B[];
  patchTestServiceIds: ReadonlySet<string>;
}): TodaySchedule<B> {
  const nowMinutes = input.now.getHours() * 60 + input.now.getMinutes();
  const needsPatchTest = (b: B) => !!b.service_id && input.patchTestServiceIds.has(b.service_id);

  let leadIndex: number | null = null;
  const today: ScheduleSlot<B>[] = dayRows(input.bookings, input.todayYmd).map((booking, index) => {
    const start = minutesOfDay(booking.booking_time) ?? 0;
    const length = lengthOf(booking);
    // A legacy row with no end_time counts as finished a minute after it
    // starts rather than never finishing.
    const end = start + Math.max(length, 1);
    const finished = booking.status === 'completed' || nowMinutes >= end;

    let state: SlotState;
    if (finished) state = 'done';
    else if (leadIndex === null) {
      leadIndex = index;
      state = start <= nowMinutes || booking.status === 'in_progress' ? 'now' : 'next';
    } else state = 'later';

    return {
      booking,
      state,
      lengthMinutes: length,
      minutesUntil: state === 'next' ? start - nowMinutes : null,
      isRequest: booking.status === 'pending',
      needsPatchTest: needsPatchTest(booking),
    };
  });

  const tomorrow: ScheduleSlot<B>[] = dayRows(input.bookings, input.tomorrowYmd).map((booking, index) => ({
    booking,
    state: index === 0 ? 'next' : 'later',
    lengthMinutes: lengthOf(booking),
    minutesUntil: null,
    isRequest: booking.status === 'pending',
    needsPatchTest: needsPatchTest(booking),
  }));

  const stillToday = today.filter(s => s.state !== 'done');
  const afterToday = input.bookings
    .filter(b => b.booking_date > input.todayYmd && STILL_TO_COME.has(b.status))
    .sort((a, b) => a.booking_date.localeCompare(b.booking_date) || a.booking_time.localeCompare(b.booking_time));
  const upcoming: ScheduleSlot<B>[] = [
    ...stillToday,
    ...afterToday.map((booking, index): ScheduleSlot<B> => ({
      booking,
      state: stillToday.length === 0 && index === 0 ? 'next' : 'later',
      lengthMinutes: lengthOf(booking),
      minutesUntil: null,
      isRequest: booking.status === 'pending',
      needsPatchTest: needsPatchTest(booking),
    })),
  ].slice(0, UPCOMING_CARD_COUNT);

  const doneCount = today.filter(s => s.state === 'done').length;
  const phase: DayPhase =
    leadIndex === null
      ? 'dayDone'
      : input.now.getHours() >= CARDS_LEAD_FROM_HOUR
        ? 'cardsLead'
        : 'summaryLeads';

  return {
    phase,
    todayYmd: input.todayYmd,
    tomorrowYmd: input.tomorrowYmd,
    today,
    tomorrow,
    upcoming,
    leadIndex,
    doneCount,
    bookedValue: today.reduce((sum, s) => sum + serviceTotal(s.booking), 0),
    todos: phase === 'dayDone' ? todosFrom(tomorrow) : todosFrom(today),
  };
}
