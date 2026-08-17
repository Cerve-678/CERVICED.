import type { ConfirmedBooking } from '../../contexts/BookingContext';

/** Contract for a single booking card in client booking lists. */
export interface BookingCardProps {
  booking: ConfirmedBooking;
  onPress: (booking: ConfirmedBooking) => void;
  isHighlighted?: boolean;
  isRecentlyAdded?: boolean;
  /** Pending intake forms plus unread info packs. */
  actionCount?: number;
  /** Reserves tag space for every item in a horizontal row. */
  rowHasTag?: boolean;
}

/** A category section consumed by the client booking list. */
export type GroupedListItem = {
  kind: 'category';
  serviceType: string;
  bookings: ConfirmedBooking[];
};
