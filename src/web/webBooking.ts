/**
 * Booking from a provider's web page (/@handle).
 *
 * The page opens the app's own BookingSheet, then a short web checkout in
 * place of the app's Cart: review, email code, payment, booked. One service
 * per booking, as in the app (MULTI_SERVICE_BOOKING_ENABLED is off there too).
 */
import type { BookingSheetProps, BookingSheetResult } from '../components/BookingSheet';
import type { ProviderProfileService } from '../features/providers/profileTypes';
import { formatLongDateNoYear, formatTime12Safe } from '../utils/dateUtils';

/** The Book buttons show only in local development until payment is built,
 * so nobody on cerviced.co reaches a booking they can't finish. */
export const WEB_BOOKING_ENABLED = __DEV__;

/** What the client picked in the booking sheet. */
export interface WebBookingChoice {
  service: ProviderProfileService;
  result: BookingSheetResult;
}

/** What the checkout shows of the booking. No prices: the sheet's Confirm
 * step showed them, and the amount to pay comes from the server once the
 * time is held, never from the page. */
export interface WebBookingSummary {
  serviceName: string;
  when: string;
  addOns: { id: string; name: string }[];
}

/** What the booking sheet reopens with after Change: the same add-ons, day,
 * time, notes and deposit choice. The sheet names the day and time
 * selectedDate/selectedTime where its result says date/time. A promo code
 * isn't carried back (the sheet takes none on reopening) and is typed again. */
export function sheetInitialFrom(result: BookingSheetResult): NonNullable<BookingSheetProps['initial']> {
  return {
    selectedAddOns: result.selectedAddOns,
    selectedDate: result.date,
    selectedTime: result.time,
    notes: result.notes,
    isDepositOnly: result.isDepositOnly,
  };
}

export function summarizeWebBooking({ service, result }: WebBookingChoice): WebBookingSummary {
  const time = formatTime12Safe(result.time);
  return {
    serviceName: service.name,
    when: time ? `${formatLongDateNoYear(result.date)} at ${time}` : formatLongDateNoYear(result.date),
    addOns: result.selectedAddOns.map(addOn => ({ id: String(addOn.id), name: addOn.name })),
  };
}
