import { sentenceTail } from '../features/maintenance/SentenceHero';
import { presentMaintenanceItem } from '../features/maintenance/presentation';
import { translate, type TranslationKey, type TranslationParams } from '../i18n';
import type { MaintenanceItem } from '../types/maintenance';
import { formatShortDayDate } from '../utils/dateUtils';

const TODAY = '2026-11-22';
const t = (key: TranslationKey, params?: TranslationParams) => translate('en', key, params);

function item(p: Partial<MaintenanceItem>): MaintenanceItem {
  return {
    id: 'x', kind: 'service', origin: 'booking', title: 'Gel infills', typeKey: null,
    providerId: 'p1', serviceId: 's1', providerName: 'Amara Nails', repeatWeeks: 3, intervalEdited: false,
    intervalSource: 'provider', learnedDays: null, learnedFrom: null,
    lastDoneOn: '2026-10-30', dueOn: '2026-11-20', eventOn: null, paused: false,
    note: null, createdAt: '2026-10-30T10:00:00Z', ...p,
  };
}
const tail = (p: Partial<MaintenanceItem>) => sentenceTail({ item: item(p), view: presentMaintenanceItem(item(p), TODAY) }, t);

describe('the Maintenance sentence', () => {
  it('says how long ago an overdue item was due', () => {
    expect(tail({})).toBe(', due 2 days ago.');
    expect(tail({ dueOn: '2026-11-21' })).toBe(', due yesterday.');
  });

  it('says today, tomorrow, days, then weeks from two weeks out', () => {
    expect(tail({ dueOn: TODAY })).toBe(', due today.');
    expect(tail({ dueOn: '2026-11-23' })).toBe(', due tomorrow.');
    expect(tail({ dueOn: '2026-12-01' })).toBe(', due in 9 days.');
    expect(tail({ dueOn: '2026-12-20' })).toBe(', due in 4 weeks.');
  });

  it('gives an event its own date, and a take-down its "around" date', () => {
    expect(tail({ kind: 'event', eventOn: '2026-12-19', dueOn: '2026-12-12' }))
      .toBe(`, on ${formatShortDayDate('2026-12-19')}.`);
    expect(tail({ kind: 'takedown', dueOn: '2026-11-28' })).toBe(`, around ${formatShortDayDate('2026-11-28')}.`);
  });

  it('says paused rather than counting down', () => {
    expect(tail({ paused: true })).toBe(', paused.');
  });
});
