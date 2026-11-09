// src/features/social/contacts.ts
//
// "See who you know here": read the phone's contacts (only after the client
// taps for it — the permission is never asked up front), turn each number
// into the same sha256 the server keeps (normalisePhoneForMatching, then
// sha256 hex), and ask match_contact_hashes which belong to accounts.
//
// What leaves the phone: hashes only, compared in the query and never stored
// (migration 20261108220000). Contact names are read too (decided
// 2026-11-09) but only to list the people NOT on CERVICED with an Invite
// button — they stay on the phone, in memory for the session, and are never
// sent, stored or logged. Numbers and hashes are never logged either.
//
// Matching uses the number people typed on their own profile, which isn't
// verified, so a match shows only the account's own name under "On
// CERVICED" — never the name the client saved (decided 2026-11-08: echoing
// it would let a fake account borrow it).

import type * as ContactsModule from 'expo-contacts/legacy';
import type * as CryptoModule from 'expo-crypto';
import { matchContactHashes } from '../../services/databaseService';
import { normalisePhoneForMatching } from '../../utils/phoneMatching';
import { Linking, Platform, Share } from 'react-native';
import { logger } from '../../utils/logger';
import type { PersonSummary } from './types';

// Both native modules are loaded on first use, not when the app starts. A
// build made before they were added has no native side for them, and
// importing them at the top would crash it on launch; this way only the
// contacts check fails there (and the screen shows that it couldn't check).
/* eslint-disable @typescript-eslint/no-require-imports */
const loadContacts = (): typeof ContactsModule => require('expo-contacts/legacy') as typeof ContactsModule;
const loadCrypto = (): typeof CryptoModule => require('expo-crypto') as typeof CryptoModule;
/* eslint-enable @typescript-eslint/no-require-imports */

/** The server takes 3000 numbers a day per account; never send more. */
export const CONTACT_NUMBERS_PER_CHECK = 3000;

/**
 * The last result for this app session, so leaving and coming back to Your
 * circle doesn't re-send the whole address book against the daily budget.
 * Memory only: never written to the device. Keyed by account.
 */
let lastResult: { userId: string; result: ContactsResult } | null = null;

export function cachedContacts(userId: string): ContactsResult | null {
  return lastResult && lastResult.userId === userId ? lastResult.result : null;
}

export function rememberContacts(userId: string, result: ContactsResult): void {
  lastResult = { userId, result };
}

/** The server's rate-limit guard (social_take_budget). */
export function isContactsLimitError(err: unknown): boolean {
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === 'string' && /done that a lot/i.test(message);
}

export type ContactsAccess = 'granted' | 'denied' | 'blocked';

/** An account found from the address book: just the account itself. */
export type ContactMatchResult = PersonSummary;

/** Someone in the address book who isn't on CERVICED. Stays on the phone. */
export interface InviteContact {
  key: string;
  name: string;
  /** As saved in the address book, for the text message. */
  number: string;
}

export interface ContactsResult {
  matches: ContactMatchResult[];
  invites: InviteContact[];
}

/** Where things stand without asking (reading the status never shows a prompt). */
export async function getContactsAccess(): Promise<ContactsAccess | 'undetermined'> {
  const Contacts = loadContacts();
  const res = await Contacts.getPermissionsAsync();
  if (res.granted) return 'granted';
  if (res.status === Contacts.PermissionStatus.UNDETERMINED) return 'undetermined';
  return res.canAskAgain ? 'denied' : 'blocked';
}

/** Shows the system prompt (with the app.json wording) if it can still be shown. */
export async function requestContactsAccess(): Promise<ContactsAccess> {
  const res = await loadContacts().requestPermissionsAsync();
  if (res.granted) return 'granted';
  return res.canAskAgain ? 'denied' : 'blocked';
}

export interface RawContact {
  id?: string | null | undefined;
  name?: string | null | undefined;
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
  const Crypto = loadCrypto();
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, normalised, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

/**
 * The address book minus anyone on CERVICED (any of their numbers matched):
 * named contacts with a usable number, A to Z, one row each.
 */
export function buildInviteList(
  contacts: readonly RawContact[],
  matchedNumbers: ReadonlySet<string>,
): InviteContact[] {
  const out: InviteContact[] = [];
  const seen = new Set<string>();
  for (const c of contacts) {
    const name = c.name?.trim();
    if (!name) continue;
    let first: { raw: string; normalised: string } | null = null;
    let matched = false;
    for (const p of c.phoneNumbers ?? []) {
      const normalised = normalisePhoneForMatching(p.number);
      if (!normalised || !p.number) continue;
      if (matchedNumbers.has(normalised)) { matched = true; break; }
      if (!first) first = { raw: p.number, normalised };
    }
    if (matched || !first) continue;
    const key = c.id ? `id:${c.id}` : `n:${name}|${first.normalised}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, name, number: first.raw });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' }));
}

export const INVITE_MESSAGE = "I'm on CERVICED for booking beauty and wellness. Come join me: https://www.cerviced.co";

/** Opens a text message to them with the invite filled in; falls back to the share sheet. */
export async function inviteContact(contact: InviteContact): Promise<void> {
  const to = contact.number.replace(/[^\d+]/g, '');
  const body = encodeURIComponent(INVITE_MESSAGE);
  const url = `sms:${to}${Platform.OS === 'ios' ? '&' : '?'}body=${body}`;
  try {
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
      return;
    }
  } catch (err) {
    logger.warn('[circle] could not open messages for an invite', err);
  }
  await Share.share({ message: INVITE_MESSAGE });
}

/**
 * Reads the address book: the accounts it matches, and everyone else to
 * invite. Call only once access is granted. Throws on failure (the screen shows it).
 */
export async function findContactsOnCerviced(): Promise<ContactsResult> {
  const Contacts = loadContacts();
  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
  });
  const numbers = collectContactNumbers(data);
  if (numbers.length === 0) return { matches: [], invites: buildInviteList(data, new Set()) };

  const hashes = await Promise.all(numbers.map(hashNormalisedNumber));
  const numberByHash = new Map(hashes.map((h, i) => [h, numbers[i] as string]));
  const found = await matchContactHashes(hashes);
  const matchedNumbers = new Set<string>();
  const seen = new Set<string>();
  const matches: ContactMatchResult[] = [];
  for (const m of found) {
    const n = numberByHash.get(m.phoneHash);
    if (n) matchedNumbers.add(n);
    if (seen.has(m.userId)) continue;
    seen.add(m.userId);
    matches.push({
      userId: m.userId,
      name: m.name,
      avatarUrl: m.avatarUrl,
      myStatus: m.myStatus,
      followsMe: m.followsMe,
    });
  }
  return { matches, invites: buildInviteList(data, matchedNumbers) };
}
