import { buildSpecialityOptions, type SpecialityOptionsInput } from '../features/explore/specialityOptions';
import { SPECIALTIES_MAP } from '../features/business-details/options';

const set = (...v: string[]) => new Set(v);

const barber = { id: 'barber', labels: set('skin fade', 'beard-trim'), names: set('Skin fade', 'Beard trim & shape-up') };
const braider = { id: 'braider', labels: set('knotless', 'goddess-locs'), names: set('Knotless braids') };
const providers = [barber, braider];

const input = (over: Partial<SpecialityOptionsInput> = {}): SpecialityOptionsInput => ({
  category: 'HAIR',
  labelsByProvider: new Map(providers.map(p => [p.id, p.labels])),
  haystackByProvider: new Map(providers.map(p => [p.id, new Set([...p.labels, ...p.names])])),
  narrowedTo: null,
  selected: [],
  ...over,
});

describe('Search speciality options follow the other filters', () => {
  it('shows the full category list with no other filter on', () => {
    const options = buildSpecialityOptions(input());
    expect(options).toEqual(expect.arrayContaining(SPECIALTIES_MAP['HAIR']!));
    expect(options).toEqual(expect.arrayContaining(['Skin Fade', 'Goddess Locs']));
  });

  it("switches to men's specialities when Men is picked", () => {
    const options = buildSpecialityOptions(input({ audience: 'men', narrowedTo: set('barber') }));
    expect(options).toEqual(expect.arrayContaining(['Skin fades', 'Beard trims']));
    expect(options).not.toContain('Bridal & occasion');
    expect(options).not.toContain('Silk press');
  });

  it("drops options nobody left in the results offers, and other providers' tags", () => {
    const options = buildSpecialityOptions(input({ audience: 'men', narrowedTo: set('barber') }));
    expect(options).not.toContain('Hot towel shaves');
    expect(options).not.toContain('Goddess Locs');
  });

  it("uses children's specialities for Kids", () => {
    const options = buildSpecialityOptions(input({ audience: 'kids' }));
    expect(options).toContain("Children's hair");
    expect(options).not.toContain('Barbering & fades');
  });

  it('falls back to the main list for a category with no audience list', () => {
    const options = buildSpecialityOptions(input({ category: 'LASHES', audience: 'kids' }));
    expect(options).toEqual(expect.arrayContaining(SPECIALTIES_MAP['LASHES']!));
  });

  it('keeps a selected speciality even when the filters would hide it', () => {
    const options = buildSpecialityOptions(input({ audience: 'men', narrowedTo: set('barber'), selected: ['Silk press'] }));
    expect(options).toContain('Silk press');
  });
});
