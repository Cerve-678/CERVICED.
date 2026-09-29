// Why a booking can't be rescheduled — the one place that decides, so a tap on
// an old "reschedule" notification says what actually happened to the booking
// instead of a generic refusal.
//
// Several reasons can be true at once (a booking that was cancelled AND whose
// date has since passed). The order below is the precedence, most definitive
// first: what happened to the booking beats how much time has gone by, because
// the event is what closed it and the date is incidental.
//
//   1. cancelled              — the booking no longer exists in any useful sense
//   2. finished               — completed or a no-show; nothing left to move
//   3. date has passed        — still open on paper, but the slot is behind us
//   4. awaiting confirmation  — not "no longer": rescheduling isn't open *yet*
//   5. anything else          — generic fallback, never a silent no-op
//
// Tapping an OLD reschedule-request notification adds a second question on top
// of the booking's own state: is the request itself still open? A booking can
// be perfectly reschedulable while the request that notification was about has
// already been answered, declined or expired — so getStaleRequestBlock covers
// that, and only applies once the booking-level checks above have passed.

import { BookingStatus } from '../types/booking';
import { to24HourTime } from './dateUtils';

export interface RescheduleBlock {
  title: string;
  message: string;
}

/** True once the booking's start (local time) is behind `now`. A time that
 *  can't be read falls back to the end of that day, so an unparseable time
 *  never wrongly reports today's booking as already gone. */
export function hasBookingDatePassed(bookingDate: string, bookingTime: string, now: Date = new Date()): boolean {
  const [y, mo, d] = bookingDate.split('-').map(Number);
  if (!y || !mo || !d) return false;
  let hours = 23;
  let minutes = 59;
  try {
    const [h, m] = to24HourTime(bookingTime).split(':').map(Number);
    hours = h!;
    minutes = m!;
  } catch {
    // keep end-of-day
  }
  return new Date(y, mo - 1, d, hours, minutes, 0, 0).getTime() < now.getTime();
}

/** Null when the booking can be rescheduled (upcoming or in progress, and not past). */
export function getRescheduleBlock(
  status: BookingStatus,
  bookingDate: string,
  bookingTime: string,
  now: Date = new Date(),
  audience: 'provider' | 'client' = 'provider',
): RescheduleBlock | null {
  if (status === BookingStatus.CANCELLED) {
    return {
      title: 'Rescheduling is closed',
      message: 'This booking was cancelled, so it can no longer be rescheduled.',
    };
  }
  if (
    status === BookingStatus.COMPLETED ||
    status === BookingStatus.NO_SHOW ||
    status === BookingStatus.PROVIDER_NO_SHOW
  ) {
    return {
      title: 'Rescheduling is closed',
      message: 'This appointment has passed, so it can no longer be rescheduled.',
    };
  }
  if (hasBookingDatePassed(bookingDate, bookingTime, now) && status !== BookingStatus.IN_PROGRESS) {
    return {
      title: 'Rescheduling is closed',
      message: 'The date for this appointment has passed, so it can no longer be rescheduled.',
    };
  }
  if (status === BookingStatus.PENDING) {
    return audience === 'client'
      ? {
          title: 'Not confirmed yet',
          message: 'This booking is still waiting for the provider to confirm it. You can reschedule once it has been.',
        }
      : {
          title: 'Confirm this booking first',
          message: 'This booking is still waiting for your confirmation. Confirm or decline it first, then you can reschedule.',
        };
  }
  if (status !== BookingStatus.UPCOMING && status !== BookingStatus.IN_PROGRESS) {
    return {
      title: 'Rescheduling is closed',
      message: 'This booking can no longer be rescheduled.',
    };
  }
  return null;
}

/**
 * The state of the reschedule request behind a notification that was tapped:
 * `pending` (client asked, provider hasn't answered), `provider_responded`
 * (provider offered times, client hasn't chosen), or null (no open request).
 */
export type OpenRequestStatus = 'pending' | 'provider_responded' | null;

/**
 * What to tell someone who tapped an old reschedule notification when the
 * request it was about isn't in the state that notification promised. Null
 * means the request is exactly what they expected, so carry on.
 *
 * Provider taps "reschedule request" → expects a `pending` request to answer.
 * Client taps "provider offered times" → expects a `provider_responded` one.
 */
export function getStaleRequestBlock(
  audience: 'provider' | 'client',
  openRequest: OpenRequestStatus,
  otherPartyName: string,
): RescheduleBlock | null {
  if (audience === 'provider') {
    if (openRequest === 'pending') return null;
    if (openRequest === 'provider_responded') {
      return {
        title: 'Already answered',
        message: `You've already offered ${otherPartyName} new times. It's waiting on them to choose one.`,
      };
    }
    return {
      title: 'This request is no longer open',
      message: 'This reschedule request has already been dealt with, or it has expired. There is nothing left to respond to.',
    };
  }
  if (openRequest === 'provider_responded') return null;
  if (openRequest === 'pending') return null; // still waiting on the provider: the screen explains that itself
  return {
    title: 'These times are no longer available',
    message: `${otherPartyName}'s offer of new times is no longer open — it may have expired or been replaced. Your booking is unchanged.`,
  };
}
