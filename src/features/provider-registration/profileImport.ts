// Folds what the Import box read from a price list (see
// supabase/functions/extract-provider-profile) into Info Reg's form, without
// throwing away anything already there:
//
//   - business details only fill fields that are still blank;
//   - services are added, never replaced: a category with the same name gets
//     the services it doesn't already have, by name;
//   - add-ons join the provider's add-on list the same way, ticked on the
//     services their rule covers;
//   - policy wording, notice periods and grace minutes fill in, but nothing
//     that charges a card (fees, deposits, penalties) is ever set from an
//     import. Those are listed for a person to set in Policies/Payments.
//
// Nothing here saves. The person checks the form and taps Save & Publish.
import type { ServiceData, ProviderRegistrationData } from '../../services/providerRegistrationService';
import type { ImportedAddOn, ImportedPolicies, ImportedProfile } from '../../types/profileImport';
import type { NoticeChoice } from '../../utils/policyDisplay';
import {
  MAX_ADD_ONS,
  MAX_ADD_ON_EXTRA_MINUTES,
  applyRuleToServices,
  defaultAddOnKeysForCategory,
  newAddOnKey,
  validateAddOn,
  type AddOnLibraryItem,
} from './addOnLibrary';

/** Length given to a service the source didn't time. Flagged in the summary. */
export const IMPORT_DEFAULT_DURATION = '1 hr';

export interface ProfileImportSummary {
  /** Labels of business details that were blank and are now filled. */
  detailsFilled: string[];
  categoriesAdded: number;
  servicesAdded: number;
  /** Already on the form under the same name, so left alone. */
  servicesSkipped: number;
  servicesWithoutPrice: number;
  servicesWithoutLength: number;
  addOnsAdded: number;
  addOnsSkipped: number;
  /** The add-on list didn't load, so none could be added safely. */
  addOnsUnavailable: boolean;
  /** Plain lines describing the policies that were filled in. */
  policyLines: string[];
  /** Fees and deposits the source mentions, for a person to set. */
  feesAndDeposits: string[];
  unclear: string;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function newService(id: number, svc: { name?: string; price?: number | string; duration?: string; description?: string }): ServiceData {
  return {
    id,
    dbId: null,
    name: (svc.name ?? '').trim() || 'Unnamed service',
    price: Number(svc.price) || 0,
    duration: svc.duration?.trim() || IMPORT_DEFAULT_DURATION,
    bufferBeforeMins: null,
    bufferAfterMins: null,
    description: svc.description?.trim() ?? '',
    images: [],
    addOnKeys: [],
    tags: [],
    techniqueTags: [],
    outcomeTags: [],
    occasionTags: [],
    trendNames: [],
    // Safe/off by default, the same as a service added by hand: the toggle
    // flags a service as unsafe, so nothing is labelled "not recommended
    // during pregnancy" unless the provider says so.
    isPregnancySafe: true,
    patchTestRequired: false,
    minAge: null,
    contraindications: [],
    aftercareNotes: '',
    serviceType: '',
    hairTypesSuitable: [],
    audience: '',
  };
}

const DETAIL_FIELDS: Array<{ key: 'providerName' | 'location' | 'aboutText' | 'phone' | 'email' | 'instagram' | 'website' | 'tiktok'; label: string }> = [
  { key: 'providerName', label: 'Business name' },
  { key: 'location', label: 'Location' },
  { key: 'aboutText', label: 'About' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'website', label: 'Website' },
];

function toLibraryItem(addOn: ImportedAddOn, categoryNames: string[]): AddOnLibraryItem {
  const minutes = Math.round(addOn.extraMinutes ?? 0);
  return {
    key: newAddOnKey(),
    dbId: null,
    name: addOn.name.trim().slice(0, 80),
    price: addOn.price !== null && Number.isFinite(addOn.price) ? Math.max(0, addOn.price) : 0,
    description: addOn.description.trim().slice(0, 300),
    extraMinutes: Math.min(Math.max(minutes, 0), MAX_ADD_ON_EXTRA_MINUTES),
    isActive: true,
    // No categories named means it's offered on everything. Named ones that
    // match nothing on the form put it on no service, which the person sees
    // and fixes, rather than guessing it onto the wrong menu.
    appliesTo: addOn.categories.length === 0 ? 'all' : 'categories',
    categoryNames,
  };
}

export function mergeImportedProfile(
  prev: ProviderRegistrationData,
  imported: ImportedProfile,
): { data: ProviderRegistrationData; summary: Omit<ProfileImportSummary, 'policyLines'> } {
  const data: ProviderRegistrationData = { ...prev };
  const detailsFilled: string[] = [];
  for (const { key, label } of DETAIL_FIELDS) {
    const value = imported[key]?.trim();
    if (value && !prev[key]?.trim()) {
      data[key] = value;
      detailsFilled.push(label);
    }
  }

  // Services ─────────────────────────────────────────────────────────────
  const categories: Record<string, ServiceData[]> = { ...prev.categories };
  const categoryServiceTypes = { ...prev.categoryServiceTypes };
  const existingByNorm = new Map(Object.keys(categories).map(name => [norm(name), name]));
  // A new category goes under the imported type only if this provider offers
  // it (the set is locked from sign-up); otherwise under their headline type.
  const typeForNew = imported.serviceCategory && prev.serviceCategories.includes(imported.serviceCategory)
    ? imported.serviceCategory
    : prev.providerService;
  let nextId = Math.max(0, ...Object.values(prev.categories).flat().map(s => s.id)) + 1;
  let categoriesAdded = 0;
  let servicesAdded = 0;
  let servicesSkipped = 0;
  let servicesWithoutPrice = 0;
  let servicesWithoutLength = 0;
  const addedServiceIds = new Set<number>();

  for (const [rawName, services] of Object.entries(imported.categories ?? {})) {
    const importedName = rawName.trim() || 'Services';
    let name = existingByNorm.get(norm(importedName));
    if (!name) {
      name = importedName;
      categories[name] = [];
      categoryServiceTypes[name] = typeForNew;
      existingByNorm.set(norm(name), name);
      categoriesAdded += 1;
    }
    const list = [...(categories[name] ?? [])];
    const namesHere = new Set(list.map(s => norm(s.name)));
    for (const svc of services) {
      const service = newService(nextId, svc);
      if (namesHere.has(norm(service.name))) { servicesSkipped += 1; continue; }
      nextId += 1;
      namesHere.add(norm(service.name));
      if (!(Number(svc.price) > 0)) servicesWithoutPrice += 1;
      if (!svc.duration?.trim()) servicesWithoutLength += 1;
      list.push(service);
      addedServiceIds.add(service.id);
      servicesAdded += 1;
    }
    categories[name] = list;
  }

  // Add-ons ──────────────────────────────────────────────────────────────
  const importedAddOns = imported.addOns ?? [];
  let addOnsAdded = 0;
  let addOnsSkipped = 0;
  let library = prev.addOnLibrary;
  let withAddOns: Record<string, ServiceData[]> = categories;
  if (library) {
    const taken = new Set(library.map(item => norm(item.name)));
    const added: AddOnLibraryItem[] = [];
    for (const addOn of importedAddOns) {
      const matched = addOn.categories
        .map(c => existingByNorm.get(norm(c)))
        .filter((c): c is string => !!c);
      const item = toLibraryItem(addOn, [...new Set(matched)]);
      if (taken.has(norm(item.name)) || validateAddOn(item) || library.length + added.length >= MAX_ADD_ONS) {
        addOnsSkipped += 1;
        continue;
      }
      taken.add(norm(item.name));
      added.push(item);
    }
    library = [...library, ...added];
    addOnsAdded = added.length;
    // New services start with whichever add-ons already cover their category,
    // the same as a service added by hand; new add-ons then tick themselves on
    // every service their rule covers.
    withAddOns = Object.fromEntries(Object.entries(categories).map(([categoryName, list]) => [
      categoryName,
      list.map(s => addedServiceIds.has(s.id)
        ? { ...s, addOnKeys: defaultAddOnKeysForCategory(prev.addOnLibrary ?? [], categoryName) }
        : s),
    ]));
    for (const item of added) withAddOns = applyRuleToServices(withAddOns, item);
  }

  data.categories = withAddOns;
  data.categoryServiceTypes = categoryServiceTypes;
  if (library) data.addOnLibrary = library;

  return {
    data,
    summary: {
      detailsFilled,
      categoriesAdded,
      servicesAdded,
      servicesSkipped,
      servicesWithoutPrice,
      servicesWithoutLength,
      addOnsAdded,
      addOnsSkipped: library ? addOnsSkipped : 0,
      addOnsUnavailable: !prev.addOnLibrary && importedAddOns.length > 0,
      feesAndDeposits: imported.policies?.feesAndDeposits ?? [],
      unclear: imported.unclear?.trim() ?? '',
    },
  };
}

// ── Policies ────────────────────────────────────────────────────────────────

/** The booking_policies keys an import may fill. Deliberately none that charge
 *  money: cancelPenalty, cancelCustomFee, noShowAction, lateFee, noShowFee and
 *  every deposit key stay exactly as they were. */
export interface ImportablePolicyFields {
  cancelNotice?: NoticeChoice;
  rescheduleNotice?: 'same_day' | '24h' | '48h' | '72h';
  maxReschedules?: '1' | '2';
  noShowGraceMinutes?: string;
  cancelNote?: string;
  rescheduleNote?: string;
  noShowNote?: string;
  refundPolicyNote?: string;
  travelPolicy?: string;
  bookingInstructions?: string;
}

const NOTICE_BY_HOURS: Record<number, NoticeChoice> = { 12: '12h', 24: '24h', 48: '48h', 72: '72h' };
const RESCHEDULE_BY_HOURS: Record<number, 'same_day' | '24h' | '48h' | '72h'> = { 0: 'same_day', 24: '24h', 48: '48h', 72: '72h' };

/**
 * What to spread onto Info Reg's policies. `onFile` says whether the provider
 * already has saved policies: without them, the form is sitting on defaults
 * nobody chose, so what the price list says wins; with them, only blank notes
 * fill in and their chosen settings are left alone.
 */
export function policyFieldsFromImport(
  current: Record<string, unknown>,
  imported: ImportedPolicies | undefined,
  onFile: boolean,
): { fields: ImportablePolicyFields; lines: string[] } {
  const fields: ImportablePolicyFields = {};
  const lines: string[] = [];
  if (!imported) return { fields, lines };
  const blank = (key: keyof ImportablePolicyFields) => {
    const value = current[key];
    return typeof value !== 'string' || !value.trim();
  };

  if (!onFile) {
    const notice = imported.cancelNoticeHours !== null ? NOTICE_BY_HOURS[imported.cancelNoticeHours] : undefined;
    if (notice) {
      fields.cancelNotice = notice;
      lines.push(`Cancellations: ${imported.cancelNoticeHours} hours' notice`);
    }
    const reschedule = imported.rescheduleNoticeHours !== null ? RESCHEDULE_BY_HOURS[imported.rescheduleNoticeHours] : undefined;
    if (reschedule) {
      fields.rescheduleNotice = reschedule;
      lines.push(reschedule === 'same_day' ? 'Reschedules: same day is fine' : `Reschedules: ${imported.rescheduleNoticeHours} hours' notice`);
    }
    if (imported.maxReschedules === 1 || imported.maxReschedules === 2) {
      fields.maxReschedules = String(imported.maxReschedules) as '1' | '2';
      lines.push(`Up to ${imported.maxReschedules} reschedule${imported.maxReschedules === 1 ? '' : 's'}`);
    }
    if (imported.lateGraceMinutes !== null && imported.lateGraceMinutes >= 0 && imported.lateGraceMinutes <= 120) {
      fields.noShowGraceMinutes = String(Math.round(imported.lateGraceMinutes));
      lines.push(`Running late: ${fields.noShowGraceMinutes} minutes' grace`);
    }
  }

  const notes: Array<[keyof ImportablePolicyFields, string, string]> = [
    ['cancelNote', imported.cancellationNote, 'Cancellation note'],
    ['rescheduleNote', imported.rescheduleNote, 'Reschedule note'],
    ['noShowNote', imported.noShowNote, 'No-show note'],
    ['refundPolicyNote', imported.refundNote, 'Refund policy'],
    ['travelPolicy', imported.travelNote, 'Travel policy'],
  ];
  for (const [key, value, label] of notes) {
    if (value.trim() && (!onFile || blank(key))) {
      (fields as Record<string, string>)[key] = value.trim();
      lines.push(label);
    }
  }

  if (imported.bookingInstructions.length > 0) {
    const saved = current['bookingInstructions'];
    const existing = typeof saved === 'string' ? saved.trim() : '';
    const fresh = imported.bookingInstructions.filter(line => !existing.includes(line));
    if (fresh.length > 0) {
      fields.bookingInstructions = [existing, ...fresh].filter(Boolean).join('\n');
      lines.push(`${fresh.length} booking instruction${fresh.length === 1 ? '' : 's'}`);
    }
  }

  return { fields, lines };
}
