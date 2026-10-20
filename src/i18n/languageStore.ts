// Module-level copy of the active language, for code that can't read a React
// context: dateUtils and helpers called outside render. DisplaySettingsContext
// is the only writer and owns persistence; this mirrors regionStore.ts.
// Dependency-free so anything can import it without a cycle.

let currentLanguage = 'en';

export function getLanguage(): string {
  return currentLanguage;
}

// No listeners: readers look it up at call time. Components re-render on a
// language change because they use useTranslation(), which reads the context.
export function setLanguage(language: string): void {
  currentLanguage = language;
}

/** BCP 47 locale for `toLocaleDateString` / `Intl` calls in the given language. */
export function localeForLanguage(language: string = currentLanguage): string {
  switch (language) {
    case 'es':
      return 'es-ES';
    case 'fr':
      return 'fr-FR';
    case 'pl':
      return 'pl-PL';
    case 'de':
      return 'de-DE';
    default:
      return 'en-GB';
  }
}
