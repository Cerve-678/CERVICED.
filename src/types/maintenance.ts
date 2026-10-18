// src/types/maintenance.ts
//
// Shared shape of the client's Beauty Maintenance data, mirroring the two
// owner-only tables in supabase/migrations/20261010120000_beauty_maintenance.sql.
// Lives here, not in a screen, so the service mappers, the pure rules in
// src/utils/ and the UI can't drift apart.
//
// Maintenance is deliberately NOT part of BeautyData: its setup answers do not
// count toward Beauty Profile completeness (src/utils/beautyProfileStats.ts is
// unchanged), and none of it is readable by providers.

import type { MaintenanceTypeKey } from '../constants/maintenanceServiceTypes';

/** What an item reminds about. Mirrors the CHECK on maintenance_items.kind. */
export type MaintenanceItemKind =
  /** A bookable service, due again after an interval (or once, on a date). */
  | 'service'
  /** A protective style coming out. */
  | 'takedown'
  /** A date the client is preparing for; due_on is the "book by" date. */
  | 'event';

/** Who made the item. 'booking' rows are written only by the server, when a
 *  booking completes; the client cannot insert one (column grants + RLS). */
export type MaintenanceItemOrigin = 'booking' | 'client';

export interface MaintenanceItem {
  id: string;
  kind: MaintenanceItemKind;
  origin: MaintenanceItemOrigin;
  title: string;
  typeKey: MaintenanceTypeKey | null;
  providerId: string | null;
  serviceId: string | null;
  /** Provider's display name for showing on the card. Never a users.name. */
  providerName: string | null;
  /** Null means a one-off reminder on `dueOn`. */
  repeatWeeks: number | null;
  /** True once the client changed the interval: a later booking keeps it. */
  intervalEdited: boolean;
  lastDoneOn: string | null;
  /** "YYYY-MM-DD". For an event this is the book-by date. */
  dueOn: string | null;
  /** "YYYY-MM-DD", events only. The row is removed the day after. */
  eventOn: string | null;
  paused: boolean;
  createdAt: string;
}

export type ProtectiveStyle = 'braids' | 'twists' | 'locs' | 'wigs_weaves';

/** The optional setup answers. Stored once per client in
 *  maintenance_settings, separate from the Beauty Profile. */
export interface MaintenanceSettings {
  protectiveStyle: ProtectiveStyle | null;
  /** How long the client usually keeps the style in, in weeks. */
  protectiveWearWeeks: number | null;
  /** The client's own recorded date. Never a verdict, never shown to a provider. */
  lastPatchTestOn: string | null;
  setupCompletedAt: string | null;
}

export const EMPTY_MAINTENANCE_SETTINGS: MaintenanceSettings = {
  protectiveStyle: null,
  protectiveWearWeeks: null,
  lastPatchTestOn: null,
  setupCompletedAt: null,
};

/** One upcoming event typed into setup. */
export interface MaintenanceEventAnswer {
  name: string;
  /** "YYYY-MM-DD" */
  date: string;
}

/** Everything the setup flow asks, before anything is saved. */
export interface MaintenanceSetupAnswers {
  protectiveStyle: ProtectiveStyle | null;
  protectiveWearWeeks: number;
  /** Weeks since the current style went in; null when not wearing one now. */
  protectiveWeeksIn: number | null;
  events: MaintenanceEventAnswer[];
  lastPatchTestOn: string | null;
}

/** A new item the client is about to add, client-origin only. */
export interface NewMaintenanceItem {
  kind: MaintenanceItemKind;
  title: string;
  typeKey: MaintenanceTypeKey | null;
  providerId: string | null;
  serviceId: string | null;
  providerName: string | null;
  repeatWeeks: number | null;
  dueOn: string;
  eventOn: string | null;
}

/** A provider the client has booked before, for linking a reminder. */
export interface MaintenancePastProvider {
  providerId: string;
  name: string;
}

/** A provider-written note shown in "Around your bookings". Quoted in full,
 *  credited, never paraphrased, and never invented when absent. */
export interface MaintenanceBookingNote {
  bookingId: string;
  providerId: string;
  providerName: string;
  serviceName: string;
  bookingDate: string;
  bookingTime: string;
  /** Prep: one entry per info pack. Aftercare: the service's current note. */
  notes: { title: string | null; text: string; sentAt: string | null }[];
}

/** Server context the Maintenance screen needs beyond its own tables. */
export interface MaintenanceBookingContext {
  /** Upcoming bookings in the next two days that carry provider prep notes. */
  prep: MaintenanceBookingNote[];
  /** Recently completed bookings whose service has aftercare notes. */
  aftercare: MaintenanceBookingNote[];
  /** service_ids the client already has an upcoming booking for. */
  upcomingServiceIds: string[];
  /** provider_ids the client already has an upcoming booking with. */
  upcomingProviderIds: string[];
  pastProviders: MaintenancePastProvider[];
}

/** Where tapping Rebook can actually go: a live provider and an active
 *  service, or nowhere (then the UI offers "Find a provider"). */
export interface RebookTarget {
  providerSlug: string;
  /** Null when the provider is live but the specific service isn't. */
  serviceId: string | null;
}
