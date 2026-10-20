import type { en } from './catalogs/en';

/** The exact union of every declared UI translation key. Derived from the
 *  English catalog so a screen can only ask for a key that actually exists. */
export type TranslationKey = keyof typeof en;

/** Values interpolated into a `{param}` token at resolve time. */
export type TranslationParams = Record<string, string | number>;

/** CLDR plural categories the supported languages use. English, Spanish and
 *  German only need `one`/`other`; French puts 0 in `one`; Polish adds `few`
 *  (2–4, 22–24…) and `many` (5–21, 25…). See ./plural.ts. */
export type PluralCategory = 'one' | 'few' | 'many' | 'other';

/** The base of a plural key: English declares `x.one` + `x.other`, and
 *  `x` is what `tp('x', count)` takes. */
type PluralBaseOf<K> = K extends `${infer B}.other` ? B : never;
export type PluralKey = PluralBaseOf<TranslationKey>;

/** Extra plural forms only some languages need (Polish `few`/`many`). They
 *  may appear in a language catalog for any plural key even though English
 *  never declares them. */
type PluralVariantsOf<K> = `${PluralBaseOf<K>}.few` | `${PluralBaseOf<K>}.many`;

/** One language's slice of a single area, typed against the English area so
 *  an unknown or misspelt key is a compile error. Partial: a missing key falls
 *  back to English at runtime (and fails the coverage test). */
export type AreaCatalog<EnArea> = {
  readonly [K in (keyof EnArea & string) | PluralVariantsOf<keyof EnArea & string>]?: string;
};

/** A whole language catalog: every area spread together. */
export type Catalog = Partial<Record<TranslationKey | PluralVariantsOf<TranslationKey>, string>>;

/** The English catalog is complete by construction (it is the source), so it
 *  is a total map rather than a partial one. */
export type BaseCatalog = Readonly<Record<TranslationKey, string>>;
