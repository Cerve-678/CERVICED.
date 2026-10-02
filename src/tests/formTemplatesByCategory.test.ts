import {
  declaredCategories,
  detectTemplate,
  getRelevantTemplates,
} from '../features/intake-forms/formTemplates';

const ids = (cats: string[], services: string[] = []) =>
  getRelevantTemplates(cats, services).map(t => t.id);

describe('form templates follow the provider\'s service type', () => {
  it('offers a nail tech only nail templates, even when a service name sounds like another trade', () => {
    expect(ids(['NAILS'], ['Acrylic extension', 'Gel removal', 'Cuticle care'])).toEqual(['nails']);
  });

  it('offers a lash artist the lash consultation and the lash patch test, nothing else', () => {
    expect(ids(['LASHES'], []).sort()).toEqual(['lashes', 'patchtest-lashes']);
  });

  it('offers every declared type\'s templates to a multi-type provider', () => {
    const got = ids(['LASHES', 'BROWS']);
    expect(got).toEqual(expect.arrayContaining(['lashes', 'patchtest-lashes', 'brows', 'patchtest-brows']));
    expect(got).not.toContain('hair');
    expect(got).not.toContain('skin');
  });

  it('maps Aesthetics to the skin consultation, patch test and medical history', () => {
    expect(ids(['AESTHETICS']).sort()).toEqual(['medicalhistory-skin', 'patchtest-skin', 'skin']);
  });

  it('ranks by service names inside the provider\'s own type', () => {
    expect(ids(['HAIR'], [])[0]).toBe('hair');
    expect(ids(['HAIR'], ['Bleach'])[0]).toBe('patchtest-hair');
  });

  it('falls back to one general form, not every trade\'s, for a type with no templates', () => {
    expect(ids(['OTHER'], ['Massage'])).toEqual(['general']);
    expect(ids(['MALE'])).toEqual(['general']);
    expect(ids([])).toEqual(['general']);
  });
});

describe('declaredCategories', () => {
  it('uses the full declared set, upper-cased, when there is one', () => {
    expect(declaredCategories('lashes', ['LASHES', 'brows'])).toEqual(['LASHES', 'BROWS']);
  });
  it('falls back to the single category for rows that predate the set', () => {
    expect(declaredCategories('NAILS', null)).toEqual(['NAILS']);
    expect(declaredCategories('NAILS', [])).toEqual(['NAILS']);
  });
  it('is empty when nothing is known', () => {
    expect(declaredCategories(null, undefined)).toEqual([]);
  });
});

describe('detectTemplate', () => {
  const nails = getRelevantTemplates(['NAILS'], []);

  it('never suggests a form for a trade the provider does not practise', () => {
    expect(detectTemplate('Hair colour', nails)).toBeNull();
  });
  it('suggests the consultation form for a matching booked service', () => {
    expect(detectTemplate('Gel manicure', nails)?.id).toBe('nails');
  });
  it('matches word starts, not the middle of a word', () => {
    const hair = getRelevantTemplates(['HAIR'], []);
    expect(detectTemplate('Called back appointment', hair)).toBeNull();
  });
});
