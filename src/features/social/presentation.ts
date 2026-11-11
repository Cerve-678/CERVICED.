// src/features/social/presentation.ts
//
// Pure helpers for the face stack on cards and the sheet it opens. Kept free
// of React so the rules (how many faces, recommenders first, what a row says)
// are tested once and every card shares them.

import type { CircleByProvider, CirclePerson } from './types';

/** Raw row from get_circle_for_providers. */
export interface CircleRow {
  provider_id: string;
  person_id: string;
  name: string | null;
  avatar_url: string | null;
  recommends: boolean | null;
  visits: number | null;
}

/** Most faces a card shows before "+N". Narrow cards show fewer. */
export const STACK_MAX_FACES = 4;
export const STACK_MAX_FACES_NARROW = 2;
/** Cards narrower than this (px) use the narrow count. */
export const STACK_NARROW_CARD_WIDTH = 140;

export function compareCirclePeople(a: CirclePerson, b: CirclePerson): number {
  if (a.recommends !== b.recommends) return a.recommends ? -1 : 1;
  if (a.visits !== b.visits) return b.visits - a.visits;
  return a.name.localeCompare(b.name);
}

export function groupCircleRows(rows: readonly CircleRow[]): CircleByProvider {
  const out: CircleByProvider = {};
  for (const row of rows) {
    const recommends = row.recommends === true;
    const visits = Math.max(0, row.visits ?? 0);
    if (!recommends && visits === 0) continue;
    const list = out[row.provider_id] ?? (out[row.provider_id] = []);
    if (list.some((p) => p.personId === row.person_id)) continue;
    list.push({
      personId: row.person_id,
      name: (row.name ?? '').trim() || 'Someone you follow',
      avatarUrl: row.avatar_url || null,
      recommends,
      visits,
    });
  }
  for (const list of Object.values(out)) list.sort(compareCirclePeople);
  return out;
}

export interface StackLayout {
  shown: CirclePerson[];
  /** How many more beyond the faces shown, for "+N". 0 means no "+N" chip. */
  more: number;
}

export function stackLayout(
  people: readonly CirclePerson[] | undefined,
  cardWidth?: number,
): StackLayout {
  if (!people || people.length === 0) return { shown: [], more: 0 };
  const max =
    cardWidth !== undefined && cardWidth < STACK_NARROW_CARD_WIDTH
      ? STACK_MAX_FACES_NARROW
      : STACK_MAX_FACES;
  const shown = people.slice(0, max);
  return { shown, more: people.length - shown.length };
}

/** "Amara Okafor" → "Amara". */
export function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first || name.trim();
}

/** "Amara Okafor" → "AO"; one word → its first letter. */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + last).toUpperCase();
}

/**
 * What the tap sheet says about one person. Never names a service — only
 * that they recommend, or how many times they've been.
 */
export function circleLine(person: CirclePerson): string {
  if (person.isMe) return 'You recommend them';
  if (person.recommends) return 'Recommends';
  if (person.visits === 1) return 'Has been';
  return `Has been · ${person.visits} times`;
}

/** Accessibility label for the whole stack. */
export function stackAccessibilityLabel(allPeople: readonly CirclePerson[]): string {
  const me = allPeople.some((p) => p.isMe) ? 'You recommend them.' : '';
  const people = allPeople.filter((p) => !p.isMe);
  if (people.length === 0) return me;
  const recommenders = people.filter((p) => p.recommends).length;
  const names = people.slice(0, 2).map((p) => firstName(p.name));
  const others = people.length - names.length;
  const who =
    others > 0
      ? `${names.join(', ')} and ${others} other${others === 1 ? '' : 's'}`
      : names.join(' and ');
  const tail =
    recommenders > 0
      ? `${recommenders} recommend${recommenders === 1 ? 's' : ''}`
      : 'have been here';
  return `${me ? `${me} ` : ''}People you follow: ${who}. ${tail}.`;
}
