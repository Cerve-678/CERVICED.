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
