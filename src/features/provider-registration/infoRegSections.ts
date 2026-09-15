/**
 * Canonical order and copy for the public-profile editor.
 *
 * Navigation, validation summaries and the visible pager all import this one
 * definition so adding, renaming or reordering a section cannot leave them out
 * of sync.
 */
export const INFO_REG_SECTIONS = [
  { key: 'identity', num: '01', title: 'Identity', short: 'Identity', sub: 'Business identity · how clients first find you' },
  { key: 'about', num: '02', title: 'About & Portfolio', short: 'About', sub: 'Your introduction and the work clients see' },
  { key: 'contact', num: '03', title: 'Contact', short: 'Contact', sub: 'Public details — anyone browsing can use these' },
  { key: 'services', num: '04', title: 'Services', short: 'Services', sub: 'What you offer, and what it costs' },
  { key: 'policies', num: '05', title: 'Address Confirmation', short: 'Address', sub: 'Business setup, address release' },
] as const;

export type InfoRegSection = (typeof INFO_REG_SECTIONS)[number];
export type InfoRegSectionKey = InfoRegSection['key'];

export function infoRegSectionIndex(key: InfoRegSectionKey): number {
  return INFO_REG_SECTIONS.findIndex(section => section.key === key);
}
