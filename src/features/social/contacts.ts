// src/features/social/contacts.ts
//
// "See who you know here": read the phone's contacts (only after the client
// taps for it — the permission is never asked up front), turn each number
// into the same sha256 the server keeps (normalisePhoneForMatching, then
// sha256 hex), and ask match_contact_hashes which belong to accounts.
//
// What never leaves the phone: names, the address book itself, and any
// number in readable form. What's sent: hashes only, compared in the query
// and never stored (migration 20261108220000). Nothing here is kept on the
// device either — results live in screen state for the session. Numbers and
// hashes are never logged.
//
// Matching uses the number people typed on their own profile, which isn't
// verified (decided 2026-11-08), so a match shows the ACCOUNT's own name
// first and the contact's name only as "In your contacts as …".

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

export interface ContactMatchResult extends PersonSummary {
  /** The name this number has in the client's own address book. */
  contactName: string | null;
}

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
  name?: string | null | undefined;
  phoneNumbers?: readonly { number?: string | null | undefined }[] | null | undefined;
}

/**
 * Every distinct number in the address book, normalised, with the first
 * contact name it was found under. Unusable numbers are dropped. Capped at
 * CONTACT_NUMBERS_PER_CHECK, in address-book order.
 */
export function collectContactNumbers(contacts: readonly RawContact[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const c of contacts) {
    for (const p of c.phoneNumbers ?? []) {
      const n = normalisePhoneForMatching(p.number);
      if (!n || out.has(n)) continue;
      out.set(n, c.name?.trim() || null);
      if (out.size >= CONTACT_NUMBERS_PER_CHECK) return out;
    }
  }
  return out;
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
  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
  });
  const numbers = collectContactNumbers(data);
  if (numbers.size === 0) return [];

  const entries = Array.from(numbers.entries());
  const hashes = await Promise.all(entries.map(([n]) => hashNormalisedNumber(n)));
  const nameByHash = new Map<string, string | null>();
  hashes.forEach((h, i) => nameByHash.set(h, entries[i]![1]));

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
      contactName: nameByHash.get(m.phoneHash) ?? null,
    });
  }
  return out;
}
