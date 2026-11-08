// src/features/providers/recentBookingActivity.ts
//
// What one row of a provider's Recent activity says: the newest bookings by
// when they were made. My Profile shows the latest RECENT_ACTIVITY_PREVIEW;
// See all opens booking history's History → All.

import type { BookingWithAddOns } from '../../types/database';
import { mapDbBookingStatus } from '../../types/booking';
import { BOOKING_STATUS_COLORS, BOOKING_STATUS_LABELS } from '../bookings/statusPresentation';
import { formatShortDayDate, formatTime12Safe } from '../../utils/dateUtils';

/** How many bookings the card on My Profile shows. */
export const RECENT_ACTIVITY_PREVIEW = 3;

export interface RecentBookingRowText {
  service: string;
  /** "Amara · for Tue 10 Nov, 2:30pm" */
  detail: string;
  /** "Booked 3h ago" */
  booked: string;
  price: string;
  status: string;
  statusColor: string;
}

/** "Booked just now" / "Booked 3h ago" / "Booked 2d ago", and past a week
 *  the day it was made. A Date, not the string: dateUtils' parser reads a
 *  timestamp as that day's midnight. */
function bookedAgo(made: Date, now: Date): string {
  if (Number.isNaN(made.getTime())) return 'Booked';
  const minutes = Math.floor((now.getTime() - made.getTime()) / 60000);
  if (minutes < 1) return 'Booked just now';
  if (minutes < 60) return `Booked ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Booked ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Booked ${days}d ago`;
  return `Booked ${formatShortDayDate(made)}`;
}

export function describeRecentBooking(booking: BookingWithAddOns, now: Date = new Date()): RecentBookingRowText {
  const status = mapDbBookingStatus(booking.status);
  const time = formatTime12Safe(booking.booking_time);
  const when = `${formatShortDayDate(booking.booking_date)}${time ? `, ${time}` : ''}`;
  const total = (booking.base_price ?? 0) + (booking.add_ons_total ?? 0);
  return {
    service: booking.service_name_snapshot?.trim() || 'Booking',
    detail: `${booking.customer_name?.trim() || 'Client'} · for ${when}`,
    booked: bookedAgo(new Date(booking.created_at), now),
    price: `£${total.toFixed(2)}`,
    status: BOOKING_STATUS_LABELS[status] ?? 'Booking',
    statusColor: BOOKING_STATUS_COLORS[status] ?? '#8E8E93',
  };
}
