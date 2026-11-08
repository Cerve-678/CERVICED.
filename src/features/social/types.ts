// src/features/social/types.ts
//
// Shapes for following people, Recommend and "Show where I go". The server
// (migration 20261108180000_follow_people_and_recommend.sql) owns every rule:
// who is private, who shows on a card, under-18 defaults, blocks. These types
// only describe what its functions return.

export type FollowStatus = 'pending' | 'accepted';

export interface SocialSettings {
  isMinor: boolean;
  /** Follows need approval. Always true for under-18s. */
  isPrivate: boolean;
  /** The one master switch: off means you show on no cards, recommends included. */
  showWhereIGo: boolean;
  /** People who have your number can find you. Always false for under-18s. */
  findableByPhone: boolean;
  /** The one-time "people you approve can see where you go" notice. */
  whereIGoNoticeSeen: boolean;
  followers: number;
  following: number;
  requests: number;
}

export interface SocialSettingsUpdate {
  isPrivate?: boolean;
  showWhereIGo?: boolean;
  findableByPhone?: boolean;
}

export interface PersonSummary {
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** My follow of them, if any. */
  myStatus: FollowStatus | null;
  /** Their follow of me, if any. */
  followsMe: FollowStatus | null;
}

export interface ContactMatch extends PersonSummary {
  /** Which of the hashes sent in this person matched, so the app can show the contact's own name. */
  phoneHash: string;
}

export type PeopleListKind = 'followers' | 'following' | 'requests';

export interface PersonListEntry {
  userId: string;
  name: string;
  avatarUrl: string | null;
  status: FollowStatus;
  since: string;
}

export interface ProviderSharing {
  /** Has a completed booking with this provider. */
  canRecommend: boolean;
  recommended: boolean;
  /** "Don't show this one": keeps my face off this provider's cards. */
  hidden: boolean;
}

/** One person on one provider's card. */
export interface CirclePerson {
  personId: string;
  name: string;
  avatarUrl: string | null;
  recommends: boolean;
  visits: number;
}

/** providerId → people, recommenders first. */
export type CircleByProvider = Record<string, CirclePerson[]>;
