import {
  circleLine,
  firstName,
  groupCircleRows,
  initialsFor,
  stackAccessibilityLabel,
  stackLayout,
  type CircleRow,
} from '../features/social/presentation';
import type { CircleByProvider, CirclePerson } from '../features/social/types';

const at = (out: CircleByProvider, id: string): CirclePerson[] => out[id] ?? [];

const row = (over: Partial<CircleRow>): CircleRow => ({
  provider_id: 'p1',
  person_id: 'a',
  name: 'Amara Okafor',
  avatar_url: null,
  recommends: false,
  visits: 1,
  ...over,
});

describe('groupCircleRows', () => {
  it('groups by provider and puts recommenders first, then most visits', () => {
    const out = groupCircleRows([
      row({ person_id: 'jo', name: 'Jo', visits: 2 }),
      row({ person_id: 'amara', name: 'Amara', recommends: true, visits: 0 }),
      row({ person_id: 'bea', name: 'Bea', visits: 5 }),
      row({ provider_id: 'p2', person_id: 'jo', name: 'Jo', visits: 1 }),
    ]);
    expect(at(out, 'p1').map((p) => p.personId)).toEqual(['amara', 'bea', 'jo']);
    expect(at(out, 'p2')).toHaveLength(1);
  });

  it('drops rows that neither recommend nor visited, and duplicates', () => {
    const out = groupCircleRows([
      row({ person_id: 'x', visits: 0, recommends: false }),
      row({ person_id: 'a' }),
      row({ person_id: 'a' }),
    ]);
    expect(at(out, 'p1')).toHaveLength(1);
  });

  it('falls back to a neutral name when the account has none', () => {
    expect(at(groupCircleRows([row({ name: '  ' })]), 'p1')[0]?.name).toBe('Someone you follow');
  });
});

describe('stackLayout', () => {
  const people = at(groupCircleRows(
    ['a', 'b', 'c', 'd', 'e'].map((id) => row({ person_id: id, name: id })),
  ), 'p1');

  it('shows three faces and +N on a normal card', () => {
    const out = stackLayout(people, 180);
    expect(out.shown).toHaveLength(3);
    expect(out.more).toBe(2);
  });

  it('shows two faces on a narrow card', () => {
    expect(stackLayout(people, 120).shown).toHaveLength(2);
  });

  it('is empty with nobody', () => {
    expect(stackLayout(undefined)).toEqual({ shown: [], more: 0 });
  });
});

describe('copy', () => {
  it('never names a service', () => {
    const p = at(groupCircleRows([row({ visits: 2 })]), 'p1')[0]!;
    expect(circleLine(p)).toBe('Has been · 2 times');
    expect(circleLine({ ...p, visits: 1 })).toBe('Has been');
    expect(circleLine({ ...p, recommends: true })).toBe('Recommends');
  });

  it('builds names and initials', () => {
    expect(firstName('Amara Okafor')).toBe('Amara');
    expect(initialsFor('Amara Okafor')).toBe('AO');
    expect(initialsFor('jo')).toBe('J');
  });

  it('labels the stack for screen readers', () => {
    const people = at(groupCircleRows([
      row({ person_id: 'a', name: 'Amara O', recommends: true }),
      row({ person_id: 'b', name: 'Jo B' }),
      row({ person_id: 'c', name: 'Bea C' }),
    ]), 'p1');
    expect(stackAccessibilityLabel(people)).toBe(
      'People you follow: Amara, Bea and 1 other. 1 recommends.',
    );
  });
});
