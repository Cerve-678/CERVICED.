// ─────────────────────────────────────────────────────────
// SPELLING-TOLERANT SPECIALITY MATCHING
//
// The client Speciality filter matches a chosen label (e.g. "Dominican
// blowout") against a provider's real data — their chosen business
// specialities, the tags they put on individual services, and the service
// names themselves. Those three sources disagree on casing, spacing and
// punctuation ("silk-press" vs "Silk press" vs "silk press"), and a client
// typing/tapping never spells things the same way a provider did, so the
// match has to survive:
//
//   • casing / accents / punctuation   ("Blow-Out" ≈ "blow out")
//   • spacing                          ("blowout"  ≈ "blow out")
//   • plurals & shared word stems      ("blowouts" ≈ "blowout")
//   • small typos, scaled to length    ("balyage"  ≈ "balayage")
//
// Pure string work — no network/DB — so it's usable from screens and tests.
// ─────────────────────────────────────────────────────────

/**
 * Lowercase, strip accents, turn any run of non-alphanumeric characters into a
 * single space, then collapse and trim. "Silk-Press!!" and "silk   press" both
 * become "silk press".
 */
export function normalizeTerm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // drop combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Normalize then split into word tokens, dropping empties. */
export function tokenize(s: string): string[] {
  const n = normalizeTerm(s);
  return n ? n.split(' ') : [];
}

/**
 * Classic Levenshtein edit distance. Only ever called on single words here, so
 * the O(m·n) table is tiny; no early-exit needed.
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Single rolling row: row[j] holds the distance for the current source
  // prefix; prevDiag carries the diagonal (i-1, j-1) value across each step.
  const row: number[] = [];
  for (let j = 0; j <= n; j++) row[j] = j;

  for (let i = 1; i <= m; i++) {
    let prevDiag = row[0]!; // = distance for (i-1, 0)
    row[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const up = row[j]!; // (i-1, j) before overwrite
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      row[j] = Math.min(
        up + 1, // deletion
        row[j - 1]! + 1, // insertion
        prevDiag + cost, // substitution
      );
      prevDiag = up;
    }
  }
  return row[n]!;
}

/**
 * Do two single words count as "the same word", allowing for plurals, shared
 * stems and small typos?
 *
 * Short words (≤3 chars, "gel", "bob") must match exactly — one edit on a
 * three-letter word turns it into an unrelated word, so fuzzing them is pure
 * false-positive risk. Longer words allow a shared prefix (covers plurals and
 * "-ing"/"-ed" endings) and an edit budget that grows with length.
 */
export function tokensSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  const min = Math.min(a.length, b.length);
  const max = Math.max(a.length, b.length);
  if (max <= 3) return false; // too short to fuzz safely
  if (min >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  const allowed = max <= 5 ? 1 : max <= 8 ? 2 : 3;
  return levenshtein(a, b) <= allowed;
}

/**
 * Split a compound speciality label into the alternative phrases a filter
 * should match ANY of. A curated chip like "BIAB / builder gel" or "Colour &
 * balayage" names two ways of saying one filter intent, not a requirement that
 * a provider have BOTH — so a service tagged just `biab` or `balayage` must
 * still match. Splits on "/", "&", "," and the word "or". Must run on the raw
 * label, before normalization turns those separators into spaces.
 */
function splitAlternatives(raw: string): string[] {
  return raw
    .split(/\s*[/&,]\s*|\s+or\s+/i)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Does a single phrase match anywhere in `haystack`? Two independent routes
 * count, checked per haystack string:
 *   1. Spacing-insensitive containment — the phrase's letters (spaces removed)
 *      appear as a contiguous run in the hay's letters. This is what lets
 *      "Dominican blowout" match a service literally named "Dominican Blow
 *      Out". Exact on letters, so it never over-matches.
 *   2. Token coverage — every word of the phrase has a similar word somewhere
 *      in the hay (see tokensSimilar). This tolerates typos and word order.
 *      Requiring *every* word is what stops a two-word phrase matching a
 *      provider who has only one of the words.
 */
function matchesPhrase(haystack: string[], phrase: string): boolean {
  const phraseTokens = tokenize(phrase);
  if (phraseTokens.length === 0) return false;
  const phraseFlat = phraseTokens.join('');

  for (const hay of haystack) {
    const hayTokens = tokenize(hay);
    if (hayTokens.length === 0) continue;
    const hayFlat = hayTokens.join('');

    if (hayFlat.includes(phraseFlat)) return true;
    if (phraseTokens.every(nt => hayTokens.some(ht => tokensSimilar(ht, nt)))) return true;
  }
  return false;
}

/**
 * Does `needle` (a speciality label, possibly compound) match anywhere in
 * `haystack` (the strings describing a provider: their specialities, service
 * tags and service names), tolerant of spacing, spelling and compound labels?
 * A compound label matches if ANY of its alternatives does.
 */
export function matchesSpeciality(haystack: string[], needle: string): boolean {
  return splitAlternatives(needle).some(phrase => matchesPhrase(haystack, phrase));
}

/** True if the haystack matches ANY of the needles — the OR semantics of a
 *  multi-select filter (a provider offering any chosen speciality matches). */
export function matchesAnySpeciality(haystack: string[], needles: string[]): boolean {
  return needles.some(n => matchesSpeciality(haystack, n));
}
