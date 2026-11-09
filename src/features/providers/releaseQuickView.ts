// src/features/providers/releaseQuickView.ts
//
// The release-day quick view under My Profile → Manage: how far ahead clients
// can book right now, in dates. Same arithmetic the client calendar uses
// (utils/bookingHorizon), so what the provider reads here is the wall clients
// actually hit. Changing it happens in Scheduling & Availability. A provider
// without a monthly release day has nothing to show here, so it's null and
// the row isn't drawn.

import {
  isMonthlyRelease,
  lastBookableDate,
  nextReleaseMoment,
  type BookingHorizonSettings,
} from '../../utils/bookingHorizon';
import { formatShortDayDate, formatTime12, ordinalSuffix } from '../../utils/dateUtils';

export interface ReleaseQuickView {
  title: string;
  lines: string[];
}

export function describeReleaseQuickView(settings: BookingHorizonSettings, now: Date = new Date()): ReleaseQuickView | null {
  const releaseDay = settings.schedule_release_day;
  if (!isMonthlyRelease(releaseDay)) return null;

  const openUntil = lastBookableDate(settings, now);
  const next = nextReleaseMoment(releaseDay, now);
  return {
    title: `Release day: the ${ordinalSuffix(releaseDay)} of every month`,
    lines: [
      ...(openUntil ? [`Clients can book up to ${formatShortDayDate(openUntil)}`] : []),
      `Next month opens ${formatShortDayDate(next)} at ${formatTime12(next)}`,
    ],
  };
}
