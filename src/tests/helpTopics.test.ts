import {
  ALL_HELP_AUDIENCES,
  helpAudienceFor,
  helpSectionsFor,
  type HelpAudience,
} from '../features/help/helpTopics';
import { en } from '../i18n/catalogs/en';
import { DO_NOT_TRANSLATE } from '../i18n/translate';

const keysFor = (audience: HelpAudience): string[] =>
  helpSectionsFor(audience).flatMap(s => [s.title, ...s.items.flatMap(i => [i.q, i.a])]);

describe('helpAudienceFor', () => {
  it('gives a client the client questions', () => {
    expect(helpAudienceFor('client', null)).toBe('client');
    expect(helpAudienceFor('client', 'external')).toBe('client');
  });

  it('gives a pro who takes bookings in the app the full provider set', () => {
    expect(helpAudienceFor('provider', 'cerviced')).toBe('provider');
  });

  it('gives a pro on their own booking link the link-only set', () => {
    expect(helpAudienceFor('provider', 'external')).toBe('providerLinkOnly');
  });

  it('shows the full provider set while the booking mode is still loading', () => {
    expect(helpAudienceFor('provider', null)).toBe('provider');
  });
});

describe('help topics', () => {
  it.each(ALL_HELP_AUDIENCES)('%s: every key exists in the English catalog', audience => {
    for (const key of keysFor(audience)) expect(en).toHaveProperty([key]);
  });

  it.each(ALL_HELP_AUDIENCES)('%s: no question appears twice', audience => {
    const qs = helpSectionsFor(audience).flatMap(s => s.items.map(i => i.q));
    expect(new Set(qs).size).toBe(qs.length);
  });

  it('never shows a client a provider question, or a pro a client question', () => {
    expect(keysFor('client').some(k => /providerFaq|linkFaq/.test(k))).toBe(false);
    for (const audience of ['provider', 'providerLinkOnly'] as const) {
      expect(keysFor(audience).some(k => k.startsWith('helpCentre.faq.'))).toBe(false);
    }
  });

  it('never shows a link-only pro questions about money taken in the app', () => {
    const linkKeys = keysFor('providerLinkOnly');
    for (const inAppOnly of ['payouts', 'deposits', 'lateFees', 'fee', 'tips', 'waitlist', 'autoConfirm', 'clientele']) {
      expect(linkKeys).not.toContain(`helpCentre.providerFaq.${inAppOnly}.q`);
    }
  });

  it('holds every money and privacy answer in English', () => {
    const held = [
      'helpCentre.faq.request.a',
      'helpCentre.faq.cancel.a',
      'helpCentre.faq.payment.a',
      'helpCentre.faq.tip.a',
      'helpCentre.faq.beautyProfile.a',
      'helpCentre.providerFaq.payouts.a',
      'helpCentre.providerFaq.deposits.a',
      'helpCentre.providerFaq.lateFees.a',
      'helpCentre.providerFaq.fee.a',
      'helpCentre.providerFaq.tips.a',
      'helpCentre.providerFaq.clientele.a',
    ] as const;
    for (const key of held) expect(DO_NOT_TRANSLATE.has(key)).toBe(true);
  });
});
