import type { TranslationKey } from '../../i18n';

// What Help Centre shows, per hat. Help Centre is registered in both hats'
// navigators, and each hat (and each kind of pro) gets only the questions that
// are true for them: a client never sees how payouts work, and a pro who takes
// bookings through their own link never sees deposits or the waitlist, which
// only exist for bookings made in the app.
//
// The copy lives in the i18n catalog. Money, refund and privacy answers are
// HELD IN ENGLISH by DO_NOT_TRANSLATE in src/i18n/translate.ts; the test in
// src/tests/helpTopics.test.ts checks that every such answer is listed there.

export interface HelpQuestion { q: TranslationKey; a: TranslationKey }
export interface HelpSection { title: TranslationKey; items: ReadonlyArray<HelpQuestion> }

export type HelpAudience = 'client' | 'provider' | 'providerLinkOnly';

const CLIENT: ReadonlyArray<HelpSection> = [
  {
    title: 'helpCentre.section.booking',
    items: [
      { q: 'helpCentre.faq.book.q', a: 'helpCentre.faq.book.a' },
      { q: 'helpCentre.faq.request.q', a: 'helpCentre.faq.request.a' },
      { q: 'helpCentre.faq.cancel.q', a: 'helpCentre.faq.cancel.a' },
      { q: 'helpCentre.faq.waitlist.q', a: 'helpCentre.faq.waitlist.a' },
      { q: 'helpCentre.faq.address.q', a: 'helpCentre.faq.address.a' },
      { q: 'helpCentre.faq.payment.q', a: 'helpCentre.faq.payment.a' },
    ],
  },
  {
    title: 'helpCentre.section.yourProviders',
    items: [
      { q: 'helpCentre.faq.messages.q', a: 'helpCentre.faq.messages.a' },
      { q: 'helpCentre.faq.bell.q', a: 'helpCentre.faq.bell.a' },
      { q: 'helpCentre.faq.reviews.q', a: 'helpCentre.faq.reviews.a' },
      { q: 'helpCentre.faq.tip.q', a: 'helpCentre.faq.tip.a' },
      { q: 'helpCentre.faq.notOnCerviced.q', a: 'helpCentre.faq.notOnCerviced.a' },
    ],
  },
  {
    title: 'helpCentre.section.yourProfile',
    items: [
      { q: 'helpCentre.faq.beautyProfile.q', a: 'helpCentre.faq.beautyProfile.a' },
      { q: 'helpCentre.faq.maintenance.q', a: 'helpCentre.faq.maintenance.a' },
      { q: 'helpCentre.faq.points.q', a: 'helpCentre.faq.points.a' },
      { q: 'helpCentre.faq.becca.q', a: 'helpCentre.faq.becca.a' },
    ],
  },
];

// A pro whose clients book and pay in the app.
const PROVIDER: ReadonlyArray<HelpSection> = [
  {
    title: 'helpCentre.section.gettingStarted',
    items: [
      { q: 'helpCentre.providerFaq.live.q', a: 'helpCentre.providerFaq.live.a' },
      { q: 'helpCentre.providerFaq.share.q', a: 'helpCentre.providerFaq.share.a' },
      { q: 'helpCentre.providerFaq.branding.q', a: 'helpCentre.providerFaq.branding.a' },
      { q: 'helpCentre.providerFaq.becca.q', a: 'helpCentre.providerFaq.becca.a' },
    ],
  },
  {
    title: 'helpCentre.section.bookings',
    items: [
      { q: 'helpCentre.providerFaq.book.q', a: 'helpCentre.providerFaq.book.a' },
      { q: 'helpCentre.providerFaq.autoConfirm.q', a: 'helpCentre.providerFaq.autoConfirm.a' },
      { q: 'helpCentre.providerFaq.hours.q', a: 'helpCentre.providerFaq.hours.a' },
      { q: 'helpCentre.providerFaq.timeOff.q', a: 'helpCentre.providerFaq.timeOff.a' },
      { q: 'helpCentre.providerFaq.calendar.q', a: 'helpCentre.providerFaq.calendar.a' },
      { q: 'helpCentre.providerFaq.waitlist.q', a: 'helpCentre.providerFaq.waitlist.a' },
    ],
  },
  {
    title: 'helpCentre.section.gettingPaid',
    items: [
      { q: 'helpCentre.providerFaq.payouts.q', a: 'helpCentre.providerFaq.payouts.a' },
      { q: 'helpCentre.providerFaq.deposits.q', a: 'helpCentre.providerFaq.deposits.a' },
      { q: 'helpCentre.providerFaq.lateFees.q', a: 'helpCentre.providerFaq.lateFees.a' },
      { q: 'helpCentre.providerFaq.fee.q', a: 'helpCentre.providerFaq.fee.a' },
      { q: 'helpCentre.providerFaq.tips.q', a: 'helpCentre.providerFaq.tips.a' },
    ],
  },
  {
    title: 'helpCentre.section.clients',
    items: [
      { q: 'helpCentre.providerFaq.messages.q', a: 'helpCentre.providerFaq.messages.a' },
      { q: 'helpCentre.providerFaq.clientele.q', a: 'helpCentre.providerFaq.clientele.a' },
      { q: 'helpCentre.providerFaq.saves.q', a: 'helpCentre.providerFaq.saves.a' },
    ],
  },
];

// A pro who takes bookings through their own link (booking_mode 'external').
const PROVIDER_LINK_ONLY: ReadonlyArray<HelpSection> = [
  {
    title: 'helpCentre.section.gettingStarted',
    items: [
      { q: 'helpCentre.providerFaq.live.q', a: 'helpCentre.linkFaq.live.a' },
      { q: 'helpCentre.providerFaq.book.q', a: 'helpCentre.linkFaq.book.a' },
      { q: 'helpCentre.linkFaq.hours.q', a: 'helpCentre.linkFaq.hours.a' },
      { q: 'helpCentre.linkFaq.full.q', a: 'helpCentre.linkFaq.full.a' },
    ],
  },
  {
    title: 'helpCentre.section.clients',
    items: [
      { q: 'helpCentre.providerFaq.messages.q', a: 'helpCentre.providerFaq.messages.a' },
      { q: 'helpCentre.providerFaq.saves.q', a: 'helpCentre.providerFaq.saves.a' },
      { q: 'helpCentre.providerFaq.becca.q', a: 'helpCentre.linkFaq.becca.a' },
    ],
  },
];

const BY_AUDIENCE: Readonly<Record<HelpAudience, ReadonlyArray<HelpSection>>> = {
  client: CLIENT,
  provider: PROVIDER,
  providerLinkOnly: PROVIDER_LINK_ONLY,
};

/** Which set of questions to show. A pro whose booking mode hasn't loaded yet
 *  gets the full set rather than an empty screen. */
export function helpAudienceFor(
  activeHat: string | null | undefined,
  bookingMode: string | null | undefined,
): HelpAudience {
  if (activeHat !== 'provider') return 'client';
  return bookingMode === 'external' ? 'providerLinkOnly' : 'provider';
}

export function helpSectionsFor(audience: HelpAudience): ReadonlyArray<HelpSection> {
  return BY_AUDIENCE[audience];
}

export const ALL_HELP_AUDIENCES: ReadonlyArray<HelpAudience> = ['client', 'provider', 'providerLinkOnly'];
