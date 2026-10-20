import { pluralCategory } from '../i18n/plural';
import { translatePlural } from '../i18n/translate';
import { setLanguage } from '../i18n/languageStore';
import {
  dayName,
  formatDurationMinutes,
  formatLongDate,
  formatLongDateNoYear,
  formatSectionTitle,
  formatShortDayDate,
  monthName,
  ordinalDay,
  relativeDayLabel,
} from '../utils/dateUtils';

describe('pluralCategory', () => {
  it('uses one/other for English, Spanish and German', () => {
    for (const lang of ['en', 'es', 'de']) {
      expect(pluralCategory(lang, 1)).toBe('one');
      expect(pluralCategory(lang, 0)).toBe('other');
      expect(pluralCategory(lang, 2)).toBe('other');
    }
  });

  it('puts 0 and 1 in the French singular', () => {
    expect(pluralCategory('fr', 0)).toBe('one');
    expect(pluralCategory('fr', 1)).toBe('one');
    expect(pluralCategory('fr', 2)).toBe('other');
  });

  it('splits Polish into one/few/many', () => {
    expect(pluralCategory('pl', 1)).toBe('one');
    expect([2, 3, 4, 22, 24, 103].map((n) => pluralCategory('pl', n))).toEqual(Array(6).fill('few'));
    expect([0, 5, 11, 12, 14, 21, 25, 112].map((n) => pluralCategory('pl', n))).toEqual(Array(8).fill('many'));
    expect(pluralCategory('pl', 1.5)).toBe('other');
  });
});

describe('translatePlural', () => {
  it('picks the English form by count and fills {count}', () => {
    expect(translatePlural('en', 'maintenance.weeks', 1)).toBe('1 week');
    expect(translatePlural('en', 'maintenance.weeks', 3)).toBe('3 weeks');
  });

  it('falls back to English for an unknown language', () => {
    expect(translatePlural('zz', 'maintenance.weeks', 3)).toBe('3 weeks');
  });
});

describe('dateUtils in each language', () => {
  // Wednesday 8 June 2022 (month index 5).
  const date = new Date(2022, 5, 8);
  afterEach(() => setLanguage('en'));

  it('keeps the English formats unchanged', () => {
    setLanguage('en');
    expect(formatLongDate(date)).toBe('Wednesday 8th June 2022');
    expect(formatLongDateNoYear(date)).toBe('Wednesday 8th June');
    expect(formatShortDayDate(date)).toBe('Wed 8 Jun');
    expect(formatSectionTitle(date)).toBe('Wednesday 8th');
    expect(formatDurationMinutes(90)).toBe('1h 30m');
    expect(relativeDayLabel(new Date())).toBe('Today');
  });

  it('writes Spanish dates', () => {
    setLanguage('es');
    expect(formatLongDate(date)).toBe('Miércoles, 8 de junio de 2022');
    expect(formatShortDayDate(date)).toBe('Mié 8 Jun');
    expect(relativeDayLabel(new Date())).toBe('Hoy');
  });

  it('writes French dates', () => {
    setLanguage('fr');
    expect(formatLongDateNoYear(date)).toBe('Mercredi 8 juin');
    expect(ordinalDay(1)).toBe('1er');
  });

  it('writes German dates', () => {
    setLanguage('de');
    expect(formatLongDate(date)).toBe('Mittwoch, 8. Juni 2022');
    expect(formatSectionTitle(date)).toBe('Mittwoch, 8.');
    expect(formatDurationMinutes(90)).toBe('1 Std. 30 Min.');
  });

  it('uses the Polish genitive month after a day number', () => {
    setLanguage('pl');
    expect(formatLongDate(date)).toBe('Środa, 8 czerwca 2022');
    expect(monthName(5)).toBe('Czerwiec');
  });

  it('gives standalone day and month names', () => {
    expect(dayName(3, 'full', 'en')).toBe('Wednesday');
    expect(dayName(3, 'short', 'fr')).toBe('Mer.');
    expect(monthName(5, 'short', 'de')).toBe('Juni');
  });
});
