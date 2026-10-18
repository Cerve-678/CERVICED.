import {
  countDueItems,
  groupMaintenanceItems,
  presentMaintenanceItem,
} from '../features/maintenance/presentation';
import type { MaintenanceItem } from '../types/maintenance';

const TODAY = '2026-10-10';
function item(p: Partial<MaintenanceItem>): MaintenanceItem {
  return {
    id: 'x', kind: 'service', origin: 'booking', title: 'Lash infill', typeKey: 'lash_infill',
    providerId: 'p1', serviceId: 's1', providerName: 'Lash Lab', repeatWeeks: 3, intervalEdited: false,
    lastDoneOn: '2026-09-22', dueOn: '2026-10-13', eventOn: null, paused: false,
    createdAt: '2026-09-22T10:00:00Z', ...p,
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
    expect(g.summary).toEqual({ overdue: 1, dueSoon: 1, onTrack: 2 });
    expect(g.next?.item.id).toBe('a');
  });
});
