import { BookingStatus } from '../../contexts/BookingContext';
import { tr, type TranslationKey } from '../../i18n';

export const BOOKING_STATUS_COLORS: Record<string, string> = {
  [BookingStatus.PENDING]: '#FF9500',
  [BookingStatus.UPCOMING]: '#007AFF',
  [BookingStatus.IN_PROGRESS]: '#FF9500',
  [BookingStatus.COMPLETED]: '#34C759',
  [BookingStatus.CANCELLED]: '#FF3B30',
  [BookingStatus.NO_SHOW]: '#8E8E93',
};

const BOOKING_STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  [BookingStatus.PENDING]: 'clientBooking.status.pendingConfirmation',
  [BookingStatus.UPCOMING]: 'clientBooking.status.upcoming',
  [BookingStatus.IN_PROGRESS]: 'clientBooking.status.inProgress',
  [BookingStatus.COMPLETED]: 'clientBooking.status.completed',
  [BookingStatus.CANCELLED]: 'clientBooking.status.cancelled',
  [BookingStatus.NO_SHOW]: 'clientBooking.status.noShow',
};

/** Status label in the current language. Each entry is a getter so a reader
 *  always gets the active language; the screen showing it must itself call
 *  useTranslation() to re-render on a language change. */
export const BOOKING_STATUS_LABELS: Record<string, string> = Object.defineProperties(
  {} as Record<string, string>,
  Object.fromEntries(
    Object.entries(BOOKING_STATUS_LABEL_KEYS).map(([status, key]) => [
      status,
      { enumerable: true, get: () => tr(key) },
    ]),
  ),
);

/** Provider action/status mapping; independent of the client booking cache. */
export const PROVIDER_BOOKING_DB_STATUS: Record<string, string> = {
  [BookingStatus.PENDING]: 'pending',
  [BookingStatus.UPCOMING]: 'confirmed',
  [BookingStatus.IN_PROGRESS]: 'in_progress',
  [BookingStatus.COMPLETED]: 'completed',
  [BookingStatus.CANCELLED]: 'cancelled',
  [BookingStatus.NO_SHOW]: 'no_show',
};

const STATUS_WORD_KEYS: Record<string, TranslationKey> = {
  [BookingStatus.PENDING]: 'clientBooking.statusWord.pending',
  [BookingStatus.UPCOMING]: 'clientBooking.statusWord.upcoming',
  [BookingStatus.IN_PROGRESS]: 'clientBooking.statusWord.inProgress',
  [BookingStatus.COMPLETED]: 'clientBooking.statusWord.completed',
  [BookingStatus.CANCELLED]: 'clientBooking.statusWord.cancelled',
  [BookingStatus.NO_SHOW]: 'clientBooking.statusWord.noShow',
  [BookingStatus.PROVIDER_NO_SHOW]: 'clientBooking.statusWord.providerNoShow',
};

/** The plain status word a client sees ("in progress", "no show") in the
 *  current language. Unknown statuses fall back to the raw value with its
 *  first underscore spaced out, as the screens always showed it. */
export function bookingStatusWord(status: string): string {
  const key = STATUS_WORD_KEYS[status];
  return key ? tr(key) : status.replace('_', ' ');
}
