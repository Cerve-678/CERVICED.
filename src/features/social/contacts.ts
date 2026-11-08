// src/features/social/contacts.ts
//
// "See who you know here": read the phone's contacts (only after the client
// taps for it — the permission is never asked up front), turn each number
// into the same sha256 the server keeps (normalisePhoneForMatching, then
// sha256 hex), and ask match_contact_hashes which belong to accounts.
//
// Only phone numbers are read — never names. What leaves the phone: hashes
// only, compared in the query and never stored (migration 20261108220000).
// Nothing is kept on the device either; the last result is held in memory
// for the session. Numbers and hashes are never logged.
//
// Matching uses the number people typed on their own profile, which isn't
// verified, so a match shows only the account's own name under an "In your
// contacts" heading — never the name the client saved (decided 2026-11-08:
// echoing it would let a fake account borrow it).

import * as Contacts from 'expo-contacts';
import * as Crypto from 'expo-crypto';
import { matchContactHashes } from '../../services/databaseService';
import { normalisePhoneForMatching } from '../../utils/phoneMatching';
import type { PersonSummary } from './types';

/** The server takes 3000 numbers a day per account; never send more. */
export const CONTACT_NUMBERS_PER_CHECK = 3000;

/**
 * The last result for this app session, so leaving and coming back to Your
 * circle doesn't re-send the whole address book against the daily budget.
 * Memory only: never written to the device. Keyed by account.
 */
let lastMatches: { userId: string; matches: ContactMatchResult[] } | null = null;

export function cachedContactMatches(userId: string): ContactMatchResult[] | null {
  return lastMatches && lastMatches.userId === userId ? lastMatches.matches : null;
}

export function rememberContactMatches(userId: string, matches: ContactMatchResult[]): void {
  lastMatches = { userId, matches };
}

/** The server's rate-limit guard (social_take_budget). */
export function isContactsLimitError(err: unknown): boolean {
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === 'string' && /done that a lot/i.test(message);
}

export type ContactsAccess = 'granted' | 'denied' | 'blocked';

/** An account found from the address book: just the account itself. */
export type ContactMatchResult = PersonSummary;

/** Where things stand without asking (reading the status never shows a prompt). */
export async function getContactsAccess(): Promise<ContactsAccess | 'undetermined'> {
  const res = await Contacts.getPermissionsAsync();
  if (res.granted) return 'granted';
  if (res.status === Contacts.PermissionStatus.UNDETERMINED) return 'undetermined';
  return res.canAskAgain ? 'denied' : 'blocked';
}

/** Shows the system prompt (with the app.json wording) if it can still be shown. */
export async function requestContactsAccess(): Promise<ContactsAccess> {
  const res = await Contacts.requestPermissionsAsync();
  if (res.granted) return 'granted';
  return res.canAskAgain ? 'denied' : 'blocked';
}

export interface RawContact {
  phoneNumbers?: readonly { number?: string | null | undefined }[] | null | undefined;
}

/**
 * Every distinct number in the address book, normalised. Unusable numbers
 * are dropped. Capped at CONTACT_NUMBERS_PER_CHECK, in address-book order.
 */
export function collectContactNumbers(contacts: readonly RawContact[]): string[] {
  const out = new Set<string>();
  for (const c of contacts) {
    for (const p of c.phoneNumbers ?? []) {
      const n = normalisePhoneForMatching(p.number);
      if (!n) continue;
      out.add(n);
      if (out.size >= CONTACT_NUMBERS_PER_CHECK) return Array.from(out);
    }
  }
  return Array.from(out);
}

/** sha256 hex of a normalised number, exactly as social_phone_hash() makes it. */
export function hashNormalisedNumber(normalised: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, normalised, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

/**
 * Reads the address book and returns the accounts it matches. Call only once
 * access is granted. Throws on failure (the screen shows it).
 */
export async function findContactsOnCerviced(): Promise<ContactMatchResult[]> {
  const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] });
  const numbers = collectContactNumbers(data);
  if (numbers.length === 0) return [];

  const hashes = await Promise.all(numbers.map(hashNormalisedNumber));
  const matches = await matchContactHashes(hashes);
  const seen = new Set<string>();
  const out: ContactMatchResult[] = [];
  for (const m of matches) {
    if (seen.has(m.userId)) continue;
    seen.add(m.userId);
    out.push({
      userId: m.userId,
      name: m.name,
      avatarUrl: m.avatarUrl,
      myStatus: m.myStatus,
      followsMe: m.followsMe,
    });
  }
  return out;
}
