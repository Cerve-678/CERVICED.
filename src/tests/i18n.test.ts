import {
  translate,
  resolveTranslation,
  interpolate,
  isTranslationKey,
  DO_NOT_TRANSLATE,
} from '../i18n/translate';
import { en } from '../i18n/catalogs/en';
import type { Catalog } from '../i18n/types';

describe('interpolate', () => {
  it('replaces a named token from params', () => {
    expect(interpolate('Dates {date}', { date: '14/10/2026' })).toBe('Dates 14/10/2026');
  });

  it('coerces numeric params to strings', () => {
    expect(interpolate('{n} points', { n: 3 })).toBe('3 points');
  });

  it('leaves an unknown token intact rather than blanking it', () => {
    expect(interpolate('Hello {name}', {})).toBe('Hello {name}');
  });

  it('returns the template unchanged when no params are given', () => {
    expect(interpolate('Just text')).toBe('Just text');
  });
});

describe('resolveTranslation (pure resolver, injected dependencies)', () => {
  // A fabricated language catalog that DOES contain a translation for a
  // do-not-translate key, so the test can prove the guard overrides it.
  const catalogs: Record<string, Catalog> = {
    es: {
      'helpCentre.title': 'Centro de ayuda (test)',
      'helpCentre.faq.payment.a': 'TRADUCCIÓN FALSA DE TEXTO LEGAL',
    },
  };

  it('returns the language translation for an ordinary key', () => {
    expect(resolveTranslation(catalogs, DO_NOT_TRANSLATE, en, 'es', 'helpCentre.title')).toBe(
      'Centro de ayuda (test)',
    );
  });

  it('falls back to English when the language lacks the key', () => {
    expect(resolveTranslation(catalogs, DO_NOT_TRANSLATE, en, 'es', 'profile.logout')).toBe(
      en['profile.logout'],
    );
  });

  it('falls back to English for an unknown locale', () => {
    expect(resolveTranslation(catalogs, DO_NOT_TRANSLATE, en, 'zz', 'helpCentre.title')).toBe(
      en['helpCentre.title'],
    );
  });

  it('returns English for the English locale without consulting catalogs', () => {
    expect(resolveTranslation(catalogs, DO_NOT_TRANSLATE, en, 'en', 'helpCentre.title')).toBe(
      en['helpCentre.title'],
    );
  });

  it('HOLDS a do-not-translate key in English even when a translation exists', () => {
    // The catalog above provides a (fake) Spanish string for this key; the
    // guard must still return the English source.
    expect(resolveTranslation(catalogs, DO_NOT_TRANSLATE, en, 'es', 'helpCentre.faq.payment.a')).toBe(
      en['helpCentre.faq.payment.a'],
    );
  });

  it('interpolates params into a resolved translation', () => {
    const withParam: Record<string, Catalog> = { es: { 'languageRegion.regionRowDates': 'Fechas {date}' } };
    expect(
      resolveTranslation(withParam, DO_NOT_TRANSLATE, en, 'es', 'languageRegion.regionRowDates', {
        date: '14/10',
      }),
    ).toBe('Fechas 14/10');
  });
});

describe('translate (wired to the real catalogs)', () => {
  it('translates a real Spanish key', () => {
    expect(translate('es', 'helpCentre.title')).toBe('Centro de ayuda');
  });

  it('translates a real French key', () => {
    expect(translate('fr', 'textSizing.title')).toBe('Texte et taille');
  });

  it('interpolates a real key with a param', () => {
    expect(translate('es', 'languageRegion.regionRowDates', { date: '14/10' })).toBe('Fechas 14/10');
  });

  it('returns English for the English locale', () => {
    expect(translate('en', 'profile.logout')).toBe(en['profile.logout']);
  });

  it('holds real legal/payment copy in English under a non-English locale', () => {
    // These are the actual keys the Help Centre renders — they must stay
    // English in every language until a professional review exists.
    expect(DO_NOT_TRANSLATE.has('helpCentre.faq.payment.a')).toBe(true);
    expect(DO_NOT_TRANSLATE.has('helpCentre.faq.cancel.a')).toBe(true);
    expect(translate('es', 'helpCentre.faq.payment.a')).toBe(en['helpCentre.faq.payment.a']);
    expect(translate('fr', 'helpCentre.faq.cancel.a')).toBe(en['helpCentre.faq.cancel.a']);
    expect(translate('es', 'profile.appInfo.terms.title')).toBe(en['profile.appInfo.terms.title']);
  });
});

describe('isTranslationKey', () => {
  it('accepts a real key and rejects an unknown one', () => {
    expect(isTranslationKey('helpCentre.title')).toBe(true);
    expect(isTranslationKey('nope.not.a.key')).toBe(false);
  });
});
