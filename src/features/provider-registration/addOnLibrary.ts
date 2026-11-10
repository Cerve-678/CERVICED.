// Universal add-ons: the provider's one list of add-ons, and which services
// each one goes on.
//
// The source of truth while editing is two things together:
//   1. each add-on's RULE (appliesTo + categoryNames): every service,
//      whole categories, or only services picked by hand; and
//   2. each service's TICKS (ServiceData.addOnKeys): which add-ons are on it.
// A rule change resets the ticks it covers (applyRuleToServices), and a tick
// that disagrees with the rule is an exception. On save, exceptions become
// included_service_ids / excluded_service_ids (buildAddOnSaveItems), and the
// database derives every service's add-ons from those with the same formula
// as addOnAppliesTo below (provider_add_on_applies in
// 20261105223541_universal_add_ons.sql). Keep the two in step.
import type { DbProviderAddOn, ProviderAddOnAppliesTo } from '../../types/database';
import type { ProviderAddOnSaveItem } from '../../services/databaseService';

export const MAX_ADD_ONS = 50;
export const MAX_ADD_ON_EXTRA_MINUTES = 240;
/** The quick picks offered for extra time. Any whole minute 0-240 is valid. */
export const ADD_ON_EXTRA_TIME_CHOICES = [0, 5, 10, 15, 30, 45, 60] as const;

export interface AddOnLibraryItem {
  /** Stable key for this editing session: the saved id, or `new:<n>`. */
  key: string;
  /** provider_add_ons.id, or null until first saved. */
  dbId: string | null;
  name: string;
  price: number;
  description: string;
  extraMinutes: number;
  /** false = paused: hidden from clients on every service. */
  isActive: boolean;
  appliesTo: ProviderAddOnAppliesTo;
  /** Category names, for appliesTo = 'categories'. */
  categoryNames: string[];
}

/** The parts of a service draft this module reads and writes. */
export interface AddOnServiceRef {
  id: number;
  dbId: string | null;
  name: string;
  addOnKeys?: string[];
}

export type AddOnCategories<S extends AddOnServiceRef> = Record<string, S[]>;

let newKeyCounter = 0;
export function newAddOnKey(): string {
  newKeyCounter += 1;
  return `new:${Date.now()}-${newKeyCounter}`;
}

/**
 * The library with `added` on the end, skipping any already in it. The service
 * editor's own new add-ons join the library when the service saves, and stay
 * in the editor's list until its next render, so a plain concatenation showed
 * them twice (duplicate React keys); a double tap on Save appended them twice.
 */
export function mergeAddOns(
  library: readonly AddOnLibraryItem[],
  added: readonly AddOnLibraryItem[],
): AddOnLibraryItem[] {
  const keys = new Set(library.map(item => item.key));
  return [...library, ...added.filter(item => !keys.has(item.key))];
}

/** Whether the rule alone (no exceptions) puts this add-on on a service in
 *  `categoryName`. */
export function ruleCovers(
  item: Pick<AddOnLibraryItem, 'appliesTo' | 'categoryNames'>,
  categoryName: string,
): boolean {
  if (item.appliesTo === 'all') return true;
  if (item.appliesTo === 'categories') return item.categoryNames.includes(categoryName);
  return false;
}

/** Mirrors provider_add_on_applies() in the database: is this saved add-on
 *  on this saved service? */
export function addOnAppliesTo(
  row: Pick<DbProviderAddOn, 'applies_to' | 'category_names' | 'included_service_ids' | 'excluded_service_ids'>,
  service: { id: string; categoryName: string },
): boolean {
  if (row.included_service_ids.includes(service.id)) return true;
  const covered =
    row.applies_to === 'all' ||
    (row.applies_to === 'categories' && row.category_names.includes(service.categoryName));
  return covered && !row.excluded_service_ids.includes(service.id);
}

export function libraryItemFromRow(row: DbProviderAddOn): AddOnLibraryItem {
  return {
    key: row.id,
    dbId: row.id,
    name: row.name,
    price: Number(row.price),
    description: row.description ?? '',
    extraMinutes: Number(row.extra_minutes ?? 0),
    isActive: row.is_active,
    appliesTo: row.applies_to,
    categoryNames: [...row.category_names],
  };
}

/** For a loaded service, the keys of the saved add-ons that are on it. */
export function addOnKeysForSavedService(
  rows: readonly DbProviderAddOn[],
  service: { id: string; categoryName: string },
): string[] {
  return rows.filter(row => addOnAppliesTo(row, service)).map(row => row.id);
}

/** The add-ons a brand-new service in `categoryName` starts with: every one
 *  whose rule already covers that category. */
export function defaultAddOnKeysForCategory(
  library: readonly AddOnLibraryItem[],
  categoryName: string,
): string[] {
  return library.filter(item => ruleCovers(item, categoryName)).map(item => item.key);
}

function mapServices<S extends AddOnServiceRef>(
  categories: AddOnCategories<S>,
  fn: (service: S, categoryName: string) => S,
): AddOnCategories<S> {
  const next: AddOnCategories<S> = {};
  for (const [categoryName, services] of Object.entries(categories)) {
    next[categoryName] = services.map(service => fn(service, categoryName));
  }
  return next;
}

function withKey(keys: readonly string[] | undefined, key: string, on: boolean): string[] {
  const current = keys ?? [];
  const has = current.includes(key);
  if (on === has) return [...current];
  return on ? [...current, key] : current.filter(k => k !== key);
}

/** A rule was set or changed: every service follows the new rule, and any
 *  earlier exceptions for this add-on are dropped. For appliesTo =
 *  'services', `pickedServiceIds` (draft ids) are the services it goes on. */
export function applyRuleToServices<S extends AddOnServiceRef>(
  categories: AddOnCategories<S>,
  item: Pick<AddOnLibraryItem, 'key' | 'appliesTo' | 'categoryNames'>,
  pickedServiceIds: readonly number[] = [],
): AddOnCategories<S> {
  return mapServices(categories, (service, categoryName) => {
    const on = item.appliesTo === 'services'
      ? pickedServiceIds.includes(service.id)
      : ruleCovers(item, categoryName);
    return { ...service, addOnKeys: withKey(service.addOnKeys, item.key, on) };
  });
}

/** Tick or untick one add-on on one service. */
export function setAddOnOnService(keys: readonly string[] | undefined, key: string, on: boolean): string[] {
  return withKey(keys, key, on);
}

/** Take a deleted add-on off every service. */
export function removeAddOnFromServices<S extends AddOnServiceRef>(
  categories: AddOnCategories<S>,
  key: string,
): AddOnCategories<S> {
  return mapServices(categories, service =>
    service.addOnKeys?.includes(key)
      ? { ...service, addOnKeys: service.addOnKeys.filter(k => k !== key) }
      : service,
  );
}

/** A category was renamed: rules naming it follow the new name. */
export function renameCategoryInLibrary(
  library: readonly AddOnLibraryItem[],
  from: string,
  to: string,
): AddOnLibraryItem[] {
  return library.map(item =>
    item.categoryNames.includes(from)
      ? { ...item, categoryNames: item.categoryNames.map(name => (name === from ? to : name)) }
      : item,
  );
}

/** A category was deleted: rules stop naming it. An "All <category>" add-on
 *  left naming nothing becomes a pick-by-hand one, still on whichever other
 *  services it is ticked on, rather than a rule that covers nothing. */
export function removeCategoryFromLibrary(
  library: readonly AddOnLibraryItem[],
  categoryName: string,
): AddOnLibraryItem[] {
  return library.map(item => {
    if (!item.categoryNames.includes(categoryName)) return item;
    const categoryNames = item.categoryNames.filter(name => name !== categoryName);
    return {
      ...item,
      categoryNames,
      appliesTo: item.appliesTo === 'categories' && categoryNames.length === 0 ? 'services' : item.appliesTo,
    };
  });
}

/** Draft ids of the services an add-on is ticked on. */
export function servicesWithAddOn<S extends AddOnServiceRef>(
  categories: AddOnCategories<S>,
  key: string,
): { service: S; categoryName: string }[] {
  const out: { service: S; categoryName: string }[] = [];
  for (const [categoryName, services] of Object.entries(categories)) {
    for (const service of services) {
      if (service.addOnKeys?.includes(key)) out.push({ service, categoryName });
    }
  }
  return out;
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 2) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
}

/** The short chip under an add-on saying where it goes: "Every service",
 *  "All Lashes", "All Lashes except 1", "Hybrid, Volume", "Not on any
 *  service yet". Exceptions are counted against the rule, so the chip never
 *  claims "All Lashes" when one has been unticked. */
export function describeAddOnRule<S extends AddOnServiceRef>(
  item: Pick<AddOnLibraryItem, 'key' | 'appliesTo' | 'categoryNames'>,
  categories: AddOnCategories<S>,
): string {
  const ticked = servicesWithAddOn(categories, item.key);
  if (item.appliesTo === 'services') {
    if (ticked.length === 0) return 'Not on any service yet';
    return joinNames(ticked.map(t => t.service.name || 'Untitled service'));
  }

  let covered = 0;
  let missing = 0;
  let extra = 0;
  for (const [categoryName, services] of Object.entries(categories)) {
    const inRule = ruleCovers(item, categoryName);
    for (const service of services) {
      const on = service.addOnKeys?.includes(item.key) ?? false;
      if (inRule) {
        covered += 1;
        if (!on) missing += 1;
      } else if (on) {
        extra += 1;
      }
    }
  }

  const base = item.appliesTo === 'all'
    ? 'Every service'
    : item.categoryNames.length === 0
      ? 'No categories picked'
      : `All ${joinNames(item.categoryNames)}`;
  const parts = [base];
  if (covered > 0 && missing > 0) parts.push(`except ${missing}`);
  if (extra > 0) parts.push(`+${extra} other`);
  return parts.join(' ');
}

/** Library items whose name contains `query`, for "reuse as you type" in a
 *  service's add-on box. Leaves out the ones already on that service. */
export function suggestAddOns(
  library: readonly AddOnLibraryItem[],
  query: string,
  alreadyOn: readonly string[] = [],
): AddOnLibraryItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return library
    .filter(item => !alreadyOn.includes(item.key) && item.name.toLowerCase().includes(q))
    .slice(0, 4);
}

/** Problems that would stop a save, in the provider's words. */
export function validateAddOn(item: Pick<AddOnLibraryItem, 'name' | 'price' | 'extraMinutes' | 'description'>): string | null {
  const name = item.name.trim();
  if (!name) return 'Give the add-on a name.';
  if (name.length > 80) return 'Add-on names can be up to 80 characters.';
  if (!Number.isFinite(item.price) || item.price < 0) return 'Give the add-on a price of £0 or more.';
  if (item.price > 10000) return 'Add-on prices can be up to £10,000.';
  if (!Number.isInteger(item.extraMinutes) || item.extraMinutes < 0 || item.extraMinutes > MAX_ADD_ON_EXTRA_MINUTES) {
    return 'Extra time can be up to 4 hours.';
  }
  if (item.description.trim().length > 300) return 'Descriptions can be up to 300 characters.';
  return null;
}

/** The replace_provider_add_ons payload. `resolveServiceId` returns a
 *  service's saved id (after the catalogue save has created any new ones),
 *  or null if it has none, in which case it can't carry an exception. */
export function buildAddOnSaveItems<S extends AddOnServiceRef>(
  library: readonly AddOnLibraryItem[],
  categories: AddOnCategories<S>,
  resolveServiceId: (service: S, categoryName: string) => string | null,
): ProviderAddOnSaveItem[] {
  return library.map(item => {
    const included: string[] = [];
    const excluded: string[] = [];
    for (const [categoryName, services] of Object.entries(categories)) {
      const inRule = ruleCovers(item, categoryName);
      for (const service of services) {
        const id = resolveServiceId(service, categoryName);
        if (!id) continue;
        const on = service.addOnKeys?.includes(item.key) ?? false;
        if (on && !inRule) included.push(id);
        if (!on && inRule) excluded.push(id);
      }
    }
    return {
      id: item.dbId,
      client_key: item.key,
      name: item.name.trim(),
      price: item.price,
      description: item.description.trim() || null,
      extra_minutes: item.extraMinutes,
      is_active: item.isActive,
      applies_to: item.appliesTo,
      category_names: item.appliesTo === 'categories' ? [...item.categoryNames] : [],
      included_service_ids: included,
      excluded_service_ids: excluded,
    };
  });
}
