import type { BookingInfoPack } from '../../services/databaseService';
import { BookingStatus } from '../../types/booking';

const INFO_PACK_POPUP_MAX_CHARS = 240;

/** Formats notice windows without exposing raw, unwieldy hour counts. */
export function formatNoticeWindow(hours: number): string {
  if (hours <= 0) return '';
  if (hours > 72 && hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? '1 day' : `${days} days`;
  }
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

/** "24 hours' notice", "1 hour's notice", "4 days' notice". */
export function formatNoticePhrase(hours: number): string {
  const window = formatNoticeWindow(hours);
  if (!window) return 'notice';
  return `${window}${window.startsWith('1 ') ? "'s" : "'"} notice`;
}

/** Short info packs are readable in a popup; longer ones need full-screen reading. */
export function isLongBookingInfoPack(pack: BookingInfoPack): boolean {
  return (pack.title?.length ?? 0) + (pack.content?.length ?? 0) > INFO_PACK_POPUP_MAX_CHARS;
}

/**
 * The status badge on a client's booking, in words they'd use themselves.
 * The raw status ("no_show", "in_progress") used to be upper-cased straight
 * onto the badge, which read as "PROVIDER NO_SHOW".
 */
export function clientBookingStatusLabel(booking: {
  status: BookingStatus | string;
  isPendingReschedule?: boolean | undefined;
  newTimesOffered?: boolean | undefined;
}): string {
  if (booking.isPendingReschedule) {
    return booking.newTimesOffered ? 'New times offered' : 'Waiting on a new time';
  }
  switch (booking.status) {
    case BookingStatus.PENDING: return 'Request sent';
    case BookingStatus.UPCOMING: return 'Confirmed';
    case BookingStatus.IN_PROGRESS: return 'Happening now';
    case BookingStatus.COMPLETED: return 'Done';
    case BookingStatus.CANCELLED: return 'Cancelled';
    case BookingStatus.NO_SHOW: return 'Marked as missed';
    case BookingStatus.PROVIDER_NO_SHOW: return "Provider didn't turn up";
    default: return 'Booked';
  }
}

/** "2:30 PM to 3:30 PM", or just the start when there's no separate end. */
export function formatBookingTimeRange(start: string, end?: string | null): string {
  if (!start) return '—';
  return end && end !== start ? `${start} to ${end}` : start;
}
