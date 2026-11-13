// src/data/whatsNew.ts
// The "What's new" notes shown after someone updates to a new build.
//
// ADD ONE ENTRY PER BUILD, AT THE TOP, before running `eas build`. The
// `/whats-new` skill drafts it from the PRs merged since the last entry's
// `coversThrough` commit; read it over before it ships, since it is the only
// release copy users see.
//
// Rules for an entry:
//   - `version` is one higher than the entry below it. Never reuse or lower
//     one: it is stored per account (users.seen_tours) and only moves forward.
//   - `date` is the day the build goes out (YYYY-MM-DD). Accounts created on
//     or after it never see this entry.
//   - `coversThrough` is the main commit the notes were drafted up to, so the
//     next draft starts after it.
//   - Write for the person using the app, not for us: what they can now do or
//     what works better, in plain words. No PR numbers, table names, "fixed a
//     bug where…" detail, or anything about fees, refunds, terms or privacy
//     that hasn't been signed off as user-facing wording.
//   - `client` and `provider` are separate lists. Leave one empty if the build
//     changed nothing for that side; that side then sees nothing.
//   - Mark a provider item `fullMembersOnly: true` when link-only providers
//     can't use it (it's hidden from their tabs), so they aren't told about it.
//   - Keep it short: about 2–5 items per side.
//
// These notes are English only. The sheet's own labels are translated; the
// notes are written fresh every build and aren't run through the catalogs.

import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

export type WhatsNewHat = 'client' | 'provider';

export interface WhatsNewItem {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
  /** Provider items only: hide from link-only providers. */
  fullMembersOnly?: boolean;
}

export interface WhatsNewRelease {
  version: number;
  /** YYYY-MM-DD, the day the build went out. */
  date: string;
  /** Short SHA of the main commit these notes cover up to. */
  coversThrough: string;
  client: WhatsNewItem[];
  provider: WhatsNewItem[];
}

/** Newest first. */
export const WHATS_NEW_RELEASES: readonly WhatsNewRelease[] = [
  {
    version: 1,
    date: '2026-11-13',
    coversThrough: 'c35a223c',
    client: [],
    provider: [
      {
        icon: 'calendar-outline',
        title: 'Calendar Sync',
        body:
          "Take bookings somewhere else too? Connect your phone calendar in Scheduling & Availability, and clients can't book a time you're already busy.",
        fullMembersOnly: true,
      },
    ],
  },
];
