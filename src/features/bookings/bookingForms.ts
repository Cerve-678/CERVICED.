// src/features/bookings/bookingForms.ts
//
// The intake forms on one booking, as the client's booking page lists them.
// A provider can send more than one (Terms & Conditions plus a consultation
// form), and each is its own row with its own state.

import type { IntakeForm } from '../../services/databaseService';

/** Still-to-do forms first, then the ones already sent back; within each, the
 *  order they were sent. Never drops a form. */
export function formsToDoFirst<T extends Pick<IntakeForm, 'status'>>(forms: readonly T[]): T[] {
  return [
    ...forms.filter(f => f.status !== 'completed'),
    ...forms.filter(f => f.status === 'completed'),
  ];
}
