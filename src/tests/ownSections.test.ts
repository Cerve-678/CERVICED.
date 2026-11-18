import { readFileSync } from 'fs';
import { join } from 'path';
import {
  OWN_SECTION_KINDS,
  OWN_SECTION_LIMITS,
  filledOwnSections,
  hasHalfFilledFaq,
  normalizeOwnSections,
} from '../features/providers/ownSections';
import { PAGE_SECTION_TITLES, chapterHeading, headingPair } from '../constants/pageStyles';
import { mapProviderProfileData } from '../features/providers/profileMapper';

const read = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8');

describe('normalizeOwnSections', () => {
  it('keeps the known sections, trimmed, and drops everything else', () => {
    expect(normalizeOwnSections({
      keyInfo: '  Free street parking  ',
      aftercare: '   ',
      houseRules: 42,
      disclaimer: 'Results vary.',
      secretAddress: '1 High Street',
    })).toEqual({ keyInfo: 'Free street parking', disclaimer: 'Results vary.' });
  });

  it('keeps only questions that have an answer, up to the limit', () => {
    const faq = Array.from({ length: 14 }, (_, i) => ({ question: `Q${i}`, answer: `A${i}` }));
    faq.splice(1, 0, { question: 'No answer', answer: ' ' }, 'junk' as never);
    const out = normalizeOwnSections({ faq });
    expect(out.faq).toHaveLength(OWN_SECTION_LIMITS.faqItems);
    expect(out.faq![0]).toEqual({ question: 'Q0', answer: 'A0' });
    expect(out.faq!.some(item => item.question === 'No answer')).toBe(false);
  });

  it('caps the length of each text', () => {
    const out = normalizeOwnSections({ keyInfo: 'x'.repeat(5000), faq: [{ question: 'q'.repeat(500), answer: 'a' }] });
    expect(out.keyInfo).toHaveLength(OWN_SECTION_LIMITS.text);
    expect(out.faq![0]!.question).toHaveLength(OWN_SECTION_LIMITS.question);
  });

  it('is empty for anything that is not an object', () => {
    expect(normalizeOwnSections(null)).toEqual({});
    expect(normalizeOwnSections([])).toEqual({});
    expect(normalizeOwnSections('text')).toEqual({});
  });
});

describe('filledOwnSections / hasHalfFilledFaq', () => {
  it('lists filled sections in profile order', () => {
    expect(filledOwnSections({ disclaimer: 'd', faq: [{ question: 'q', answer: 'a' }], keyInfo: 'k' }))
      .toEqual(['keyInfo', 'faq', 'disclaimer']);
  });

  it('spots a question without an answer, or an answer without a question', () => {
    expect(hasHalfFilledFaq([{ question: 'q', answer: '' }])).toBe(true);
    expect(hasHalfFilledFaq([{ question: ' ', answer: 'a' }])).toBe(true);
    expect(hasHalfFilledFaq([{ question: 'q', answer: 'a' }, { question: '', answer: '' }])).toBe(false);
    expect(hasHalfFilledFaq(undefined)).toBe(false);
  });
});

describe('own sections on the profile', () => {
  it('each one has a heading in every page style', () => {
    for (const kind of OWN_SECTION_KINDS) {
      expect(PAGE_SECTION_TITLES[kind]).toBeTruthy();
      expect(headingPair(kind)).toHaveLength(2);
      expect(chapterHeading(kind)[0]).toMatch(/^Chapter [IVX]+$/);
    }
  });

  it('the mapper reads them cleaned from providers.profile_sections', () => {
    const provider = mapProviderProfileData({
      slug: 's', display_name: 'S', service_category: 'Nails', services: [],
      profile_sections: { aftercare: ' Keep dry ', other: 'x' },
    } as any);
    expect(provider.ownSections).toEqual({ aftercare: 'Keep dry' });
  });

  it('is in the public profile select and drawn after Additional Information', () => {
    expect(read('services/databaseService.ts')).toMatch(/PROVIDER_PROFILE_PUBLIC_FIELDS = `[\s\S]*?\bprofile_sections,[\s\S]*?`;/);
    const screen = read('screens/client/ProviderProfileScreen.tsx');
    expect(screen.indexOf('<ProviderOwnSections')).toBeGreaterThan(screen.indexOf('<ProviderAdditionalInfoSection'));
  });

  it('is saved cleaned, and only when it changed', () => {
    expect(read('services/databaseService.ts')).toMatch(/update\(\{ profile_sections: normalizeOwnSections\(sections\) \}\)/);
    expect(read('screens/provider/PoliciesScreen.tsx')).toMatch(/JSON\.stringify\(normalizeOwnSections\(ownDraft\)\) !== loadedOwn/);
  });
});
