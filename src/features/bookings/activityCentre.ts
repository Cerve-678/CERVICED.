// src/features/bookings/activityCentre.ts
//
// The client's Activity Centre: one list of everything about their bookings
// that is either waiting on them ("Needs you") or waiting on someone else
// ("In progress"). Pure — the screen hands in the bookings it already has from
// BookingContext plus getMyActivity()'s reads, and gets the list back.
//
// Every item points at the place the thing is actually done (the booking's
// detail screen, the reschedule picker, the waitlist hold popup). Nothing here
// acts on its own, and the refund wording follows refundRequestTimeline.ts:
// it never promises money.

import type { ClientActivityRemote } from '../../services/databaseService';
import {
  BookingStatus,
  NO_SHOW_DISPUTE_WINDOW_DAYS,
  PaymentStatus,
  canDisputeNoShow,
  isTerminalBookingStatus,
  type ConfirmedBooking,
} from '../../types/booking';
import { formatShortDayDate, formatTime12Safe } from '../../utils/dateUtils';
import { REFUND_REVIEW_PROMISE, refundReplyDeadline } from './refundRequestTimeline';
import { minutesOfDay } from './tipWindow';

export type ActivityBooking = Pick<
  ConfirmedBooking,
  | 'id'
  | 'serviceName'
  | 'providerName'
  | 'bookingDate'
  | 'bookingTime'
  | 'status'
  | 'paymentStatus'
  | 'isPendingReschedule'
  | 'rescheduleRequest'
  | 'noShowMarkedAt'
  | 'noShowDisputedAt'
>;

export type ActivityKind =
  | 'fee_to_pay'
  | 'waitlist_hold'
  | 'reschedule_pick'
  | 'intake_form'
  | 'info_pack'
  | 'no_show_dispute'
  | 'refund_request'
  | 'refund_pending'
  | 'reschedule_waiting'
  | 'awaiting_confirmation'
  | 'done';

/** Where tapping an item takes the client. */
export type ActivityTarget =
  | { type: 'booking'; bookingId: string }
  | { type: 'reschedule'; bookingId: string }
  | { type: 'waitlist_hold'; bookingId: string };

/**
 * How the item's live dot moves. `urgent` = its deadline is within a day,
 * `soon` = a hard deadline further off, `still` = tied to an appointment with
 * no deadline of its own, `waiting` = someone else has it, `done` = finished
 * in the last few days, shown struck through.
 */
export type ActivityPulse = 'urgent' | 'soon' | 'still' | 'waiting' | 'done';

export interface ActivityItem {
  key: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  /** One short line for the status pill at the top of the page. */
  summary: string;
  /** The deadline in a few words ("Ends at 4:15 PM"), where there is one. */
  caption?: string | undefined;
  pulse: ActivityPulse;
  target: ActivityTarget;
  /** Earliest first: a deadline where there is one, else the appointment. */
  sortAt: number;
}

export interface ClientActivity {
  needsYou: ActivityItem[];
  inProgress: ActivityItem[];
  /** Finished recently, newest first. Struck through on the page. */
  done: ActivityItem[];
}

const DAY_MS = 86_400_000;

function names(b: Pick<ActivityBooking, 'serviceName' | 'providerName'> | undefined): { service: string; provider: string } {
  return {
    service: b?.serviceName?.trim() || 'your appointment',
    provider: b?.providerName?.trim() || 'Your provider',
  };
}

/** Local time of the appointment's start, for ordering. Unreadable → far future. */
function appointmentMs(b: Pick<ActivityBooking, 'bookingDate' | 'bookingTime'>): number {
  const date = /^(\d{4})-(\d{2})-(\d{2})/.exec(b.bookingDate ?? '');
  if (!date) return Number.MAX_SAFE_INTEGER;
  const minutes = minutesOfDay(b.bookingTime ?? '') ?? 0;
  return new Date(Number(date[1]), Number(date[2]) - 1, Number(date[3]), 0, minutes).getTime();
}

function isoMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function shortDay(iso: string | null | undefined): string | null {
  const ms = isoMs(iso);
  return ms === null ? null : formatShortDayDate(new Date(ms));
}

/** "Thu 12 Nov at 2:30 PM", or just the day when the time can't be read. */
function when(b: Pick<ActivityBooking, 'bookingDate' | 'bookingTime'>): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(b.bookingDate ?? '')) return '';
  const day = formatShortDayDate(b.bookingDate);
  const time = formatTime12Safe(b.bookingTime);
  return time ? `${day} at ${time}` : day;
}

/** "Before Sat 14 Nov", for something due before the appointment. */
function beforeDay(b: Pick<ActivityBooking, 'bookingDate'>): string | undefined {
  return /^\d{4}-\d{2}-\d{2}/.test(b.bookingDate ?? '') ? `Before ${formatShortDayDate(b.bookingDate)}` : undefined;
}

function pounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function byDueDate(a: Pick<ActivityItem, 'sortAt'>, b: Pick<ActivityItem, 'sortAt'>): number {
  return a.sortAt - b.sortAt;
}

type DraftItem = Omit<ActivityItem, 'pulse'>;

/** Kinds whose sortAt is a real deadline rather than the appointment. */
const HARD_DEADLINE: ReadonlySet<ActivityKind> = new Set(['fee_to_pay', 'waitlist_hold', 'no_show_dispute']);

function needsYouPulse(item: DraftItem, nowMs: number): ActivityPulse {
  if (item.sortAt - nowMs <= DAY_MS) return 'urgent';
  return HARD_DEADLINE.has(item.kind) ? 'soon' : 'still';
}

export function buildClientActivity(
  bookings: readonly ActivityBooking[],
  remote: ClientActivityRemote,
  now: Date = new Date(),
): ClientActivity {
  const nowMs = now.getTime();
  const byId = new Map(bookings.map(b => [b.id, b]));
  const needsYou: DraftItem[] = [];
  const inProgress: DraftItem[] = [];

  // A form or pack only matters before the appointment; one row per booking.
  const isStillAhead = (b: ActivityBooking | undefined): b is ActivityBooking =>
    !!b && !isTerminalBookingStatus(b.status) && b.status !== BookingStatus.IN_PROGRESS;

  // ── Needs you ─────────────────────────────────────────────

  for (const fee of remote.feesToPay) {
    const { provider } = names(byId.get(fee.bookingId));
    const by = shortDay(fee.payBy);
    needsYou.push({
      key: `fee:${fee.id}`,
      kind: 'fee_to_pay',
      title: `Pay your ${fee.kind === 'late' ? 'late' : 'no-show'} fee · ${pounds(fee.amountPence)}`,
      detail: `${provider} couldn't take it from your saved card.${by ? ` Please pay by ${by}.` : ''}`,
      summary: `${fee.kind === 'late' ? 'Late' : 'No-show'} fee of ${pounds(fee.amountPence)} to pay${by ? ` by ${by}` : ''}`,
      caption: by ? `Pay by ${by}` : undefined,
      target: { type: 'booking', bookingId: fee.bookingId },
      sortAt: isoMs(fee.payBy) ?? nowMs,
    });
  }

  for (const hold of remote.waitlistHolds) {
    const { service, provider } = names(hold);
    const until = formatTime12Safe(new Date(hold.holdExpiresAt));
    const slot = when(hold);
    needsYou.push({
      key: `hold:${hold.bookingId}`,
      kind: 'waitlist_hold',
      title: 'A slot opened up for you',
      detail: `${service} with ${provider}${slot ? ` · ${slot}` : ''}.${until ? ` Confirm it before ${until}.` : ''}`,
      summary: `Confirm your ${service} slot${until ? ` before ${until}` : ''}`,
      caption: until ? `Ends at ${until}` : undefined,
      target: { type: 'waitlist_hold', bookingId: hold.bookingId },
      sortAt: isoMs(hold.holdExpiresAt) ?? nowMs,
    });
  }

  for (const b of bookings) {
    if (isTerminalBookingStatus(b.status) || !b.isPendingReschedule) continue;
    if (!(b.rescheduleRequest?.providerAvailableDates?.length)) continue;
    const { service, provider } = names(b);
    needsYou.push({
      key: `reschedule:${b.id}`,
      kind: 'reschedule_pick',
      title: 'Pick a new time',
      detail: `${provider} sent new times for ${service}.`,
      summary: `Pick a new time for ${service}`,
      target: { type: 'reschedule', bookingId: b.id },
      sortAt: appointmentMs(b),
    });
  }

  for (const id of new Set(remote.pendingFormBookingIds)) {
    const b = byId.get(id);
    if (!isStillAhead(b)) continue;
    const { service, provider } = names(b);
    needsYou.push({
      key: `form:${id}`,
      kind: 'intake_form',
      title: 'Fill in your form',
      detail: `${provider} needs it before ${service}${when(b) ? ` on ${when(b)}` : ''}.`,
      summary: `${provider} needs your form`,
      caption: beforeDay(b),
      target: { type: 'booking', bookingId: id },
      sortAt: appointmentMs(b),
    });
  }

  const packCounts = new Map<string, number>();
  for (const id of remote.unreadPackBookingIds) packCounts.set(id, (packCounts.get(id) ?? 0) + 1);
  for (const [id, count] of packCounts) {
    const b = byId.get(id);
    if (!isStillAhead(b)) continue;
    const { service, provider } = names(b);
    needsYou.push({
      key: `pack:${id}`,
      kind: 'info_pack',
      title: count > 1 ? `Read ${count} info packs` : 'Read your info pack',
      detail: `From ${provider} for ${service}${when(b) ? ` on ${when(b)}` : ''}.`,
      summary: count > 1 ? `${provider} sent you ${count} info packs` : `${provider} sent you an info pack`,
      caption: beforeDay(b),
      target: { type: 'booking', bookingId: id },
      sortAt: appointmentMs(b),
    });
  }

  for (const b of bookings) {
    // Only a booking with a recorded mark time: an old one without it would
    // otherwise sit here forever (canDisputeNoShow treats it as open).
    if (!b.noShowMarkedAt || !canDisputeNoShow(b, BookingStatus.NO_SHOW, nowMs)) continue;
    const markedMs = isoMs(b.noShowMarkedAt);
    if (markedMs === null) continue;
    const deadline = markedMs + NO_SHOW_DISPUTE_WINDOW_DAYS * DAY_MS;
    const { service, provider } = names(b);
    needsYou.push({
      key: `noshow:${b.id}`,
      kind: 'no_show_dispute',
      title: 'Marked as a no-show',
      detail: `${provider} marked you as not turning up for ${service}. If that's wrong, you can say so by ${formatShortDayDate(new Date(deadline))}.`,
      summary: `Marked as a no-show for ${service}`,
      caption: `Reply by ${formatShortDayDate(new Date(deadline))}`,
      target: { type: 'booking', bookingId: b.id },
      sortAt: deadline,
    });
  }

  // ── In progress ───────────────────────────────────────────

  const openRefundBookingIds = new Set<string>();
  for (const r of remote.openRefundRequests) {
    openRefundBookingIds.add(r.bookingId);
    const { service, provider } = names(byId.get(r.bookingId));
    if (r.status === 'with_provider') {
      const by = shortDay(refundReplyDeadline(r.createdAt));
      inProgress.push({
        key: `refund:${r.id}`,
        kind: 'refund_request',
        title: 'Refund requested',
        detail: `With ${provider} for ${service}.${by ? ` If they haven't replied by ${by}, it comes to Cerviced.` : ''}`,
        summary: `${provider} has your refund request`,
        target: { type: 'booking', bookingId: r.bookingId },
        sortAt: isoMs(r.createdAt) ?? nowMs,
      });
    } else {
      inProgress.push({
        key: `refund:${r.id}`,
        kind: 'refund_request',
        title: 'Refund under review by Cerviced',
        detail: `${r.passedAutomatically ? `${provider} didn't reply in time, so Cerviced has it. ` : ''}${REFUND_REVIEW_PROMISE}`,
        summary: 'Cerviced is reviewing your refund request',
        target: { type: 'booking', bookingId: r.bookingId },
        sortAt: isoMs(r.createdAt) ?? nowMs,
      });
    }
  }

  for (const b of bookings) {
    // An open request already says where the money is; don't say it twice.
    if (b.paymentStatus !== PaymentStatus.REFUND_PENDING || openRefundBookingIds.has(b.id)) continue;
    const { service, provider } = names(b);
    inProgress.push({
      key: `refundpending:${b.id}`,
      kind: 'refund_pending',
      title: 'Refund pending',
      detail: `${service} with ${provider}. It's being processed and will update here once it has gone through.`,
      summary: `Your refund for ${service} is being processed`,
      target: { type: 'booking', bookingId: b.id },
      sortAt: appointmentMs(b),
    });
  }

  for (const b of bookings) {
    if (isTerminalBookingStatus(b.status) || !b.isPendingReschedule) continue;
    if (b.rescheduleRequest?.providerAvailableDates?.length) continue;
    const { service, provider } = names(b);
    inProgress.push({
      key: `reschedulewait:${b.id}`,
      kind: 'reschedule_waiting',
      title: 'Reschedule requested',
      detail: `Waiting for ${provider} to send new times for ${service}.`,
      summary: `Waiting for ${provider} to send new times`,
      target: { type: 'booking', bookingId: b.id },
      sortAt: appointmentMs(b),
    });
  }

  for (const b of bookings) {
    if (b.status !== BookingStatus.PENDING) continue;
    const { service, provider } = names(b);
    inProgress.push({
      key: `confirm:${b.id}`,
      kind: 'awaiting_confirmation',
      title: 'Waiting to be confirmed',
      detail: `${provider} hasn't confirmed ${service}${when(b) ? ` on ${when(b)}` : ''} yet.`,
      summary: `Waiting for ${provider} to confirm ${service}`,
      target: { type: 'booking', bookingId: b.id },
      sortAt: appointmentMs(b),
    });
  }

  // ── Done ──────────────────────────────────────────────────

  // A booking still asking for a form or pack shows that, not an older one done.
  const stillOpen = new Set([
    ...remote.pendingFormBookingIds.map(id => `form:${id}`),
    ...remote.unreadPackBookingIds.map(id => `pack:${id}`),
  ]);
  const done: ActivityItem[] = [];
  const seenDone = new Set<string>();
  for (const d of remote.recentlyDone) {
    const doneMs = isoMs(d.doneAt);
    if (doneMs === null) continue;
    const { service, provider } = names(byId.get(d.bookingId));
    const base = { kind: 'done' as const, pulse: 'done' as const, target: { type: 'booking' as const, bookingId: d.bookingId }, sortAt: doneMs };
    if (d.kind === 'form_sent' || d.kind === 'pack_read') {
      const open = `${d.kind === 'form_sent' ? 'form' : 'pack'}:${d.bookingId}`;
      if (stillOpen.has(open) || seenDone.has(open)) continue;
      seenDone.add(open);
      done.push(d.kind === 'form_sent'
        ? { ...base, key: `done:form:${d.id}`, title: 'Fill in your form', detail: `Sent to ${provider} for ${service}.`, summary: 'Form sent' }
        : { ...base, key: `done:pack:${d.id}`, title: 'Read your info pack', detail: `From ${provider} for ${service}.`, summary: 'Info pack read' });
    } else if (d.kind === 'fee_paid') {
      done.push({
        ...base,
        key: `done:fee:${d.id}`,
        title: `Pay your ${d.feeKind === 'late' ? 'late' : 'no-show'} fee · ${pounds(d.amountPence)}`,
        detail: `Paid on ${formatShortDayDate(new Date(doneMs))}.`,
        summary: 'Fee paid',
      });
    } else {
      done.push({
        ...base,
        key: `done:refund:${d.id}`,
        title: 'Refund requested',
        detail: d.outcome === 'refunded'
          ? `${service} with ${provider}. Decided: refund issued.`
          : `${service} with ${provider}. Decided: not refunded. Open the booking to see why.`,
        summary: 'Refund request decided',
      });
    }
  }

  return {
    needsYou: needsYou.sort(byDueDate).map(item => ({ ...item, pulse: needsYouPulse(item, nowMs) })),
    inProgress: inProgress.sort(byDueDate).map(item => ({ ...item, pulse: 'waiting' as const })),
    done: done.sort((a, b) => b.sortAt - a.sortAt),
  };
}

// ── The dated line ───────────────────────────────────────────

export interface ActivityDay {
  key: string;
  /** "TODAY", or "TUE 10 NOV". */
  label: string;
  isToday: boolean;
  items: ActivityItem[];
}

export interface ActivityTimeline {
  days: ActivityDay[];
  /** Everything someone else has, at the end of the line. */
  inProgress: ActivityItem[];
  /** Finished recently, after that. */
  done: ActivityItem[];
}

function localDayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The page lays the list out on a dated line only when that helps: when the
 * things waiting on the client fall on two or more different days. Fewer than
 * that, it's plain tiles and this returns null. Waiting items never count.
 */
export function activityTimeline(activity: ClientActivity, now: Date = new Date()): ActivityTimeline | null {
  const todayKey = localDayKey(now.getTime());
  const days: ActivityDay[] = [];
  for (const item of activity.needsYou) {
    // Anything already overdue still belongs to today.
    const key = item.sortAt < now.getTime() ? todayKey : localDayKey(item.sortAt);
    const last = days[days.length - 1];
    if (last?.key === key) {
      last.items.push(item);
      continue;
    }
    const isToday = key === todayKey;
    days.push({ key, isToday, label: isToday ? 'TODAY' : formatShortDayDate(key).toUpperCase(), items: [item] });
  }
  if (days.length < 2) return null;
  return { days, inProgress: activity.inProgress, done: activity.done };
}

/** Per-booking count of forms + unread packs — the "!" on each booking row. */
export function bookingTodoCounts(remote: Pick<ClientActivityRemote, 'pendingFormBookingIds' | 'unreadPackBookingIds'>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of [...remote.pendingFormBookingIds, ...remote.unreadPackBookingIds]) {
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}
