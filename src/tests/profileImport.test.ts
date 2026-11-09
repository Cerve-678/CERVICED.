// The Info Reg Import box folds a read price list into the form. It must add,
// never replace, and must never set anything that charges a card.
import {
  IMPORT_DEFAULT_DURATION,
  mergeImportedProfile,
  policyFieldsFromImport,
} from '../features/provider-registration/profileImport';
import type { ProviderRegistrationData, ServiceData } from '../services/providerRegistrationService';
import type { AddOnLibraryItem } from '../features/provider-registration/addOnLibrary';
import type { ImportedPolicies, ImportedProfile } from '../types/profileImport';

function service(id: number, name: string, extra: Partial<ServiceData> = {}): ServiceData {
  return {
    id, dbId: null, name, price: 30, duration: '1 hr', bufferBeforeMins: null, bufferAfterMins: null,
    description: '', images: [], addOnKeys: [], tags: [], techniqueTags: [], outcomeTags: [],
    occasionTags: [], trendNames: [], isPregnancySafe: true, patchTestRequired: false, minAge: null,
    contraindications: [], aftercareNotes: '', serviceType: '', hairTypesSuitable: [], audience: '',
    ...extra,
  };
}

function form(overrides: Partial<ProviderRegistrationData> = {}): ProviderRegistrationData {
  return {
    providerName: 'Glow Studio',
    providerService: 'NAILS',
    serviceCategories: ['NAILS', 'LASHES'],
    location: '',
    aboutText: '',
    phone: '07000 000000',
    email: '',
    instagram: '',
    website: '',
    tiktok: '',
    categories: { 'Gel Nails': [service(4, 'Gel Manicure')] },
    categoryServiceTypes: { 'Gel Nails': 'NAILS' },
    addOnLibrary: [],
    ...overrides,
  } as unknown as ProviderRegistrationData;
}

const policies = (p: Partial<ImportedPolicies> = {}): ImportedPolicies => ({
  cancelNoticeHours: null, cancellationNote: '', rescheduleNoticeHours: null, maxReschedules: null,
  rescheduleNote: '', lateGraceMinutes: null, noShowNote: '', refundNote: '', travelNote: '',
  bookingInstructions: [], feesAndDeposits: [], ...p,
});

describe('mergeImportedProfile', () => {
  const imported: ImportedProfile = {
    providerName: 'Someone Else Ltd',
    location: 'Hackney, London',
    phone: '07999 999999',
    instagram: '@glowstudio',
    serviceCategory: 'NAILS',
    categories: {
      'gel nails': [{ name: 'gel manicure', price: 35 }, { name: 'Gel Pedicure', price: 40, duration: '45 mins' }],
      Acrylics: [{ name: 'Full Set', price: 0 }],
    },
    addOns: [
      { name: 'French tips', price: 5, extraMinutes: 10, description: '', categories: ['Acrylics'] },
      { name: 'Removal', price: 10, extraMinutes: 15, description: '', categories: [] },
    ],
  };

  it('fills only blank details and keeps what is already there', () => {
    const { data, summary } = mergeImportedProfile(form(), imported);
    expect(data.providerName).toBe('Glow Studio');
    expect(data.phone).toBe('07000 000000');
    expect(data.location).toBe('Hackney, London');
    expect(data.instagram).toBe('@glowstudio');
    expect(summary.detailsFilled).toEqual(['Location', 'Instagram']);
  });

  it('adds services into a same-named category without duplicating, with fresh ids', () => {
    const { data, summary } = mergeImportedProfile(form(), imported);
    expect(Object.keys(data.categories)).toEqual(['Gel Nails', 'Acrylics']);
    expect(data.categories['Gel Nails']!.map(s => s.name)).toEqual(['Gel Manicure', 'Gel Pedicure']);
    expect(data.categories['Gel Nails']![0]!.price).toBe(30);
    const ids = Object.values(data.categories).flat().map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.min(...ids.filter(id => id !== 4))).toBeGreaterThan(4);
    expect(data.categoryServiceTypes['Acrylics']).toBe('NAILS');
    expect(summary).toMatchObject({
      servicesAdded: 2, servicesSkipped: 1, categoriesAdded: 1,
      servicesWithoutPrice: 1, servicesWithoutLength: 1,
    });
    expect(data.categories['Acrylics']![0]!.duration).toBe(IMPORT_DEFAULT_DURATION);
  });

  it('files a new category under the headline type when the read type is not offered', () => {
    const { data } = mergeImportedProfile(form(), { ...imported, serviceCategory: 'HAIR' });
    expect(data.categoryServiceTypes['Acrylics']).toBe('NAILS');
  });

  it('adds add-ons and ticks them on the services their rule covers', () => {
    const { data, summary } = mergeImportedProfile(form(), imported);
    const library = data.addOnLibrary!;
    expect(library.map(a => a.name)).toEqual(['French tips', 'Removal']);
    const french = library[0]!;
    const removal = library[1]!;
    expect(french).toMatchObject({ appliesTo: 'categories', categoryNames: ['Acrylics'], price: 5, extraMinutes: 10 });
    expect(removal.appliesTo).toBe('all');
    expect(data.categories['Acrylics']![0]!.addOnKeys).toEqual([french.key, removal.key]);
    expect(data.categories['Gel Nails']![0]!.addOnKeys).toEqual([removal.key]);
    expect(summary.addOnsAdded).toBe(2);
  });

  it('skips an add-on already on the list, by name', () => {
    const existing: AddOnLibraryItem = {
      key: 'a1', dbId: 'a1', name: 'removal', price: 8, description: '', extraMinutes: 0,
      isActive: true, appliesTo: 'all', categoryNames: [],
    };
    const { data, summary } = mergeImportedProfile(form({ addOnLibrary: [existing] }), imported);
    expect(data.addOnLibrary!.map(a => a.name)).toEqual(['removal', 'French tips']);
    expect(summary.addOnsSkipped).toBe(1);
  });

  it('adds no add-ons when the list did not load, and says so', () => {
    const base = form();
    delete (base as Partial<ProviderRegistrationData>).addOnLibrary;
    const { data, summary } = mergeImportedProfile(base, imported);
    expect(data.addOnLibrary).toBeUndefined();
    expect(summary.addOnsUnavailable).toBe(true);
    expect(summary.addOnsAdded).toBe(0);
  });

  it('does not change the form it was given', () => {
    const base = form();
    const before = JSON.stringify(base);
    mergeImportedProfile(base, imported);
    expect(JSON.stringify(base)).toBe(before);
  });
});

describe('policyFieldsFromImport', () => {
  const read = policies({
    cancelNoticeHours: 48,
    rescheduleNoticeHours: 24,
    maxReschedules: 1,
    lateGraceMinutes: 15,
    cancellationNote: 'Cancel by message only.',
    refundNote: 'No refunds on completed services.',
    bookingInstructions: ['Come with hair washed.'],
    feesAndDeposits: ['£10 late fee after 15 minutes', '£20 non-refundable deposit'],
  });

  it('never sets a fee, penalty or deposit', () => {
    const { fields } = policyFieldsFromImport({}, read, false);
    for (const key of ['cancelPenalty', 'cancelCustomFee', 'noShowAction', 'lateFee', 'noShowFee', 'depositRequired', 'depositAmount', 'depositNonRefundable']) {
      expect(fields).not.toHaveProperty(key);
    }
  });

  it('fills settings and wording over unsaved defaults', () => {
    const { fields, lines } = policyFieldsFromImport({ cancelNotice: '24h', cancelNote: '' }, read, false);
    expect(fields).toMatchObject({
      cancelNotice: '48h',
      rescheduleNotice: '24h',
      maxReschedules: '1',
      noShowGraceMinutes: '15',
      cancelNote: 'Cancel by message only.',
      refundPolicyNote: 'No refunds on completed services.',
      bookingInstructions: 'Come with hair washed.',
    });
    expect(lines).toContain("Cancellations: 48 hours' notice");
  });

  it('leaves saved choices alone and only fills blank notes once policies are on file', () => {
    const { fields } = policyFieldsFromImport(
      { cancelNotice: '24h', cancelNote: 'My own words.', refundPolicyNote: '', bookingInstructions: 'Arrive early.' },
      read,
      true,
    );
    expect(fields).not.toHaveProperty('cancelNotice');
    expect(fields).not.toHaveProperty('noShowGraceMinutes');
    expect(fields).not.toHaveProperty('cancelNote');
    expect(fields.refundPolicyNote).toBe('No refunds on completed services.');
    expect(fields.bookingInstructions).toBe('Arrive early.\nCome with hair washed.');
  });

  it('ignores a notice period the Policies screen has no choice for', () => {
    const { fields } = policyFieldsFromImport({}, policies({ cancelNoticeHours: 168 }), false);
    expect(fields).not.toHaveProperty('cancelNotice');
  });
});
