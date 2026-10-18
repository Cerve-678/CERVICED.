// src/features/maintenance/presentation.ts
//
// Pure derivation of how each maintenance item reads on screen: its state
// pill, its progress bar, which group it sits in, and the "N due" count the
// Profile tab and the Beauty Profile card show. No I/O; today is passed in.
//
// The state here is display-only. Whether a PUSH goes out is decided
// server-side by process_maintenance_reminders(), which applies the same
// "already booked" rule (see supabase/migrations/20261010120000_beauty_maintenance.sql).

import type { MaintenanceItem } from '../../types/maintenance';
import { toLocalDate } from '../../utils/dateUtils';

/** An item counts as "due soon" this many days ahead of its due date. */
export const DUE_SOON_DAYS = 7;

export type MaintenanceItemState =
  /** Client paused it. Nothing is counted or pushed. */
  | 'paused'
  /** The client already has an upcoming booking that covers it. */
  | 'booked'
  | 'overdue'
  | 'due_today'
  | 'due_soon'
  | 'on_track'
  /** No due date to show (should not happen for saved rows). */
  | 'unscheduled';

export interface ItemPresentation {
  state: MaintenanceItemState;
  /** Whole days from today to the due date; negative when overdue. */
  daysUntilDue: number | null;
  /** 0–100, how far through its interval the item is. Null hides the bar. */
  progressPercent: number | null;
}

/** Upcoming bookings the screen already knows about, used to mark an item
 *  "booked" so it isn't counted as needing the client. */
export interface UpcomingCoverage {
  serviceIds: ReadonlySet<string>;
  providerIds: ReadonlySet<string>;
}

export const NO_COVERAGE: UpcomingCoverage = { serviceIds: new Set(), providerIds: new Set() };

function dayDiff(fromYMD: string, toYMD: string): number {
  const ms = toLocalDate(toYMD).getTime() - toLocalDate(fromYMD).getTime();
  return Math.round(ms / 86400000);
}

/**
 * True when an upcoming booking already covers this item. Matches the
 * service when the item has one; a provider-only link counts too, since that
 * is the only thing the client told us. An unlinked item never matches —
 * there is nothing to compare it against.
 */
export function isCoveredByUpcomingBooking(item: MaintenanceItem, coverage: UpcomingCoverage): boolean {
  if (item.kind === 'event') return false;
  if (item.serviceId) return coverage.serviceIds.has(item.serviceId);
  if (item.providerId) return coverage.providerIds.has(item.providerId);
  return false;
}

export function presentMaintenanceItem(
  item: MaintenanceItem,
  todayYMD: string,
  coverage: UpcomingCoverage = NO_COVERAGE,
): ItemPresentation {
  const daysUntilDue = item.dueOn ? dayDiff(todayYMD, item.dueOn) : null;

  let progressPercent: number | null = null;
  if (item.dueOn && !item.paused) {
    const start = item.lastDoneOn ?? item.createdAt.slice(0, 10);
    const span = dayDiff(start, item.dueOn);
    const elapsed = dayDiff(start, todayYMD);
    progressPercent = span <= 0 ? 100 : Math.max(0, Math.min(100, Math.round((elapsed / span) * 100)));
  }

  let state: MaintenanceItemState;
  if (item.paused) state = 'paused';
  else if (daysUntilDue === null) state = 'unscheduled';
  else if (isCoveredByUpcomingBooking(item, coverage)) state = 'booked';
  else if (daysUntilDue < 0) state = 'overdue';
  else if (daysUntilDue === 0) state = 'due_today';
  else if (daysUntilDue <= DUE_SOON_DAYS) state = 'due_soon';
  else state = 'on_track';

  return { state, daysUntilDue, progressPercent };
}

const NEEDS_ATTENTION: ReadonlySet<MaintenanceItemState> = new Set(['overdue', 'due_today', 'due_soon']);

/** Whether this state counts toward the "N due" badge. */
export function needsAttention(state: MaintenanceItemState): boolean {
  return NEEDS_ATTENTION.has(state);
}

/** The "N due" number on the Profile tab row and the Maintenance card. */
export function countDueItems(
  items: readonly MaintenanceItem[],
  todayYMD: string,
  coverage: UpcomingCoverage = NO_COVERAGE,
): number {
  return items.filter(i => needsAttention(presentMaintenanceItem(i, todayYMD, coverage).state)).length;
}

export interface PresentedItem {
  item: MaintenanceItem;
  view: ItemPresentation;
}

export interface MaintenanceGroups {
  needsAttention: PresentedItem[];
  comingUp: PresentedItem[];
  events: PresentedItem[];
  paused: PresentedItem[];
  summary: { overdue: number; dueSoon: number; onTrack: number };
  /** The soonest item that needs the client, for the landing card. */
  next: PresentedItem | null;
}

function byDue(a: PresentedItem, b: PresentedItem): number {
  const ad = a.item.dueOn ?? '9999-12-31';
  const bd = b.item.dueOn ?? '9999-12-31';
  return ad < bd ? -1 : ad > bd ? 1 : a.item.title.localeCompare(b.item.title);
}

/** Group items the way the Maintenance screen lists them: by what the client
 *  should do, not by type. */
export function groupMaintenanceItems(
  items: readonly MaintenanceItem[],
  todayYMD: string,
  coverage: UpcomingCoverage = NO_COVERAGE,
): MaintenanceGroups {
  const presented = items.map(item => ({ item, view: presentMaintenanceItem(item, todayYMD, coverage) }));
  const paused = presented.filter(p => p.view.state === 'paused').sort(byDue);
  const events = presented.filter(p => p.item.kind === 'event' && p.view.state !== 'paused').sort(byDue);
  const rest = presented.filter(p => p.item.kind !== 'event' && p.view.state !== 'paused');
  const attention = rest.filter(p => needsAttention(p.view.state)).sort(byDue);
  const comingUp = rest.filter(p => !needsAttention(p.view.state)).sort(byDue);
  const eventsDue = events.filter(p => needsAttention(p.view.state));

  return {
    needsAttention: attention,
    comingUp,
    events,
    paused,
    summary: {
      overdue: [...attention, ...eventsDue].filter(p => p.view.state === 'overdue').length,
      dueSoon: [...attention, ...eventsDue].filter(p => p.view.state !== 'overdue').length,
      onTrack: comingUp.length + events.length - eventsDue.length,
    },
    next: [...attention, ...eventsDue].sort(byDue)[0] ?? null,
  };
}
