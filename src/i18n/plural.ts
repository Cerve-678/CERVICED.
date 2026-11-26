import type { PluralCategory } from './types';

// Plural category for a count, per language. Hand-written rather than
// Intl.PluralRules because Hermes' Intl coverage varies by platform and these
// five languages' integer rules are short. Unknown languages use English rules.
export function pluralCategory(lang: string, count: number): PluralCategory {
  const n = Math.abs(count);
  const isInteger = Number.isInteger(n);
  switch (lang) {
    case 'fr':
      // French: 0 and 1 are singular ("0 point", "1 point", "2 points").
      return n < 2 ? 'one' : 'other';
    case 'pl': {
      if (!isInteger) return 'other';
      if (n === 1) return 'one';
      const mod10 = n % 10;
      const mod100 = n % 100;
      if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'few';
      return 'many';
    }
    default:
      return n === 1 ? 'one' : 'other';
  }
}
