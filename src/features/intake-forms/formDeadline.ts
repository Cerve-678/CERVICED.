// A form's deadline: the provider picks "this long before the appointment" on
// the saved form; each sent copy carries the real time it's due (due_at,
// stamped server-side by stamp_intake_form_due_at — 20261118130000).

import { formatShortDayDate, formatTime12Safe } from '../../utils/dateUtils';

export interface DeadlineOption {
  /** Hours before the appointment starts. null = no deadline. */
  hours: number | null;
  label: string;
}

export const DEADLINE_OPTIONS: readonly DeadlineOption[] = [
  { hours: null, label: 'No deadline' },
  { hours: 2, label: '2 hours before' },
  { hours: 24, label: '1 day before' },
  { hours: 48, label: '2 days before' },
  { hours: 168, label: '1 week before' },
];

/** What the builder shows for the saved choice. An hours value not in the
 *  list (set some other way) still reads sensibly. */
export function deadlineLabel(hours: number | null): string {
  const match = DEADLINE_OPTIONS.find(o => o.hours === hours);
  if (match) return match.label;
  if (hours == null) return 'No deadline';
  if (hours % 24 === 0) return `${hours / 24} days before`;
  return `${hours} hours before`;
}

/** "Fill in by Sat 3 Oct, 2:00pm" — or null when the form has no deadline. */
export function dueByLabel(dueAt: string | null | undefined): string | null {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;
  const time = formatTime12Safe(due);
  return `${formatShortDayDate(due)}${time ? `, ${time}` : ''}`;
}

/** True once a still-unanswered form has gone past its deadline. */
export function isOverdue(dueAt: string | null | undefined, status: string, nowMs: number): boolean {
  if (!dueAt || status === 'completed') return false;
  const due = Date.parse(dueAt);
  return Number.isFinite(due) && nowMs > due;
}
