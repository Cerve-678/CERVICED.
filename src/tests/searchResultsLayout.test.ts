import {
  highlightSearchTerms,
  scatterServicesBetweenProviders,
} from '../features/providers/searchResultsLayout';

const options = {
  columns: 2,
  servicesPerGap: 2,
  providerKey: (p: string) => p,
  serviceKey: (s: string) => s,
};

describe('scatterServicesBetweenProviders', () => {
  it('puts two services after each row of providers, best match first', () => {
    const rows = scatterServicesBetweenProviders(['p1', 'p2', 'p3', 'p4'], ['s1', 's2', 's3', 's4'], options);
    expect(rows.map(r => r.key)).toEqual([
      'providers:p1', 'service:s1', 'service:s2',
      'providers:p3', 'service:s3', 'service:s4',
    ]);
    expect(rows[3]).toMatchObject({ kind: 'providers', providers: ['p3', 'p4'], firstIndex: 2 });
  });

  it('keeps every service when there are more services than gaps', () => {
    const rows = scatterServicesBetweenProviders(['p1'], ['s1', 's2', 's3', 's4', 's5'], options);
    expect(rows.map(r => r.key)).toEqual([
      'providers:p1', 'service:s1', 'service:s2', 'service:s3', 'service:s4', 'service:s5',
    ]);
  });

  it('leaves a plain provider grid when nothing matched as a service', () => {
    const rows = scatterServicesBetweenProviders(['p1', 'p2', 'p3'], [], { ...options, columns: 3 });
    expect(rows).toEqual([{ kind: 'providers', key: 'providers:p1', providers: ['p1', 'p2', 'p3'], firstIndex: 0 }]);
  });
});

describe('highlightSearchTerms', () => {
  const matched = (text: string, query: string | null) =>
    highlightSearchTerms(text, query).filter(s => s.match).map(s => s.text);

  it('highlights whole words that start with a search term, ignoring case', () => {
    expect(matched('Short white French tips on natural nails', 'french tip')).toEqual(['French', 'tips']);
  });

  it('keeps the full text when put back together', () => {
    const text = 'Gel overlay, finished with crisp French tips.';
    expect(highlightSearchTerms(text, 'french tips').map(s => s.text).join('')).toBe(text);
  });

  it('ignores short words and matches inside a word', () => {
    expect(matched('Cuticle care included, in the Northern Quarter', 'nails in manchester')).toEqual([]);
    expect(matched('A frenchie-free menu', 'chie')).toEqual([]);
  });

  it('returns the text unhighlighted when there is no query', () => {
    expect(highlightSearchTerms('Classic French', null)).toEqual([{ text: 'Classic French', match: false }]);
  });
});
