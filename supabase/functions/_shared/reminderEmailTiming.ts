// Which of a provider's appointment reminders is also sent by email.
//
// A provider picks any of 24h, 48h and 72h (automation_settings
// .clientReminderTiming, default ["24h"]) and the app sends each as a
// notification. Only the one nearest the appointment is emailed: the day
// before by default, or 2 or 3 days ahead if that's the nearest they picked.
// The app can buzz three times; an inbox shouldn't fill up.

export const REMINDER_TIMINGS = ['24h', '48h', '72h'] as const;
export type ReminderTiming = (typeof REMINDER_TIMINGS)[number];

export function emailedReminderTiming(providerTimings: unknown): ReminderTiming {
  const picked = Array.isArray(providerTimings)
    ? REMINDER_TIMINGS.filter(t => providerTimings.includes(t))
    : [];
  return picked[0] ?? '24h';
}

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
