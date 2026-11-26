/**
 * Who is booking on the website, and what's still needed before they can pay.
 *
 * The web signs in with an email code (sendEmailSignInCode → verifySignupOtp),
 * which makes a real CERVICED account. Booking then needs what the app's
 * Before You Can Book checklist asks for (name, mobile, date of birth), because
 * prepare_checkout copies the client's name and phone onto the booking from the
 * account, not from the request.
 */
import { missingBookingDetails } from '../features/bookings/beforeYouBook';
import type { BookingDetail } from '../features/bookings/beforeYouBook';
import type { DbUser } from '../types/database';

export type WebAccountProfile = Pick<DbUser, 'name' | 'phone' | 'dob' | 'role' | 'has_client_profile'>;

export type WebAccountState =
  /** A provider account with no client profile: the app doesn't let it book either. */
  | { kind: 'providerOnly' }
  | { kind: 'details'; missing: BookingDetail[] }
  | { kind: 'ready' };

export function webAccountState(profile: WebAccountProfile): WebAccountState {
  if (profile.role === 'provider' && !profile.has_client_profile) return { kind: 'providerOnly' };
  const missing = missingBookingDetails({
    name: profile.name,
    phone: profile.phone,
    dob: profile.dob,
    hasClientProfile: true,
  });
  return missing.length > 0 ? { kind: 'details', missing } : { kind: 'ready' };
}

/** The date of birth as the users row stores it. */
export function dobForAccount(day: string, month: string, year: string): string {
  return `${year.trim()}-${month.trim().padStart(2, '0')}-${day.trim().padStart(2, '0')}`;
}

/** Only digits, at most six: what the code box keeps of whatever was typed or pasted. */
export function cleanSignInCode(typed: string): string {
  return typed.replace(/\D/g, '').slice(0, 6);
}
