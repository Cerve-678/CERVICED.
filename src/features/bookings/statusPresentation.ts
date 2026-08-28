import { BookingStatus } from '../../contexts/BookingContext';

export const BOOKING_STATUS_COLORS: Record<string, string> = {
  [BookingStatus.PENDING]: '#FF9500',
  [BookingStatus.UPCOMING]: '#007AFF',
  [BookingStatus.IN_PROGRESS]: '#FF9500',
  [BookingStatus.COMPLETED]: '#34C759',
  [BookingStatus.CANCELLED]: '#FF3B30',
  [BookingStatus.NO_SHOW]: '#8E8E93',
};

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  [BookingStatus.PENDING]: 'Pending Confirmation',
  [BookingStatus.UPCOMING]: 'Upcoming',
  [BookingStatus.IN_PROGRESS]: 'In Progress',
  [BookingStatus.COMPLETED]: 'Completed',
  [BookingStatus.CANCELLED]: 'Cancelled',
  [BookingStatus.NO_SHOW]: 'No Show',
};

/** Provider action/status mapping; independent of the client booking cache. */
export const PROVIDER_BOOKING_DB_STATUS: Record<string, string> = {
  [BookingStatus.PENDING]: 'pending',
  [BookingStatus.UPCOMING]: 'confirmed',
  [BookingStatus.IN_PROGRESS]: 'in_progress',
  [BookingStatus.COMPLETED]: 'completed',
  [BookingStatus.CANCELLED]: 'cancelled',
  [BookingStatus.NO_SHOW]: 'no_show',
};
