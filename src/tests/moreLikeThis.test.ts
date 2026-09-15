import { buildMoreLikeThis } from '../features/explore/moreLikeThis';
import type { PortfolioItem } from '../types/providers';

const item = (
  id: string,
  category: PortfolioItem['category'],
  kind: NonNullable<PortfolioItem['kind']>,
  providerId = id,
): PortfolioItem => ({
  id,
  image: { uri: `https://images.test/${id}.jpg` },
  caption: '',
  category,
  aspectRatio: 1,
  providerId,
  kind,
});

describe('buildMoreLikeThis', () => {
  it('mixes source types while staying in the same category', () => {
    const anchor = item('anchor', 'HAIR', 'portfolio', 'original');
    const result = buildMoreLikeThis(anchor, [
      item('p1', 'HAIR', 'portfolio'),
      item('p2', 'HAIR', 'portfolio'),
      item('s1', 'HAIR', 'service'),
      item('v1', 'HAIR', 'provider'),
      item('other', 'NAILS', 'service'),
    ]);

    expect(result.isFallback).toBe(false);
    expect(result.items.map(value => value.category)).toEqual([
      'HAIR',
      'HAIR',
      'HAIR',
      'HAIR',
    ]);
    expect(result.items.slice(0, 3).map(value => value.kind)).toEqual([
      'portfolio',
      'service',
      'provider',
    ]);
  });

  it('never fills More Like This with unrelated categories', () => {
    const result = buildMoreLikeThis(item('anchor', 'BROWS', 'portfolio'), [
      item('hair', 'HAIR', 'portfolio'),
      item('nails', 'NAILS', 'service'),
    ]);
    expect(result.isFallback).toBe(false);
    expect(result.items).toHaveLength(0);
  });

  it('deduplicates the same underlying image', () => {
    const anchor = item('anchor', 'MUA', 'portfolio');
    const first = item('one', 'MUA', 'portfolio');
    const duplicate = {
      ...item('two', 'MUA', 'service'),
      image: first.image,
    };
    expect(buildMoreLikeThis(anchor, [first, duplicate]).items).toHaveLength(1);
  });

  it('uses every available provider before repeating one', () => {
    const anchor = item('anchor', 'NAILS', 'portfolio', 'anchor-provider');
    const result = buildMoreLikeThis(anchor, [
      item('a-work-1', 'NAILS', 'portfolio', 'provider-a'),
      item('a-work-2', 'NAILS', 'portfolio', 'provider-a'),
      item('a-service', 'NAILS', 'service', 'provider-a'),
      item('b-work', 'NAILS', 'portfolio', 'provider-b'),
      item('c-provider', 'NAILS', 'provider', 'provider-c'),
    ], 5);

    expect(new Set(result.items.slice(0, 3).map(value => value.providerId))).toEqual(
      new Set(['provider-a', 'provider-b', 'provider-c']),
    );
    expect(result.items.every(value => value.category === 'NAILS')).toBe(true);
  });

  it('does not let the anchor provider lead when alternatives exist', () => {
    const anchor = item('anchor', 'LASHES', 'portfolio', 'provider-a');
    const result = buildMoreLikeThis(anchor, [
      item('same-provider', 'LASHES', 'service', 'provider-a'),
      item('different-provider', 'LASHES', 'portfolio', 'provider-b'),
    ]);

    expect(result.items[0]?.providerId).toBe('provider-b');
  });

  it('prefers the same named service across the provider rotation', () => {
    const anchor = {
      ...item('anchor', 'HAIR', 'service', 'anchor-provider'),
      serviceName: 'Silk Press',
    };
    const result = buildMoreLikeThis(anchor, [
      { ...item('mora-generic', 'HAIR', 'service', 'mora'), serviceName: 'Trim' },
      { ...item('tiago-match', 'HAIR', 'service', 'tiago'), serviceName: ' silk   press ' },
      { ...item('mora-match', 'HAIR', 'service', 'mora'), serviceName: 'SILK PRESS' },
      { ...item('x-generic', 'HAIR', 'portfolio', 'x-hair') },
    ]);

    expect(result.items.slice(0, 3).map(value => value.providerId)).toEqual([
      'tiago',
      'mora',
      'x-hair',
    ]);
    expect(result.items.slice(0, 2).map(value => value.serviceName)).toEqual([
      ' silk   press ',
      'SILK PRESS',
    ]);
    expect(result.items.every(value => value.category === 'HAIR')).toBe(true);
  });
});
