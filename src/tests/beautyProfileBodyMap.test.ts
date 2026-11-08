import {
  AREA_CATEGORY,
  DEFAULT_FIGURE_PREFS,
  MAP_AREAS,
  areaForMaintenanceItem,
  areaRows,
  maintenanceForMap,
  parseFigurePrefs,
} from '../features/beauty-profile/bodyMap';
import {
  addWeeksYMD,
  canSnoozeItem,
  doneOutcome,
  groupMaintenanceItems,
  nextUpFrom,
  presentMaintenanceItem,
} from '../features/maintenance/presentation';
import { EMPTY_BEAUTY_DATA, type BeautyData } from '../types/beautyProfile';
import type { MaintenanceItem } from '../types/maintenance';

const TODAY = '2026-11-08';
const NONE = { serviceIds: new Set<string>(), providerIds: new Set<string>() };

function item(p: Partial<MaintenanceItem>): MaintenanceItem {
  return {
    id: 'x', kind: 'service', origin: 'booking', title: 'Lash infill', typeKey: 'lash_infill',
    providerId: 'p1', serviceId: 's1', providerName: 'Lash Lab', repeatWeeks: 3, intervalEdited: false,
    intervalSource: 'default', learnedDays: null, learnedFrom: null,
    lastDoneOn: '2026-10-18', dueOn: '2026-11-08', eventOn: null, paused: false,
    note: null, createdAt: '2026-10-18T10:00:00Z', ...p,
  };
}

const profile = (p: Partial<BeautyData>): BeautyData => ({ ...EMPTY_BEAUTY_DATA, ...p });

describe('body map areas', () => {
  it('has one pin per mapped category, and none for health, personalisation or consent', () => {
    expect(MAP_AREAS.map((a) => AREA_CATEGORY[a])).toEqual(['hair', 'lashesBrows', 'skin', 'makeup', 'nails', 'general']);
  });

  it('lists the answers for a pin, joining multi-picks', () => {
    const rows = areaRows('skin', profile({ skinType: ['Oily', 'Sensitive'], skinConcerns: ['Acne'] }));
    expect(rows).toEqual([
      { label: 'Skin type', value: 'Oily, Sensitive' },
      { label: 'Concerns', value: 'Acne' },
      { label: 'Sensitive', value: null },
    ]);
  });

  it('never lists skin tone', () => {
    const rows = areaRows('skin', profile({ skinTone: 'Deep' }));
    expect(rows.some((r) => r.value?.includes('Deep'))).toBe(false);
    expect(rows.map((r) => r.label.toLowerCase()).some((l) => l.includes('tone'))).toBe(false);
  });

  it('only shows interests on style when there are some', () => {
    expect(areaRows('general', profile({ styleVibe: ['Natural'] })).map((r) => r.label)).toEqual(['Style vibe']);
    expect(areaRows('general', profile({ serviceInterests: ['Nails'] })).map((r) => r.label)).toEqual(['Style vibe', 'Interests']);
  });
});

describe('due dots', () => {
  it('maps maintenance types to pins; events and untyped reminders have none', () => {
    expect(areaForMaintenanceItem(item({ typeKey: 'gel_nails' }))).toBe('nails');
    expect(areaForMaintenanceItem(item({ typeKey: 'lash_infill' }))).toBe('eyes');
    expect(areaForMaintenanceItem(item({ kind: 'takedown', typeKey: null }))).toBe('hair');
    expect(areaForMaintenanceItem(item({ kind: 'event', typeKey: null }))).toBeNull();
    expect(areaForMaintenanceItem(item({ kind: 'service', typeKey: null }))).toBeNull();
  });

  it('is red when anything there is overdue, amber when due within the week, and ignores booked items', () => {
    const { dots } = maintenanceForMap(
      [
        item({ id: 'a', typeKey: 'gel_nails', dueOn: '2026-11-11' }),
        item({ id: 'b', typeKey: 'lash_infill', dueOn: '2026-11-05', serviceId: 'sx' }),
        item({ id: 'c', typeKey: 'lash_infill', dueOn: '2026-11-10', serviceId: 'sy' }),
        item({ id: 'd', typeKey: 'trim', dueOn: '2026-11-01', serviceId: 'booked' }),
      ],
      TODAY,
      { serviceIds: new Set(['booked']), providerIds: new Set() },
    );
    expect(dots).toEqual({ nails: 'warn', eyes: 'bad' });
  });
});

describe('figure prefs', () => {
  it('defaults to Portrait + hands with due dots off', () => {
    expect(DEFAULT_FIGURE_PREFS).toEqual({ figure: 'portrait', dueDots: false });
    expect(parseFigurePrefs(null)).toEqual(DEFAULT_FIGURE_PREFS);
  });

  it('keeps a known choice and drops anything else', () => {
    expect(parseFigurePrefs({ figure: 'zones', dueDots: true })).toEqual({ figure: 'zones', dueDots: true });
    expect(parseFigurePrefs({ figure: 'robot', dueDots: 'yes' })).toEqual(DEFAULT_FIGURE_PREFS);
  });
});

describe('the big Maintenance card', () => {
  it('Done it restarts a repeating item from today', () => {
    expect(doneOutcome(item({ repeatWeeks: 3 }), TODAY)).toEqual({
      kind: 'update',
      patch: { lastDoneOn: TODAY, dueOn: addWeeksYMD(TODAY, 3) },
    });
    expect(addWeeksYMD(TODAY, 3)).toBe('2026-11-29');
  });

  it('Done it removes a one-off or an event', () => {
    expect(doneOutcome(item({ repeatWeeks: null, typeKey: null }), TODAY)).toEqual({ kind: 'delete' });
    expect(doneOutcome(item({ kind: 'event', repeatWeeks: null }), TODAY)).toEqual({ kind: 'delete' });
  });

  it('offers Snooze except on events, booked or paused items', () => {
    const p = (i: MaintenanceItem, cov = NONE) => ({ item: i, view: presentMaintenanceItem(i, TODAY, cov) });
    expect(canSnoozeItem(p(item({})))).toBe(true);
    expect(canSnoozeItem(p(item({ kind: 'event', typeKey: null })))).toBe(false);
    expect(canSnoozeItem(p(item({ paused: true })))).toBe(false);
    expect(canSnoozeItem(p(item({}), { serviceIds: new Set(['s1']), providerIds: new Set() }))).toBe(false);
  });

  it('leads with what is due, else says all clear with the next thing coming up', () => {
    const due = nextUpFrom(groupMaintenanceItems([item({ id: 'due', dueOn: '2026-11-10' })], TODAY, NONE));
    expect(due.due?.item.id).toBe('due');
    expect(due.upcoming).toBeNull();

    const clear = nextUpFrom(groupMaintenanceItems([item({ id: 'later', dueOn: '2026-12-20' })], TODAY, NONE));
    expect(clear.due).toBeNull();
    expect(clear.upcoming?.item.id).toBe('later');
  });

  it('never leads with a booked item', () => {
    const out = nextUpFrom(groupMaintenanceItems(
      [item({ id: 'booked', dueOn: '2026-11-05' })],
      TODAY,
      { serviceIds: new Set(['s1']), providerIds: new Set() },
    ));
    expect(out.due).toBeNull();
    expect(out.upcoming).toBeNull();
  });
});
