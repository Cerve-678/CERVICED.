// src/features/providers/calendarBusyBlocks.ts
// Turns events from a provider's phone calendar into the busy times CERVICED
// blocks for clients (provider_calendar_busy_blocks). Pure, so it's tested
// without a phone.
//
// Only WHEN they're busy goes to the server. Titles, locations and notes stay
// on the phone: they usually name other people's clients.
//
// Bookings are stored as UK wall-clock days and times, so blocks are too,
// whatever timezone the phone is set to. An event that runs past midnight is
// split into one block per day.
import { ukOffsetMinutes } from '../../utils/bookingHorizon';

export interface BusyEventInput {
  start: Date;
  end: Date;
  allDay: boolean;
  /** Marked "free" in the calendar app (shown as available). */
  free: boolean;
}

/** One busy stretch on one UK day, in the shape the sync RPC takes. */
export interface BusyBlock {
  /** 'YYYY-MM-DD' */
  date: string;
  /** 'HH:MM:SS' */
  start: string;
  /** 'HH:MM:SS'; '23:59:59' when it runs to midnight. */
  end: string;
}

const MINUTE_MS = 60_000;
const DAY_MINUTES = 24 * 60;
const DAY_MS = DAY_MINUTES * MINUTE_MS;

/** Milliseconds whose UTC getters read UK wall-clock time at `instant`. */
function ukWallMs(instant: Date): number {
  return instant.getTime() + ukOffsetMinutes(instant) * MINUTE_MS;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function ymdFromWallMs(wallMs: number): string {
  const d = new Date(wallMs);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function timeFromMinutes(minutes: number): string {
  if (minutes >= DAY_MINUTES) return '23:59:59';
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`;
}

/** Today's date in the UK, 'YYYY-MM-DD'. */
export function ukTodayYmd(now: Date = new Date()): string {
  return ymdFromWallMs(ukWallMs(now));
}

/** The UK date `days` after `ymd`. */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return ymdFromWallMs(Date.UTC(y, m - 1, d + days));
}

/**
 * Busy blocks for the UK days `fromYmd`..`toYmd`, merged so overlapping or
 * touching events on a day become one block. All-day events and events marked
 * "free" are skipped: an all-day entry is usually a reminder or a birthday,
 * and a day off belongs in Blocked Dates, which clients see as closed.
 * Starts round down and ends round up to the minute, so a block never comes
 * out shorter than the event.
 */
export function toUkBusyBlocks(
  events: readonly BusyEventInput[],
  fromYmd: string,
  toYmd: string,
): BusyBlock[] {
  const byDate = new Map<string, Array<[number, number]>>();

  for (const event of events) {
    if (event.allDay || event.free) continue;
    const startMs = event.start.getTime();
    const endMs = event.end.getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;

    const wallStart = Math.floor(ukWallMs(event.start) / MINUTE_MS) * MINUTE_MS;
    const wallEnd = Math.ceil(ukWallMs(event.end) / MINUTE_MS) * MINUTE_MS;
    let dayStart = Math.floor(wallStart / DAY_MS) * DAY_MS;

    while (dayStart < wallEnd) {
      const date = ymdFromWallMs(dayStart);
      if (date > toYmd) break;
      if (date >= fromYmd) {
        const from = Math.max(wallStart, dayStart);
        const to = Math.min(wallEnd, dayStart + DAY_MS);
        const startMin = Math.round((from - dayStart) / MINUTE_MS);
        const endMin = Math.round((to - dayStart) / MINUTE_MS);
        if (endMin > startMin) {
          const list = byDate.get(date) ?? [];
          list.push([startMin, endMin]);
          byDate.set(date, list);
        }
      }
      dayStart += DAY_MS;
    }
  }

  const blocks: BusyBlock[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const spans = byDate.get(date)!.sort((a, b) => a[0] - b[0]);
    let [curStart, curEnd] = spans[0]!;
    for (const [s, e] of spans.slice(1)) {
      if (s <= curEnd) {
        curEnd = Math.max(curEnd, e);
      } else {
        blocks.push({ date, start: timeFromMinutes(curStart), end: timeFromMinutes(curEnd) });
        curStart = s;
        curEnd = e;
      }
    }
    blocks.push({ date, start: timeFromMinutes(curStart), end: timeFromMinutes(curEnd) });
  }
  return blocks;
}
