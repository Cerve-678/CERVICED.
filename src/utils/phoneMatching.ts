// src/utils/phoneMatching.ts
//
// Normalises a phone number the same way the server's
// social_normalise_phone() does (migration 20261108190000), so a contact's
// number and an account's number hash to the same value. UK-first: a
// national "07…" number becomes "447…". Returns E.164 digits without '+',
// or null when it can't be a phone number. Keep in step with the SQL —
// src/tests/phoneMatching.test.ts pins both to the same outputs.

export function normalisePhoneForMatching(raw: string | null | undefined): string | null {
  let digits = (raw ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('440') && digits.length === 13) {
    // "+44 (0)7700 900123" keeps a stray trunk 0 after the country code.
    digits = `44${digits.slice(3)}`;
  } else if (digits.startsWith('0') && digits.length === 11) {
    digits = `44${digits.slice(1)}`;
  }
  return digits.length >= 9 && digits.length <= 15 ? digits : null;
}
