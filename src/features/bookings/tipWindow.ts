/**
 * Clients can tip for 48 hours after their appointment ends (user, 2026-10-21).
 * The booking-tip function enforces the same window server-side; this only
 * decides whether the Tip button is offered.
 */
export const TIP_WINDOW_HOURS = 48;

/** Minutes past midnight for "14:30", "14:30:00" or "2:30 PM"; null if unreadable. */
function minutesOfDay(time: string): number | null {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** When tipping closes for an appointment ending at `endTime` on `bookingDate`. */
export function tipWindowClosesAt(bookingDate: string, endTime: string): Date | null {
  const date = bookingDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const minutes = minutesOfDay(endTime);
  if (!date || minutes === null) return null;
  const end = new Date(Number(date[1]), Number(date[2]) - 1, Number(date[3]), 0, minutes);
  return new Date(end.getTime() + TIP_WINDOW_HOURS * 60 * 60 * 1000);
}

/** Unreadable dates stay open: the server is the one that refuses. */
export function isTipWindowOpen(bookingDate: string, endTime: string, now: Date = new Date()): boolean {
  const closes = tipWindowClosesAt(bookingDate, endTime);
  return closes === null || now < closes;
}
