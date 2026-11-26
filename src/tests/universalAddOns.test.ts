import { readFileSync } from 'fs';
import { join } from 'path';
import {
  addOnAppliesTo,
  addOnKeysForSavedService,
  applyRuleToServices,
  buildAddOnSaveItems,
  defaultAddOnKeysForCategory,
  describeAddOnRule,
  mergeAddOns,
  removeAddOnFromServices,
  removeCategoryFromLibrary,
  renameCategoryInLibrary,
  suggestAddOns,
  validateAddOn,
  type AddOnLibraryItem,
  type AddOnServiceRef,
} from '../features/provider-registration/addOnLibrary';
import {
  addOnExtraMinutes,
  durationWithAddOns,
  formatAddOnExtraTime,
} from '../features/bookings/addOnTime';
import type { DbProviderAddOn } from '../types/database';

type Svc = AddOnServiceRef & { categoryName: string };

const svc = (id: number, dbId: string | null, name: string, categoryName: string, addOnKeys: string[] = []): Svc => ({
  id,
  dbId,
  name,
  categoryName,
  addOnKeys,
});

const item = (over: Partial<AddOnLibraryItem> & Pick<AddOnLibraryItem, 'key'>): AddOnLibraryItem => ({
  dbId: over.key.startsWith('new:') ? null : over.key,
  name: 'Lash removal',
  price: 10,
  description: '',
  extraMinutes: 15,
  isActive: true,
  appliesTo: 'services',
  categoryNames: [],
  ...over,
});

const menu = (): Record<string, Svc[]> => ({
  Lashes: [
    svc(1, 'classic', 'Classic Lashes', 'Lashes'),
    svc(2, 'hybrid', 'Hybrid Lashes', 'Lashes'),
    svc(3, null, 'Volume Lashes', 'Lashes'),
  ],
  Brows: [svc(4, 'lam', 'Brow Lamination', 'Brows')],
});

describe('add-on extra time', () => {
  it('adds each picked add-on to the appointment length', () => {
    expect(addOnExtraMinutes([{ extraMinutes: 15 }, { extraMinutes: 30 }, {}])).toBe(45);
    expect(durationWithAddOns('1h', [{ extraMinutes: 15 }])).toBe('1h 15m');
    expect(durationWithAddOns('45 min', [{ extraMinutes: 30 }])).toBe('1h 15m');
    expect(durationWithAddOns('1h 30min', [{ extraMinutes: 30 }, { extraMinutes: 15 }])).toBe('2h 15m');
  });

  it('leaves the duration exactly as it was when nothing adds time', () => {
    // A cart saved before add-ons had extra time has no extraMinutes at all.
    expect(durationWithAddOns('1h 30min', [{ extraMinutes: 0 }, {}])).toBe('1h 30min');
    expect(durationWithAddOns('1 hour', undefined)).toBe('1 hour');
  });

  it('ignores nonsense minutes rather than shortening the booking', () => {
    expect(addOnExtraMinutes([{ extraMinutes: -20 }, { extraMinutes: Number.NaN }, { extraMinutes: 10 }])).toBe(10);
  });

  it('reads the extra time the way providers and clients see it', () => {
    expect(formatAddOnExtraTime(0)).toBe('');
    expect(formatAddOnExtraTime(15)).toBe('+15 min');
    expect(formatAddOnExtraTime(60)).toBe('+1 hr');
    expect(formatAddOnExtraTime(90)).toBe('+1 hr 30 min');
  });
});

describe('which services an add-on goes on', () => {
  it('starts a new service with the add-ons whose rule covers its category', () => {
    const library = [
      item({ key: 'removal', appliesTo: 'categories', categoryNames: ['Lashes'] }),
      item({ key: 'mask', name: 'Eye mask', appliesTo: 'all' }),
      item({ key: 'tint', name: 'Brow tint', appliesTo: 'services' }),
    ];
    expect(defaultAddOnKeysForCategory(library, 'Lashes')).toEqual(['removal', 'mask']);
    expect(defaultAddOnKeysForCategory(library, 'Brows')).toEqual(['mask']);
  });

  it('applies a rule to every service and drops earlier exceptions', () => {
    const removal = item({ key: 'removal', appliesTo: 'categories', categoryNames: ['Lashes'] });
    const next = applyRuleToServices(menu(), removal);
    expect(next['Lashes']!.every(s => s.addOnKeys!.includes('removal'))).toBe(true);
    expect(next['Brows']![0]!.addOnKeys).toEqual([]);

    const picked = applyRuleToServices(next, { ...removal, appliesTo: 'services' }, [2]);
    expect(picked['Lashes']!.map(s => s.addOnKeys!.includes('removal'))).toEqual([false, true, false]);
  });

  it('names the rule honestly, exceptions included', () => {
    const removal = item({ key: 'removal', appliesTo: 'categories', categoryNames: ['Lashes'] });
    const placed = applyRuleToServices(menu(), removal);
    expect(describeAddOnRule(removal, placed)).toBe('All Lashes');

    placed['Lashes']![1] = { ...placed['Lashes']![1]!, addOnKeys: [] };
    expect(describeAddOnRule(removal, placed)).toBe('All Lashes except 1');

    placed['Brows']![0] = { ...placed['Brows']![0]!, addOnKeys: ['removal'] };
    expect(describeAddOnRule(removal, placed)).toBe('All Lashes except 1 +1 other');

    const tint = item({ key: 'tint', name: 'Brow tint', appliesTo: 'services' });
    expect(describeAddOnRule(tint, menu())).toBe('Not on any service yet');
    const everywhere = item({ key: 'mask', appliesTo: 'all' });
    expect(describeAddOnRule(everywhere, applyRuleToServices(menu(), everywhere))).toBe('Every service');
  });

  it('saves exceptions against real service ids, skipping services with none yet', () => {
    const removal = item({ key: 'removal', appliesTo: 'categories', categoryNames: ['Lashes'] });
    const categories = applyRuleToServices(menu(), removal);
    categories['Lashes']![1] = { ...categories['Lashes']![1]!, addOnKeys: [] }; // unticked on Hybrid
    categories['Brows']![0] = { ...categories['Brows']![0]!, addOnKeys: ['removal'] }; // ticked on Lamination

    const [saved] = buildAddOnSaveItems([removal], categories, s => s.dbId);
    expect(saved).toMatchObject({
      id: 'removal',
      client_key: 'removal',
      applies_to: 'categories',
      category_names: ['Lashes'],
      extra_minutes: 15,
      excluded_service_ids: ['hybrid'],
      included_service_ids: ['lam'],
    });
  });

  it('round-trips: what the database derives from a save matches the ticks', () => {
    const library = [
      item({ key: 'removal', appliesTo: 'categories', categoryNames: ['Lashes'] }),
      item({ key: 'tint', name: 'Brow tint', appliesTo: 'services' }),
    ];
    let categories = applyRuleToServices(menu(), library[0]!);
    categories = applyRuleToServices(categories, library[1]!, [4, 1]);
    categories['Lashes']![2] = { ...categories['Lashes']![2]!, dbId: 'volume', addOnKeys: [] }; // unticked on Volume

    const rows: DbProviderAddOn[] = buildAddOnSaveItems(library, categories, s => s.dbId).map((save, i) => ({
      id: save.client_key,
      provider_id: 'p',
      name: save.name,
      price: save.price,
      description: save.description,
      extra_minutes: save.extra_minutes,
      is_active: save.is_active,
      applies_to: save.applies_to,
      category_names: save.category_names,
      included_service_ids: save.included_service_ids,
      excluded_service_ids: save.excluded_service_ids,
      sort_order: i,
    }));

    for (const [categoryName, services] of Object.entries(categories)) {
      for (const service of services) {
        const derived = addOnKeysForSavedService(rows, { id: service.dbId!, categoryName });
        expect(derived.sort()).toEqual([...service.addOnKeys!].sort());
      }
    }
    // The SQL formula and its app mirror agree on an exception.
    expect(addOnAppliesTo(rows[0]!, { id: 'volume', categoryName: 'Lashes' })).toBe(false);
    expect(addOnAppliesTo(rows[0]!, { id: 'classic', categoryName: 'Lashes' })).toBe(true);
  });

  it('follows a renamed category and lets go of a deleted one', () => {
    const library = [item({ key: 'removal', appliesTo: 'categories', categoryNames: ['Lashes'] })];
    expect(renameCategoryInLibrary(library, 'Lashes', 'Lash extensions')[0]!.categoryNames).toEqual(['Lash extensions']);
    const removed = removeCategoryFromLibrary(library, 'Lashes')[0]!;
    expect(removed.categoryNames).toEqual([]);
    expect(removed.appliesTo).toBe('services');
  });

  it('takes a deleted add-on off every service', () => {
    const categories = applyRuleToServices(menu(), item({ key: 'mask', appliesTo: 'all' }));
    const cleared = removeAddOnFromServices(categories, 'mask');
    expect(Object.values(cleared).flat().every(s => !s.addOnKeys!.includes('mask'))).toBe(true);
  });
});

describe('making an add-on', () => {
  it('suggests ones the provider already has instead of a second copy', () => {
    const library = [item({ key: 'removal' }), item({ key: 'bottom', name: 'Bottom lashes' })];
    expect(suggestAddOns(library, 'rem').map(a => a.key)).toEqual(['removal']);
    expect(suggestAddOns(library, 'LASH').map(a => a.key)).toEqual(['removal', 'bottom']);
    expect(suggestAddOns(library, 'lash', ['removal']).map(a => a.key)).toEqual(['bottom']);
    expect(suggestAddOns(library, '   ')).toEqual([]);
  });

  it('asks for a name, a sensible price and at most 4 hours of extra time', () => {
    const base = { name: 'Lash removal', price: 10, extraMinutes: 15, description: '' };
    expect(validateAddOn(base)).toBeNull();
    expect(validateAddOn({ ...base, name: '  ' })).toBe('Give the add-on a name.');
    expect(validateAddOn({ ...base, price: Number.NaN })).toBe('Give the add-on a price of £0 or more.');
    expect(validateAddOn({ ...base, price: 0 })).toBeNull();
    expect(validateAddOn({ ...base, extraMinutes: 241 })).toBe('Extra time can be up to 4 hours.');
  });
});

describe('universal add-ons migration', () => {
  const sql = readFileSync(
    join(__dirname, '../../supabase/migrations/20261105223541_universal_add_ons.sql'),
    'utf8',
  );

  it('adds the chosen add-ons\' extra time to both server-made end times', () => {
    expect(sql).toContain('make_interval(mins => v_service.duration_minutes + v_add_on_minutes)');
    expect(sql).toContain('make_interval(mins => v_service.duration_minutes + v_extra_minutes + v_add_on_minutes)');
    expect(sql.match(/COALESCE\(sum\(a\.extra_minutes\), 0\)|COALESCE\(SUM\(sao\.extra_minutes\), 0\)/g)).toHaveLength(2);
  });

  it('uses the same placement rule as the app', () => {
    expect(sql).toContain(`SELECT s.id = ANY(pa.included_service_ids)
      OR ((pa.applies_to = 'all'
           OR (pa.applies_to = 'categories' AND s.category_name = ANY(pa.category_names)))
          AND NOT (s.id = ANY(pa.excluded_service_ids)));`);
  });

  it('refuses to apply over a newer live function, and keeps internals private', () => {
    expect(sql.match(/changed live since this migration was written/g)).toHaveLength(3);
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.sync_provider_add_on_links(uuid) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.replace_provider_add_ons(uuid, jsonb) TO authenticated;');
    expect(sql).toContain("IF v_owner <> v_uid THEN RAISE EXCEPTION 'not your provider'; END IF;");
  });

  it('only touches a service\'s add-ons for an older app that still sends them', () => {
    expect(sql).toContain("IF v_svc ? 'add_ons' THEN");
    expect(sql).not.toContain('v_kept_addon_ids');
  });
});

describe('mergeAddOns', () => {
  it('adds new add-ons once, even when they are already in the library', () => {
    const saved = item({ key: 'a1', name: 'Lash removal' });
    const made = item({ key: 'new:1-1', name: 'Bottom lashes' });
    // The render after a service saves: the library has the editor's add-on
    // and the editor still lists it as pending.
    expect(mergeAddOns([saved, made], [made]).map(a => a.key)).toEqual(['a1', 'new:1-1']);
    // A double tap on Save appending the same add-ons again.
    expect(mergeAddOns(mergeAddOns([saved], [made]), [made]).map(a => a.key)).toEqual(['a1', 'new:1-1']);
    expect(mergeAddOns([saved], [made]).map(a => a.key)).toEqual(['a1', 'new:1-1']);
  });
});
