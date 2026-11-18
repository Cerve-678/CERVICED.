// Sending one saved form to several upcoming appointments at once, from the
// Forms library (ProviderIntakeFormScreen's appointment picker).

import { formatShortDayDate, formatTime12Safe } from '../../utils/dateUtils';

interface PickableBooking {
  status: string;
  booking_date: string;
  booking_time: string | null;
}

const OPEN = ['pending', 'confirmed'];

function startMs(b: PickableBooking): number {
  return new Date(`${b.booking_date}T${b.booking_time ?? '00:00'}`).getTime();
}

/** Appointments a form can still be sent to: requested or confirmed, not yet
 *  started, soonest first. */
export function upcomingForForms<T extends PickableBooking>(bookings: readonly T[], nowMs: number): T[] {
  return bookings
    .filter(b => OPEN.includes(b.status) && Number.isFinite(startMs(b)) && startMs(b) > nowMs)
    .sort((a, b) => startMs(a) - startMs(b));
}

/** "Sat 3 Oct, 2:00pm" for a row in the picker. */
export function appointmentLabel(b: PickableBooking): string {
  const day = formatShortDayDate(b.booking_date);
  const time = b.booking_time ? formatTime12Safe(b.booking_time) : null;
  return time ? `${day}, ${time}` : day;
}

/** The toast after sending. Appointments that already had this form are
 *  skipped, not sent twice. */
export function sentFormsMessage(sent: number, picked: number): string {
  const skipped = picked - sent;
  if (sent === 0) return picked === 1 ? 'They already have this form.' : 'They all already have this form.';
  const base = `Form sent to ${sent} ${sent === 1 ? 'client' : 'clients'}.`;
  return skipped > 0 ? `${base} ${skipped} already had it.` : base;
}

interface CheckableQuestion {
  type: string;
  label: string;
  body?: string;
  options?: string[];
}

/** Why a form can't be saved or sent yet, or null when it's ready. A client
 *  is never sent an empty form, an unworded question, a policy with no text,
 *  or a choice with nothing to choose. */
export function formProblem(questions: readonly CheckableQuestion[]): string | null {
  if (questions.length === 0) return 'Add at least one question.';
  for (const [i, q] of questions.entries()) {
    const name = q.label.trim() ? `"${q.label.trim()}"` : `Question ${i + 1}`;
    if (!q.label.trim()) return `${name} needs wording.`;
    if (q.type === 'policy' && !(q.body ?? '').trim()) return `Add the policy text to ${name}.`;
    if (q.type === 'choice' && (q.options ?? []).filter(o => o.trim()).length < 2) return `Give ${name} at least two options.`;
  }
  return null;
}
