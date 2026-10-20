import { EN_AREAS, HELD_KEYS, type AreaName } from '../i18n/catalogs/en';
import { es_AREAS } from '../i18n/catalogs/es';
import { fr_AREAS } from '../i18n/catalogs/fr';
import { pl_AREAS } from '../i18n/catalogs/pl';
import { de_AREAS } from '../i18n/catalogs/de';

// Structural checks over every language catalog, one test per language × area
// so a gap reads as "pl · cart is missing 3 keys" rather than one giant diff.

type LooseArea = Readonly<Record<string, string | undefined>>;

const LANGUAGES: Readonly<Record<string, Readonly<Record<AreaName, LooseArea>>>> = {
  es: es_AREAS,
  fr: fr_AREAS,
  pl: pl_AREAS,
  de: de_AREAS,
};

const AREA_NAMES = Object.keys(EN_AREAS) as AreaName[];
const held = new Set<string>(HELD_KEYS);

const tokens = (text: string): string[] => (text.match(/\{\w+\}/g) ?? []).sort();

const pluralBase = (key: string): string | null => {
  const match = /^(.*)\.(one|few|many|other)$/.exec(key);
  return match?.[1] ?? null;
};

describe('English catalog', () => {
  it('declares every key in exactly one area', () => {
    const seen = new Map<string, AreaName>();
    const duplicates: string[] = [];
    for (const area of AREA_NAMES) {
      for (const key of Object.keys(EN_AREAS[area])) {
        const first = seen.get(key);
        if (first) duplicates.push(`${key} (${first} and ${area})`);
        else seen.set(key, area);
      }
    }
    expect(duplicates).toEqual([]);
  });

  it('has no empty strings', () => {
    const empty = AREA_NAMES.flatMap((area) =>
      Object.entries(EN_AREAS[area] as LooseArea)
        .filter(([, value]) => !value || !value.trim())
        .map(([key]) => key),
    );
    expect(empty).toEqual([]);
  });

  it('declares plurals as matching .one/.other pairs that both use {count}', () => {
    const problems: string[] = [];
    for (const area of AREA_NAMES) {
      const entries = EN_AREAS[area] as LooseArea;
      for (const [key, value] of Object.entries(entries)) {
        if (/\.(few|many)$/.test(key)) problems.push(`${key}: English never declares few/many`);
        if (key.endsWith('.one') && !(`${pluralBase(key)}.other` in entries)) problems.push(`${key}: no .other`);
        if (key.endsWith('.other') && !(`${pluralBase(key)}.one` in entries)) problems.push(`${key}: no .one`);
        if (/\.(one|other)$/.test(key) && !value?.includes('{count}')) problems.push(`${key}: no {count}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('only holds keys that exist', () => {
    const allKeys = new Set(AREA_NAMES.flatMap((area) => Object.keys(EN_AREAS[area])));
    expect(HELD_KEYS.filter((key) => !allKeys.has(key))).toEqual([]);
  });
});

describe.each(Object.keys(LANGUAGES))('%s catalog', (lang) => {
  it.each(AREA_NAMES)(`${lang} · %s is fully translated`, (area) => {
    const source = EN_AREAS[area] as LooseArea;
    const target: LooseArea = LANGUAGES[lang]?.[area] ?? {};
    const missing = Object.keys(source).filter((key) => !held.has(key) && !target[key]?.trim());
    expect(missing).toEqual([]);
  });

  it.each(AREA_NAMES)(`${lang} · %s keeps every {param} token`, (area) => {
    const source = EN_AREAS[area] as LooseArea;
    const target: LooseArea = LANGUAGES[lang]?.[area] ?? {};
    const mismatched = Object.entries(target)
      .filter(([key, value]) => {
        const base = pluralBase(key);
        const english = source[key] ?? (base ? source[`${base}.other`] : undefined);
        return english !== undefined && value !== undefined && tokens(english).join() !== tokens(value).join();
      })
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });

  it.each(AREA_NAMES)(`${lang} · %s leaves held (legal/health) keys out`, (area) => {
    const target: LooseArea = LANGUAGES[lang]?.[area] ?? {};
    expect(Object.keys(target).filter((key) => held.has(key))).toEqual([]);
  });

  it(`${lang} only uses few/many forms where the language needs them`, () => {
    const extras = AREA_NAMES.flatMap((area) =>
      Object.keys(LANGUAGES[lang]?.[area] ?? {}).filter((key) => /\.(few|many)$/.test(key)),
    );
    if (lang !== 'pl') expect(extras).toEqual([]);
  });
});
