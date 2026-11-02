// What the Before You Can Book checklist still needs from an account.
//
// Email signup requires all three of these. Sign in with Apple requires none of
// them: Apple shares a name once at most, and never a phone number or a date of
// birth. So this goes by what the account is missing rather than how it signed
// in, which also means the checklist goes away for good once it's filled in.

export type BookingDetail = 'name' | 'phone' | 'dob';

export function missingBookingDetails(
  user: {
    name?: string | null;
    phone?: string | null;
    dob?: string | null;
    hasClientProfile?: boolean | undefined;
  } | null | undefined,
): BookingDetail[] {
  // Undefined means the users row hasn't been read yet and these fields came
  // from the session, so a blank here says nothing about what's saved.
  if (!user || user.hasClientProfile === undefined) return [];
  const missing: BookingDetail[] = [];
  if (!user.name?.trim()) missing.push('name');
  if (!user.phone?.trim()) missing.push('phone');
  if (!user.dob?.trim()) missing.push('dob');
  return missing;
}
