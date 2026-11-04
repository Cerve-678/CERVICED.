import { ALL_SPECIALTIES, AUDIENCE_SPECIALTIES_MAP, SPECIALTIES_MAP } from '../business-details/options';
import { matchesSpeciality, normalizeTerm } from '../../utils/fuzzyMatch';

export type SpecialityAudience = 'women' | 'men' | 'kids';

export interface SpecialityOptionsInput {
  /** The category tab's DB code (HAIR, NAILS…), or undefined on "All". */
  category?: string | undefined;
  audience?: SpecialityAudience | undefined;
  /** Per provider, the short labels the filter may offer as extra options
   *  (their specialities and service tags). */
  labelsByProvider: ReadonlyMap<string, ReadonlySet<string>>;
  /** Per provider, everything an option is matched against (labels plus
   *  service names) — the same haystack the Speciality filter itself uses. */
  haystackByProvider: ReadonlyMap<string, ReadonlySet<string>>;
  /** The providers the client's OTHER filters still leave, or null when none
   *  of them is narrowing the results. */
  narrowedTo: ReadonlySet<string> | null;
  selected: readonly string[];
}

const EXTRA_CAP = 24;

// A real provider tag/speciality is often stored lowercase-hyphenated
// ("silk-press", "nail-art"); presented as a filter chip it wants to read like
// the curated labels beside it. Normalize to words then title-case each.
// Matching is fuzzy and case-insensitive, so this only affects display.
function titleCaseSpeciality(raw: string): string {
  const norm = normalizeTerm(raw);
  if (!norm) return raw.trim();
  return norm
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function curatedFor(category: string | undefined, audience: SpecialityAudience | undefined): string[] {
  const general = category ? (SPECIALTIES_MAP[category] ?? ALL_SPECIALTIES) : ALL_SPECIALTIES;
  if (audience !== 'men' && audience !== 'kids') return general;
  const byCategory = AUDIENCE_SPECIALTIES_MAP[audience];
  if (category) return byCategory[category] ?? general;
  return [...new Set(Object.values(byCategory).flat())];
}

/**
 * The chips in Search's Speciality section, following the rest of the filters.
 *
 * The curated list depends on the category tab and on "Who it's for": Men
 * gets fades, beard trims and line-ups rather than bridal makeup. It widens
 * with short real specialities and tags from the result set. While another
 * filter (price, who it's for, rating, distance…) is narrowing the results,
 * only providers still in them supply those extras, and a curated option none
 * of them matches is left out, since picking it would show nobody. Specialities
 * combine with OR, so they never narrow each other's options. Anything already
 * selected stays, so it can always be turned off.
 */
export function buildSpecialityOptions(input: SpecialityOptionsInput): string[] {
  const { narrowedTo } = input;
  const inScope = (providerId: string) => !narrowedTo || narrowedTo.has(providerId);
  const haystacks = narrowedTo
    ? [...input.haystackByProvider].filter(([id]) => inScope(id)).map(([, h]) => [...h])
    : null;
  const anyoneMatches = (label: string) => !haystacks || haystacks.some(h => matchesSpeciality(h, label));

  const seen = new Set<string>();
  const out: string[] = [];
  const add = (label: string) => {
    const norm = normalizeTerm(label);
    if (!norm || seen.has(norm)) return;
    seen.add(norm);
    out.push(label);
  };

  curatedFor(input.category, input.audience).filter(anyoneMatches).forEach(add);

  let extras = 0;
  for (const [providerId, labels] of input.labelsByProvider) {
    if (extras >= EXTRA_CAP) break;
    if (!inScope(providerId)) continue;
    for (const raw of labels) {
      if (extras >= EXTRA_CAP) break;
      const tokenCount = normalizeTerm(raw).split(' ').filter(Boolean).length;
      if (tokenCount === 0 || tokenCount > 3) continue; // skip empty + long free text
      const label = titleCaseSpeciality(raw);
      if (seen.has(normalizeTerm(label))) continue;
      add(label);
      extras += 1;
    }
  }

  input.selected.forEach(add);
  return out;
}
