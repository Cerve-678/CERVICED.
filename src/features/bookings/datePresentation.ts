import { dateToYMD, formatLongDate } from '../../utils/dateUtils';

export function formatBookingDisplayDate(date: string): string {
  return formatLongDate(date);
}

export function dateToBookingIso(date: Date): string {
  return dateToYMD(date);
}

export function bookingIsoToDate(iso: string): Date {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
