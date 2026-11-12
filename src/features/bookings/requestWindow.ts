// How long a provider has to answer a booking request. The database decides
// (booking_request_deadline, used by process_expire_stale_pending_bookings);
// this keeps every line of copy saying the same thing, and a test holds the
// two together.
//
// The answer is due 24 hours after the request, or an hour before the
// appointment if that comes sooner. A request made with less than an hour to
// go has until the appointment starts.
import { formatShortDayDate, formatTime12 } from '../../utils/dateUtils';

export const REQUEST_RESPONSE_HOURS = 24;
/** A short-notice request must be answered this long before it starts. */
export const REQUEST_ANSWER_LEAD_HOURS = 1;

const HOUR_MS = 60 * 60 * 1000;

export interface RequestDeadline {
  /** When an unanswered request is declined automatically. */
  answerBy: Date;
  /** True when the appointment, not the 24 hours, sets the deadline. */
  urgent: boolean;
}

export function requestAnswerDeadline(requestedAt: Date, appointmentStart: Date): RequestDeadline {
  const dayLater = requestedAt.getTime() + REQUEST_RESPONSE_HOURS * HOUR_MS;
  const beforeStart = appointmentStart.getTime() - REQUEST_ANSWER_LEAD_HOURS * HOUR_MS;
  if (beforeStart <= requestedAt.getTime()) {
    return { answerBy: appointmentStart, urgent: true };
  }
  return beforeStart < dayLater
    ? { answerBy: new Date(beforeStart), urgent: true }
    : { answerBy: new Date(dayLater), urgent: false };
}

/** "3:00pm today", "9:30am tomorrow", "3:00pm on Fri 7 Nov". */
export function formatAnswerBy(answerBy: Date, now: Date = new Date()): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((day(answerBy) - day(now)) / (24 * HOUR_MS));
  const when = diffDays === 0 ? 'today' : diffDays === 1 ? 'tomorrow' : `on ${formatShortDayDate(answerBy)}`;
  return `${formatTime12(answerBy)} ${when}`;
}

/** The client's note on a booking waiting for an answer. `held` when the
 *  payment is only held on their card (a checkout of requests only), so it is
 *  taken only if the provider accepts. */
export function clientRequestNote(providerName: string, deadline: RequestDeadline, now?: Date, held = false): string {
  const by = formatAnswerBy(deadline.answerBy, now);
  const lead = deadline.urgent
    ? `Your appointment is soon, so ${providerName} has until ${by} to accept this request.`
    : `${providerName} has ${REQUEST_RESPONSE_HOURS} hours to accept this request, until ${by}.`;
  if (held) {
    return `${lead} Your card is only charged if they accept. If they decline or don't answer by then, the hold on your card is released and you pay nothing.`;
  }
  return `${lead} If they don't answer by then, it's declined automatically and anything you paid is refunded in full.`;
}

/** The provider's note on a request they haven't answered. `held` when the
 *  client's payment is only held on their card until the provider accepts. */
export function providerRequestNote(deadline: RequestDeadline, now?: Date, held = false): string {
  const by = formatAnswerBy(deadline.answerBy, now);
  const lead = deadline.urgent
    ? `Needs your answer soon: accept or decline by ${by}, before the appointment.`
    : `You have ${REQUEST_RESPONSE_HOURS} hours to answer, until ${by}.`;
  if (held) {
    return `${lead} The client's payment is held on their card and taken when you accept. If you don't answer, it's declined automatically and the hold is released.`;
  }
  return `${lead} After that it's declined automatically and the client is refunded.`;
}
