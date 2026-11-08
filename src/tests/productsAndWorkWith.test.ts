// "Products I work with" is its own card (brand chips by category) and its
// own section in Additional Information; "I work with" (clients, skin tones,
// hair types) is edited in About You and also shown in Additional
// Information, never in the About/Policy card.

import * as fs from 'fs';
import * as path from 'path';
import {
  joinProductsUsed,
  productBrandSections,
  splitProductsUsed,
} from '../features/business-details/productBrands';
import { productsGroup, workWithGroups } from '../features/providers/workWith';
import { SKIN_TONES } from '../constants/skinTones';

const read = (...parts: string[]) =>
  fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

describe('product brands', () => {
  it('reads an answer typed into the old free-text box as brand chips', () => {
    expect(splitProductsUsed('charlotte Tilbury, Nars, Laura Mercier, Huda Beauty, Inglot.'))
      .toEqual(['Charlotte Tilbury', 'NARS', 'Laura Mercier', 'Huda Beauty', 'Inglot']);
  });

  it('ignores accents and repeats, and keeps brands it does not know', () => {
    expect(splitProductsUsed('kerastase; Olaplex\nOLAPLEX, My Own Oil'))
      .toEqual(['Kérastase', 'Olaplex', 'My Own Oil']);
  });

  it('saves null for nothing, and one comma-separated line otherwise', () => {
    expect(joinProductsUsed([])).toBeNull();
    expect(joinProductsUsed(['', '  '])).toBeNull();
    expect(joinProductsUsed(['NARS', 'olaplex, Something Else'])).toBe('NARS, Olaplex, Something Else');
  });

  it('offers the brands for the categories the provider works in', () => {
    const makeup = productBrandSections(['MUA']);
    expect(makeup.map(section => section.label)).toEqual(['Makeup']);
    expect(makeup[0]!.brands).toEqual(expect.arrayContaining(['NARS', 'Charlotte Tilbury']));

    const both = productBrandSections(['MUA', 'HAIR']);
    expect(both.map(section => section.category)).toEqual(['HAIR', 'MUA']);
    expect(both[0]!.brands).toContain('Olaplex');

    expect(productBrandSections([]).length).toBeGreaterThan(5);
  });

  it('never offers a prescription-only toxin brand as a chip', () => {
    const offered = productBrandSections([]).flatMap(section => section.brands).map(b => b.toLowerCase());
    for (const brand of ['botox', 'azzalure', 'bocouture', 'dysport', 'xeomin']) {
      expect(offered).not.toContain(brand);
    }
  });
});

describe('what the client sees', () => {
  it('shows "I work with" rows only for what was answered', () => {
    expect(workWithGroups({ clientele: [], skinTonesCatered: [], hairTypesCatered: [] })).toEqual([]);
    expect(workWithGroups({ clientele: ['Women', 'Men'], skinTonesCatered: ['Rich', 'Deep'], hairTypesCatered: [] }))
      .toEqual([
        { label: 'Works with', chips: ['Women', 'Men'] },
        { label: 'Skin tones', chips: ['Deep', 'Rich'] },
      ]);
  });

  it('says "All skin tones" rather than listing all six', () => {
    expect(workWithGroups({ clientele: [], skinTonesCatered: [...SKIN_TONES].reverse(), hairTypesCatered: [] }))
      .toEqual([{ label: 'Skin tones', chips: ['All skin tones'] }]);
  });

  it('gives products their own section, vegan first', () => {
    expect(productsGroup({ productsUsed: 'nars, olaplex', veganCrueltyFree: true }))
      .toEqual({ label: 'Products', chips: ['Vegan & cruelty-free', 'NARS', 'Olaplex'] });
    expect(productsGroup({ productsUsed: '', veganCrueltyFree: false })).toBeNull();
  });

  it('no longer folds products into the Good to know sentence', () => {
    const src = read('screens', 'client', 'ProviderProfileScreen.tsx');
    expect(src).not.toContain('Works with ${');
    expect(src).toContain('productsGroup(provider)');
    expect(src).toContain('groups.push(...workWithGroups(provider))');
    expect(src).not.toContain('WorkWithBlock');
  });
});

describe('one editor per answer', () => {
  const servicesPricing = read('screens', 'provider', 'ServicesPricingScreen.tsx');
  const aboutYou = read('screens', 'provider', 'AboutYouScreen.tsx');

  it('edits who you work with in About You only', () => {
    expect(servicesPricing).not.toMatch(/^\s+clientele,$/m);
    expect(servicesPricing).not.toContain('hair_types_catered:');
    expect(servicesPricing).not.toContain('skin_tones_catered');
    expect(servicesPricing).not.toContain('setClientele');
    expect(aboutYou).toContain('<Card title="I Work With"');
    expect(aboutYou).toMatch(/^\s+clientele,$/m);
    expect(aboutYou).toContain('skin_tones_catered: skinTones.length ? skinTones : null');
  });

  it('keeps products in a card of their own, apart from style', () => {
    expect(servicesPricing).toContain('<Card title="Your Style">');
    expect(servicesPricing).toContain('<Card title="Products I Work With"');
    expect(servicesPricing).toContain('products_used: joinProductsUsed(');
  });
});
