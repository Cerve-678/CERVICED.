import type { TranslationKey } from '../../i18n/types';
import { tr } from '../../i18n/translate';

/**
 * Canonical order and copy for the public-profile editor.
 *
 * Navigation, validation summaries and the visible pager all import this one
 * definition so adding, renaming or reordering a section cannot leave them out
 * of sync.
 */
export const INFO_REG_SECTIONS = [
  { key: 'identity', num: '01', get title() { return tr('providerSetup.section.identity.title'); }, short: 'Identity', get sub() { return tr('providerSetup.section.identity.sub'); } },
  { key: 'about', num: '02', get title() { return tr('providerSetup.section.about.title'); }, short: 'About', get sub() { return tr('providerSetup.section.about.sub'); } },
  { key: 'contact', num: '03', get title() { return tr('providerSetup.section.contact.title'); }, short: 'Contact', get sub() { return tr('providerSetup.section.contact.sub'); } },
  { key: 'services', num: '04', get title() { return tr('providerSetup.section.services.title'); }, short: 'Services', get sub() { return tr('providerSetup.section.services.sub'); } },
  { key: 'policies', num: '05', get title() { return tr('providerSetup.section.policies.title'); }, short: 'Address', get sub() { return tr('providerSetup.section.policies.sub'); } },
] as const;

/** A link-only provider (booking_mode 'external') takes bookings on their own
 *  page, so Services and Address Confirmation don't apply. The first three
 *  keep their positions, so indices into either list agree. */
export const LINK_ONLY_INFO_REG_SECTIONS = INFO_REG_SECTIONS.slice(0, 3);

export type InfoRegSection = (typeof INFO_REG_SECTIONS)[number];
export type InfoRegSectionKey = InfoRegSection['key'];

export function infoRegSectionIndex(key: InfoRegSectionKey): number {
  return INFO_REG_SECTIONS.findIndex(section => section.key === key);
}

/** Display copy for each section, in the app language (the English above is
 *  the source and what the tests read). */
export const INFO_REG_SECTION_TEXT: Readonly<Record<InfoRegSectionKey, { title: TranslationKey; short: TranslationKey }>> = {
  identity: { title: 'providerSetup.section.identity.title', short: 'providerSetup.section.identity.short' },
  about: { title: 'providerSetup.section.about.title', short: 'providerSetup.section.about.short' },
  contact: { title: 'providerSetup.section.contact.title', short: 'providerSetup.section.contact.short' },
  services: { title: 'providerSetup.section.services.title', short: 'providerSetup.section.services.short' },
  policies: { title: 'providerSetup.section.policies.title', short: 'providerSetup.section.policies.short' },
};
