import { tailoredOptions } from '../features/beauty-profile/tailoredOptions';
import {
  BROW_STYLES, LASH_STYLES, MAKEUP_FINISH, NAIL_SHAPES, SCALP_CONDITIONS, SKIN_CONCERNS, TREATMENT_HISTORY,
} from '../features/beauty-profile/options';
import { suitedIdeas } from '../features/beauty-profile/suitedIdeas';
import { EMPTY_BEAUTY_DATA, type BeautyData } from '../types/beautyProfile';

const profile = (p: Partial<BeautyData>): BeautyData => ({ ...EMPTY_BEAUTY_DATA, ...p });

describe('the Beauty Profile follows earlier answers', () => {
  it('gives 4C hair the scalp and edge answers that fit it, first', () => {
    const { suited, because } = tailoredOptions('scalpCondition', profile({ hairType: ['4C'] }));
    expect(because).toBe('your 4C hair');
    expect(suited).toEqual(['Dry', 'Itchy', 'Product build-up', 'Thinning edges', 'Tension from styles', 'Flaky']);
  });

  it('gives 4C hair natural, relaxed, silk press and protective-style history first', () => {
    const { suited } = tailoredOptions('treatmentHistory', profile({ hairType: ['4B', '4C'] }));
    expect(suited.slice(0, 4)).toEqual(['Natural (never relaxed)', 'Relaxed / permed', 'Texturised', 'Silk pressed']);
    expect(suited).toContain('Braids / twists');
    expect(suited).not.toContain('Keratin / smoothing');
  });

  it('names both hair types when they picked two', () => {
    expect(tailoredOptions('hairGoals', profile({ hairType: ['4B', '4C'] })).because).toBe('your 4B & 4C hair');
    expect(tailoredOptions('hairGoals', profile({ hairType: ['Curly'] })).because).toBe('your curly hair');
  });

  it('gives straight hair oily scalp and colour first, not edges', () => {
    const scalp = tailoredOptions('scalpCondition', profile({ hairType: ['Straight'] }));
    expect(scalp.suited[0]).toBe('Oily');
    expect(scalp.suited).not.toContain('Thinning edges');
    expect(tailoredOptions('treatmentHistory', profile({ hairType: ['Straight'] })).suited).toContain('Keratin / smoothing');
  });

  it('never hides an option: suited and the rest together are the whole list', () => {
    const d = profile({ hairType: ['4C'], skinType: ['Oily'], lashStatus: 'No extensions', browCondition: ['Sparse'], nailLength: ['Short'] });
    const cases = [
      ['scalpCondition', SCALP_CONDITIONS], ['treatmentHistory', TREATMENT_HISTORY], ['skinConcerns', SKIN_CONCERNS],
      ['lashStyle', LASH_STYLES], ['browStyle', BROW_STYLES], ['nailShape', NAIL_SHAPES], ['makeupFinish', MAKEUP_FINISH],
    ] as const;
    for (const [question, all] of cases) {
      const { suited, rest } = tailoredOptions(question, d);
      expect([...suited, ...rest].sort()).toEqual([...all].sort());
    }
  });

  it('shows the usual order when nothing earlier applies', () => {
    const { suited, rest, because } = tailoredOptions('scalpCondition', profile({}));
    expect(because).toBeNull();
    expect(suited).toEqual([]);
    expect(rest).toEqual(SCALP_CONDITIONS);
  });

  it('follows skin type into skin concerns and makeup finish', () => {
    expect(tailoredOptions('skinConcerns', profile({ skinType: ['Oily'] })).suited[0]).toBe('Acne prone');
    expect(tailoredOptions('skinConcerns', profile({ skinType: ['Sensitive'] })).because).toBe('your sensitive skin');
    expect(tailoredOptions('makeupFinish', profile({ skinType: ['Dry'] })).suited).toEqual(['Dewy', 'Glowy', 'Satin']);
  });

  it('follows lash status, brow condition, nail length and style vibe', () => {
    expect(tailoredOptions('lashStyle', profile({ lashStatus: 'No extensions' })).suited[0]).toBe('Lifted natural lashes');
    expect(tailoredOptions('browStyle', profile({ browCondition: ['Light / barely there'] })).because).toBe('light brows');
    expect(tailoredOptions('nailShape', profile({ nailLength: ['Natural / bare'] })).because).toBe('natural nails');
    expect(tailoredOptions('nailShape', profile({ nailLength: ['Long'] })).suited).toContain('Stiletto');
    expect(tailoredOptions('makeupLips', profile({ styleVibe: ['Natural'] })).suited).toEqual(['Nude', 'Gloss']);
  });

  it('turns the new answers into ideas that suit them', () => {
    const labels = suitedIdeas('hair', profile({ hairType: ['4C'], treatmentHistory: ['Wigs / units'], scalpCondition: ['Thinning edges'] }))
      .map(i => i.label);
    expect(labels).toEqual(expect.arrayContaining(['Wig install', 'Scalp treatment']));
  });
});
