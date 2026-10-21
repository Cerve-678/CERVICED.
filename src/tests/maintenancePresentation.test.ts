import {
  categoryOf,
  learnedWeeks,
  rhythmLineFor,
  snoozedDueOn,
  countdownFor,
  countDueItems,
  landingStubs,
  groupMaintenanceItems,
  presentMaintenanceItem,
} from '../features/maintenance/presentation';
import type { MaintenanceItem } from '../types/maintenance';

const TODAY = '2026-10-10';
function item(p: Partial<MaintenanceItem>): MaintenanceItem {
  return {
    id: 'x', kind: 'service', origin: 'booking', title: 'Lash infill', typeKey: 'lash_infill',
    providerId: 'p1', serviceId: 's1', providerName: 'Lash Lab', repeatWeeks: 3, intervalEdited: false,
    intervalSource: 'default', learnedDays: null, learnedFrom: null,
    lastDoneOn: '2026-09-22', dueOn: '2026-10-13', eventOn: null, paused: false,
    note: null, createdAt: '2026-09-22T10:00:00Z', ...p,
  };
}
const covered = (serviceIds: string[], providerIds: string[] = []) => ({
  serviceIds: new Set(serviceIds), providerIds: new Set(providerIds),
});

describe('presentMaintenanceItem', () => {
  it('reads due soon within a week, with interval progress', () => {
    expect(presentMaintenanceItem(item({}), TODAY)).toEqual({ state: 'due_soon', daysUntilDue: 3, progressPercent: 86 });
  });

  it('reads overdue, due today and on track by date', () => {
    expect(presentMaintenanceItem(item({ dueOn: '2026-10-05' }), TODAY).state).toBe('overdue');
    expect(presentMaintenanceItem(item({ dueOn: TODAY }), TODAY).state).toBe('due_today');
    expect(presentMaintenanceItem(item({ dueOn: '2026-11-30' }), TODAY).state).toBe('on_track');
  });

  it('is quiet while an upcoming booking covers the same service', () => {
    expect(presentMaintenanceItem(item({ dueOn: '2026-10-05' }), TODAY, covered(['s1'])).state).toBe('booked');
    expect(presentMaintenanceItem(item({ dueOn: '2026-10-05' }), TODAY, covered(['other'])).state).toBe('overdue');
  });

  it('matches a provider-only link on provider, and an unlinked item never', () => {
    const providerOnly = item({ serviceId: null, dueOn: '2026-10-05' });
    expect(presentMaintenanceItem(providerOnly, TODAY, covered([], ['p1'])).state).toBe('booked');
    const unlinked = item({ serviceId: null, providerId: null, dueOn: '2026-10-05' });
    expect(presentMaintenanceItem(unlinked, TODAY, covered(['s1'], ['p1'])).state).toBe('overdue');
  });

  it('pauses win over everything, with no bar', () => {
    expect(presentMaintenanceItem(item({ paused: true, dueOn: '2026-10-01' }), TODAY))
      .toEqual({ state: 'paused', daysUntilDue: -9, progressPercent: null });
  });
});

describe('countDueItems / groupMaintenanceItems', () => {
  const items = [
    item({ id: 'a', dueOn: '2026-10-05' }),
    item({ id: 'b', dueOn: '2026-10-13', serviceId: 's2' }),
    item({ id: 'c', dueOn: '2026-12-01', serviceId: 's3' }),
    item({ id: 'd', dueOn: '2026-10-01', paused: true, serviceId: 's4' }),
    item({ id: 'e', kind: 'event', origin: 'client', serviceId: null, providerId: null, dueOn: '2026-11-14', eventOn: '2026-12-12', title: 'Wedding' }),
  ];

  it('counts due and overdue, not paused, booked or far-off items', () => {
    expect(countDueItems(items, TODAY)).toBe(2);
    expect(countDueItems(items, TODAY, covered(['s1']))).toBe(1);
  });

  it('groups by what the client should do', () => {
    const g = groupMaintenanceItems(items, TODAY);
    expect(g.needsAttention.map(p => p.item.id)).toEqual(['a', 'b']);
    expect(g.comingUp.map(p => p.item.id)).toEqual(['c']);
    expect(g.events.map(p => p.item.id)).toEqual(['e']);
    expect(g.paused.map(p => p.item.id)).toEqual(['d']);
    expect(g.next?.item.id).toBe('a');
  });
});

describe('countdownFor / landingStubs', () => {
  const present = (p: Partial<MaintenanceItem>) => {
    const i = item(p);
    return { item: i, view: presentMaintenanceItem(i, TODAY) };
  };

  it('counts days over, days left and weeks out', () => {
    expect(countdownFor(present({ dueOn: '2026-10-08' }))).toEqual({ value: 2, unit: 'daysOver', tone: 'bad' });
    expect(countdownFor(present({ dueOn: '2026-10-09' }))).toEqual({ value: 1, unit: 'dayOver', tone: 'bad' });
    expect(countdownFor(present({ dueOn: '2026-10-14' }))).toEqual({ value: 4, unit: 'days', tone: 'warn' });
    expect(countdownFor(present({ dueOn: TODAY }))).toEqual({ value: null, unit: 'today', tone: 'warn' });
    expect(countdownFor(present({ dueOn: '2026-11-07' }))).toEqual({ value: 4, unit: 'weeks', tone: 'mute' });
  });

  it('puts what needs the client first and leaves paused items out', () => {
    const items = [
      item({ id: 'later', title: 'Later', dueOn: '2026-12-01' }),
      item({ id: 'paused', title: 'Paused', dueOn: '2026-10-01', paused: true }),
      item({ id: 'soon', title: 'Soon', dueOn: '2026-10-12' }),
      item({ id: 'over', title: 'Over', dueOn: '2026-10-02' }),
    ];
    expect(landingStubs(groupMaintenanceItems(items, TODAY)).map(p => p.item.id)).toEqual(['over', 'soon', 'later']);
  });
});

describe('Your rhythm helpers', () => {
  it('snoozes a week from the due date, or from today when already overdue', () => {
    expect(snoozedDueOn(item({ dueOn: '2026-10-13' }), TODAY)).toBe('2026-10-20');
    expect(snoozedDueOn(item({ dueOn: '2026-10-01' }), TODAY)).toBe('2026-10-17');
    expect(snoozedDueOn(item({ dueOn: TODAY }), TODAY)).toBe('2026-10-17');
  });

  it('reads a learned gap to the nearest half week, never under one', () => {
    expect(learnedWeeks(25)).toBe(3.5);
    expect(learnedWeeks(28)).toBe(4);
    expect(learnedWeeks(7)).toBe(1);
  });

  it('describes the interval by where it came from', () => {
    expect(rhythmLineFor(item({ intervalSource: 'learned', learnedDays: 25, learnedFrom: 5 })))
      .toEqual({ kind: 'learned', weeks: 3.5, from: 5 });
    expect(rhythmLineFor(item({ intervalSource: 'provider', repeatWeeks: 6 })))
      .toEqual({ kind: 'provider', weeks: 6, provider: 'Lash Lab' });
    expect(rhythmLineFor(item({ intervalSource: 'client', repeatWeeks: 5 }))).toEqual({ kind: 'client', weeks: 5 });
    expect(rhythmLineFor(item({ intervalSource: 'default' }))).toBeNull();
    expect(rhythmLineFor(item({ repeatWeeks: null, intervalSource: 'client' }))).toBeNull();
  });

  it('never shows a learned habit when the provider figure is the one in use', () => {
    // learned_* is kept on provider rows too; the line must still be the provider's.
    expect(rhythmLineFor(item({ intervalSource: 'provider', repeatWeeks: 6, learnedDays: 21, learnedFrom: 4 })))
      .toEqual({ kind: 'provider', weeks: 6, provider: 'Lash Lab' });
  });

  it('files items under their type\'s category; take-downs are hair, events are other', () => {
    expect(categoryOf(item({ typeKey: 'waxing' }))).toBe('AESTHETICS');
    expect(categoryOf(item({ kind: 'takedown', typeKey: null }))).toBe('HAIR');
    expect(categoryOf(item({ kind: 'event', typeKey: null }))).toBeNull();
  });
});
