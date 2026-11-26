// src/features/social/people.ts
//
// Pure helpers for the Your circle screen: what the one button on a person's
// row says, and how a list updates after an action without refetching. Kept
// free of React so the rules are tested once.

import type { FollowStatus, PersonListEntry, PersonSummary } from './types';

/** The single action a search result offers, from my follow of them and theirs of me. */
export type PersonAction = 'follow' | 'followBack' | 'requested' | 'following';

export function personAction(person: Pick<PersonSummary, 'myStatus' | 'followsMe'>): PersonAction {
  if (person.myStatus === 'accepted') return 'following';
  if (person.myStatus === 'pending') return 'requested';
  return person.followsMe === 'accepted' ? 'followBack' : 'follow';
}

export const PERSON_ACTION_LABEL: Record<PersonAction, string> = {
  follow: 'Follow',
  followBack: 'Follow back',
  requested: 'Requested',
  following: 'Following',
};

/** A search result after I follow them: pending on a private account, accepted on an open one. */
export function withMyStatus<T extends Pick<PersonSummary, 'userId' | 'myStatus'>>(
  people: readonly T[],
  userId: string,
  status: FollowStatus | null,
): T[] {
  return people.map((p) => (p.userId === userId ? { ...p, myStatus: status } : p));
}

export function withoutPerson<T extends { userId: string }>(people: readonly T[], userId: string): T[] {
  return people.filter((p) => p.userId !== userId);
}

/** Puts someone at the top of a list (newest first, like the server's order), once. */
export function withPersonFirst(
  people: readonly PersonListEntry[],
  person: PersonListEntry,
): PersonListEntry[] {
  return [person, ...people.filter((p) => p.userId !== person.userId)];
}
