// Which appointment reminder is also sent by email.
//
// Every client gets the same two reminders in the app, 2 days before and the
// day before (process_client_appointment_reminders), whoever they booked
// with; providers don't choose. Only the day-before one is emailed: the app
// can buzz twice; an inbox shouldn't fill up.

export const REMINDER_TIMINGS = ['24h', '48h'] as const;
export type ReminderTiming = (typeof REMINDER_TIMINGS)[number];

export const EMAILED_REMINDER_TIMING: ReminderTiming = '24h';

/** Today's date where the appointments are, as YYYY-MM-DD. */
export function londonToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now);
}

/** A reminder is only emailed in its real window: the appointment is ahead of
 *  today and no further than the reminder's own days. A notification row
 *  written by hand days early (a client or provider can insert one) never
 *  turns into an email at the wrong time. */
export function reminderIsDue(bookingDate: string, today: string, daysAhead: number): boolean {
  const days = (Date.parse(`${bookingDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(days) && days > 0 && days <= daysAhead;
}
