import { buildMaintenanceSuggestions } from '../utils/maintenanceSuggestions';
import { MAINTENANCE_SERVICE_TYPES } from '../constants/maintenanceServiceTypes';
import { EMPTY_BEAUTY_DATA, type BeautyData } from '../types/beautyProfile';
import type { MaintenanceItem, MaintenanceSetupAnswers } from '../types/maintenance';

const TODAY = new Date(2026, 9, 10); // 10 Oct 2026, local
const NO_ANSWERS: MaintenanceSetupAnswers = {
  protectiveStyle: null,
  protectiveWearWeeks: 6,
  protectiveWeeksIn: null,
  events: [],
  lastPatchTestOn: null,
};
const profile = (p: Partial<BeautyData>): BeautyData => ({ ...EMPTY_BEAUTY_DATA, ...p });
const defaultWeeks = (key: string) => MAINTENANCE_SERVICE_TYPES.find(t => t.key === key)!.defaultWeeks;

function item(p: Partial<MaintenanceItem>): MaintenanceItem {
  return {
    id: 'x', kind: 'service', origin: 'client', title: 't', typeKey: null, providerId: null,
    serviceId: null, providerName: null, repeatWeeks: 4, intervalEdited: false, lastDoneOn: null,
    dueOn: '2026-11-01', eventOn: null, paused: false, createdAt: '2026-10-01T00:00:00Z', ...p,
  };
}

describe('buildMaintenanceSuggestions', () => {
  it('suggests nothing for an empty profile with no answers', () => {
    expect(buildMaintenanceSuggestions(EMPTY_BEAUTY_DATA, NO_ANSWERS, [], TODAY)).toEqual([]);
  });

  it('offers the textured-hair services for coily hair, each citing the answer', () => {
    const s = buildMaintenanceSuggestions(profile({ hairType: 'Coily' }), NO_ANSWERS, [], TODAY);
    expect(s.map(x => x.typeKey)).toEqual(['wash_and_go', 'silk_press', 'deep_conditioning', 'trim']);
    s.forEach(x => expect(x.answer).toBe('Hair type: Coily'));
  });

  it('offers relaxer and root colour from treatment history', () => {
    const s = buildMaintenanceSuggestions(
      profile({ treatmentHistory: ['Relaxed / permed', 'Coloured'] }), NO_ANSWERS, [], TODAY);
    expect(s.map(x => x.typeKey)).toEqual(['relaxer_touch_up', 'root_colour']);
  });

  it('never lets a profile answer change an interval length', () => {
    // Hair type and history may choose WHICH types, never how long (legal mitigation 2).
    const variants: Partial<BeautyData>[] = [
      { hairType: 'Straight' }, { hairType: '4C' },
      { hairType: '4C', treatmentHistory: ['Relaxed / permed', 'Bleached / lightened'] },
      { hairType: 'Wavy', hairGoals: ['Moisture'], skinTone: 'Deep' },
    ];
    for (const v of variants) {
      for (const s of buildMaintenanceSuggestions(profile(v), NO_ANSWERS, [], TODAY)) {
        if (s.typeKey) expect(s.repeatWeeks).toBe(defaultWeeks(s.typeKey));
      }
    }
  });

  it('ignores skin tone and skin concerns entirely', () => {
    const base = buildMaintenanceSuggestions(profile({ skinType: 'Dry' }), NO_ANSWERS, [], TODAY);
    const withSensitive = buildMaintenanceSuggestions(
      profile({ skinType: 'Dry', skinTone: 'Deep', skinConcerns: ['Eczema', 'Rosacea'] }), NO_ANSWERS, [], TODAY);
    expect(withSensitive).toEqual(base);
  });

  it('does not offer lash infill once the client says they have no extensions', () => {
    const s = buildMaintenanceSuggestions(
      profile({ lashStatus: 'No extensions', treatmentHistory: ['Lash extensions'] }), NO_ANSWERS, [], TODAY);
    expect(s.map(x => x.typeKey)).not.toContain('lash_infill');
  });

  it('skips types the client already has, paused or not', () => {
    const s = buildMaintenanceSuggestions(
      profile({ hairType: 'Coily' }), NO_ANSWERS,
      [item({ typeKey: 'silk_press', paused: true }), item({ typeKey: 'trim' })], TODAY);
    expect(s.map(x => x.typeKey)).toEqual(['wash_and_go', 'deep_conditioning']);
  });

  it('times a protective-style take-down from the weeks already worn', () => {
    const s = buildMaintenanceSuggestions(EMPTY_BEAUTY_DATA,
      { ...NO_ANSWERS, protectiveStyle: 'braids', protectiveWearWeeks: 7, protectiveWeeksIn: 5 }, [], TODAY);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kind: 'takedown', title: 'Braids take-down', repeatWeeks: null, dueOn: '2026-10-24' });
  });

  it('turns locs into a retwist service rather than a take-down', () => {
    const s = buildMaintenanceSuggestions(EMPTY_BEAUTY_DATA,
      { ...NO_ANSWERS, protectiveStyle: 'locs', protectiveWeeksIn: 2 }, [], TODAY);
    expect(s.map(x => x.typeKey)).toEqual(['loc_retwist']);
  });

  it('gives an event a book-by date four weeks ahead, never in the past', () => {
    const s = buildMaintenanceSuggestions(EMPTY_BEAUTY_DATA, {
      ...NO_ANSWERS,
      events: [
        { name: 'Wedding', date: '2026-12-12' },
        { name: 'Soon', date: '2026-10-20' },
        { name: 'Gone', date: '2026-10-01' },
        { name: '  ', date: '2026-12-01' },
      ],
    }, [], TODAY);
    expect(s.map(x => [x.title, x.dueOn, x.eventOn])).toEqual([
      ['Wedding', '2026-11-14', '2026-12-12'],
      ['Soon', '2026-10-10', '2026-10-20'],
    ]);
  });

  it('never suggests a patch test', () => {
    const s = buildMaintenanceSuggestions(profile({ treatmentHistory: ['Coloured'] }),
      { ...NO_ANSWERS, lastPatchTestOn: '2025-01-01' }, [], TODAY);
    expect(s.every(x => !/patch/i.test(x.title))).toBe(true);
  });
});
