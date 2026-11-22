// More answers in every Beauty Profile section (owner, 2026-11-18), and the
// whole Your look card opening Style & vibe.
import * as options from '../features/beauty-profile/options';
import { tailoredOptions } from '../features/beauty-profile/tailoredOptions';
import { AESTHETICS_BY_VIBE, STYLE_AESTHETICS, STYLE_VIBES } from '../features/beauty-profile/options';
import { EMPTY_BEAUTY_DATA, type BeautyData } from '../types/beautyProfile';

const profile = (p: Partial<BeautyData>): BeautyData => ({ ...EMPTY_BEAUTY_DATA, ...p });

describe('Beauty Profile options', () => {
  it('has no repeated answer in any list', () => {
    for (const [name, value] of Object.entries(options)) {
      if (!Array.isArray(value)) continue;
      const names = value.map((v: string | { name: string }) => (typeof v === 'string' ? v : v.name));
      expect({ name, size: new Set(names).size }).toEqual({ name, size: names.length });
    }
  });

  it('keeps the "none" answers last', () => {
    expect(options.SKIN_CONCERNS[options.SKIN_CONCERNS.length - 1]).toBe('None');
    expect(options.TREATMENT_HISTORY[options.TREATMENT_HISTORY.length - 1]).toBe('None');
    expect(options.SENSITIVE_AREAS[options.SENSITIVE_AREAS.length - 1]).toBe('None');
    expect(options.ALLERGENS[options.ALLERGENS.length - 1]).toBe('None known');
  });

  it('only points a vibe at aesthetics that exist, and every vibe has some', () => {
    const names = STYLE_AESTHETICS.map(a => a.name);
    for (const vibe of STYLE_VIBES) {
      expect({ vibe, any: (AESTHETICS_BY_VIBE[vibe] ?? []).length > 0 }).toEqual({ vibe, any: true });
      for (const a of AESTHETICS_BY_VIBE[vibe] ?? []) expect(names).toContain(a);
    }
  });

  it('follows the new skin types and vibes', () => {
    const mature = tailoredOptions('skinConcerns', profile({ skinType: ['Mature'] }));
    expect(mature.because).toBe('your mature skin');
    expect(mature.suited).toContain('Loss of firmness');
    expect(tailoredOptions('makeupLips', profile({ styleVibe: ['Edgy'] })).suited).toContain('Dark / vampy');
    expect(tailoredOptions('browStyle', profile({ browCondition: ['Grey / white hairs'] })).suited).toContain('Tinted');
  });
});
