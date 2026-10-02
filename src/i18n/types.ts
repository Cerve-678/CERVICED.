import { en } from './catalogs/en';

/** The exact union of every declared UI translation key. Derived from the
 *  English catalog so a screen can only ask for a key that actually exists. */
export type TranslationKey = keyof typeof en;

/** Values interpolated into a `{param}` token at resolve time. */
export type TranslationParams = Record<string, string | number>;

/** A per-language catalog: a partial map, because any missing key falls back
 *  to English rather than being a required duplicate of the whole source. */
export type Catalog = Partial<Record<TranslationKey, string>>;

/** The English catalog is complete by construction (it is the source), so it
 *  is a total map rather than a partial one. */
export type BaseCatalog = Readonly<Record<TranslationKey, string>>;
