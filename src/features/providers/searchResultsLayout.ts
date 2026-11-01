/**
 * Search results as one list: rows of provider cards with full-width
 * service cards scattered between them (product owner, 2026-11-01 — the
 * "scattered" concept). Matching services used to sit in a sideways strip
 * above the grid, where only the first one or two were ever seen.
 *
 * After each row of providers come the next `servicesPerGap` services, best
 * match first. Whatever is left once the providers run out goes at the end,
 * so no matching service is dropped.
 */
export type SearchResultRow<P, S> =
  | { kind: 'providers'; key: string; providers: P[]; firstIndex: number }
  | { kind: 'service'; key: string; service: S };

export interface ScatterOptions<P, S> {
  columns: number;
  servicesPerGap: number;
  providerKey: (provider: P) => string;
  serviceKey: (service: S) => string;
}

export function scatterServicesBetweenProviders<P, S>(
  providers: P[],
  services: S[],
  { columns, servicesPerGap, providerKey, serviceKey }: ScatterOptions<P, S>,
): SearchResultRow<P, S>[] {
  const rows: SearchResultRow<P, S>[] = [];
  const perRow = Math.max(1, columns);
  let nextService = 0;
  const pushServices = (count: number) => {
    for (const service of services.slice(nextService, nextService + count)) {
      rows.push({ kind: 'service', key: `service:${serviceKey(service)}`, service });
    }
    nextService = Math.min(services.length, nextService + count);
  };

  for (let start = 0; start < providers.length; start += perRow) {
    const chunk = providers.slice(start, start + perRow);
    const [first] = chunk;
    if (first === undefined) break;
    // Keyed by the row's first provider, not its position, so a row that
    // only moves (a filter removed someone above it) isn't remounted.
    rows.push({ kind: 'providers', key: `providers:${providerKey(first)}`, providers: chunk, firstIndex: start });
    pushServices(servicesPerGap);
  }
  pushServices(services.length);
  return rows;
}

export interface HighlightSegment {
  text: string;
  match: boolean;
}

/**
 * Splits `text` so the words that matched the search can be shown in bold.
 * A term matches at the start of a word and the highlight runs to the end of
 * that word, so "tip" lights up "tips". Terms of two letters or fewer are
 * ignored — "in" from "nails in Manchester" would otherwise light up
 * "included".
 */
export function highlightSearchTerms(text: string, query: string | null | undefined): HighlightSegment[] {
  if (!text) return [];
  const terms = Array.from(new Set(
    (query ?? '')
      .toLowerCase()
      .split(/\s+/)
      .map(term => term.replace(/^[^a-z0-9à-ÿ]+|[^a-z0-9à-ÿ]+$/g, ''))
      .filter(term => term.length > 2),
  ));
  if (terms.length === 0) return [{ text, match: false }];

  // A plain scan rather than one regex: Hermes' support for lookbehind and
  // \p{L} isn't something to lean on for a list that renders on every search.
  const lower = text.toLowerCase();
  const segments: HighlightSegment[] = [];
  let last = 0;
  let i = 0;
  while (i < text.length) {
    const startsWord = i === 0 || !isWordChar(lower[i - 1]);
    const term = startsWord ? terms.find(t => lower.startsWith(t, i)) : undefined;
    if (!term) { i += 1; continue; }
    let end = i + term.length;
    while (end < text.length && isWordChar(lower[end])) end += 1;
    if (i > last) segments.push({ text: text.slice(last, i), match: false });
    segments.push({ text: text.slice(i, end), match: true });
    last = end;
    i = end;
  }
  if (last < text.length) segments.push({ text: text.slice(last), match: false });
  return segments;
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[a-z0-9à-ÿ]/.test(ch);
}
