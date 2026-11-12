// src/constants/serviceTypes.ts
//
// The "Service Type" a provider picks for each service in the service editor:
// what kind of appointment it is (a full set, an infill, a patch test, a
// trial...). One list of values, and which of them each kind of service is
// offered, so a lash service gets lash choices and a makeup service gets
// makeup choices.
//
// THIS LIST IS MIRRORED IN SQL. `services.service_type` is limited by the
// services_service_type_check constraint, restated in full by the newest
// migration that sets it (currently
// 20261110190000_more_service_types.sql). src/tests/serviceTypes.test.ts
// parses that migration and fails if the two lists ever disagree. Change both
// in the same commit.
//
// 'consultation' is load-bearing: the booking flow and the provider profile
// treat a consultation service specially (databaseService's consultation
// lookups, ProviderProfileScreen's consultation note). Don't rename it.
import type { CategoryKind } from '../features/providers/serviceTags';

export const SERVICE_TYPE_KEYS = [
  'treatment',
  'enhancement',
  'maintenance',
  'restorative',
  'consultation',
  'full_set',
  'infill',
  'removal',
  'repair',
  'express',
  'touch_up',
  'top_up',
  'patch_test',
  'install',
  'trial',
  'occasion',
  'lesson',
  'review',
  'course',
] as const;

export type ServiceTypeKey = (typeof SERVICE_TYPE_KEYS)[number];

export const SERVICE_TYPE_LABELS: Record<ServiceTypeKey, string> = {
  treatment: 'Treatment',
  enhancement: 'Enhancement',
  maintenance: 'Maintenance',
  restorative: 'Restorative',
  consultation: 'Consultation',
  full_set: 'Full set',
  infill: 'Infill / Refill',
  removal: 'Removal',
  repair: 'Repair',
  express: 'Express',
  touch_up: 'Touch-up',
  top_up: 'Top-up',
  patch_test: 'Patch test',
  install: 'Install / Fitting',
  trial: 'Trial',
  occasion: 'Event / Occasion',
  lesson: 'Lesson',
  review: 'Review appointment',
  course: 'Course / Package',
};

/** The choices each kind of service is offered, most common first. */
export const SERVICE_TYPES_BY_KIND: Record<CategoryKind, readonly ServiceTypeKey[]> = {
  LASHES: ['full_set', 'infill', 'removal', 'repair', 'patch_test', 'enhancement', 'maintenance', 'treatment', 'consultation'],
  NAILS: ['full_set', 'infill', 'removal', 'repair', 'express', 'enhancement', 'maintenance', 'treatment', 'consultation'],
  HAIR: ['treatment', 'install', 'removal', 'touch_up', 'maintenance', 'restorative', 'express', 'patch_test', 'consultation'],
  BROWS: ['treatment', 'touch_up', 'enhancement', 'maintenance', 'removal', 'patch_test', 'consultation'],
  MUA: ['occasion', 'trial', 'lesson', 'touch_up', 'express', 'consultation'],
  AESTHETICS: ['treatment', 'top_up', 'course', 'review', 'patch_test', 'restorative', 'maintenance', 'consultation'],
  OTHER: ['treatment', 'express', 'course', 'enhancement', 'maintenance', 'restorative', 'consultation'],
};

/**
 * The chips to show for one service. A type saved earlier that this kind
 * doesn't offer (the category's kind changed, or it came from an import) is
 * kept at the end, so opening the editor never quietly drops it.
 */
export function serviceTypeOptionsFor(
  kind: CategoryKind,
  current: ServiceTypeKey | '' | null | undefined,
): { value: ServiceTypeKey; label: string }[] {
  const keys: ServiceTypeKey[] = [...SERVICE_TYPES_BY_KIND[kind]];
  if (current && !keys.includes(current)) keys.push(current);
  return keys.map(value => ({ value, label: SERVICE_TYPE_LABELS[value] }));
}

export function isServiceTypeKey(value: unknown): value is ServiceTypeKey {
  return typeof value === 'string' && (SERVICE_TYPE_KEYS as readonly string[]).includes(value);
}
