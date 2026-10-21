import { highlightCategory, leadingCategory, type HighlightLabels } from '../features/beauty-profile/highlights';
import { computeBeautyProfileStats, CATEGORY_ORDER } from '../utils/beautyProfileStats';
import { EMPTY_BEAUTY_DATA, type BeautyData } from '../types/beautyProfile';

const L: HighlightLabels = {
  scalp: c => `${c} scalp`, medicalNote: 'Medical note', photosOn: 'Photos on', photosOff: 'Photos off',
};
const data = (p: Partial<BeautyData>): BeautyData => ({ ...EMPTY_BEAUTY_DATA, ...p });

describe('highlightCategory', () => {
  it('leads with the main answer and lists the rest in field order', () => {
    expect(highlightCategory('hair', data({ hairType: '4C', scalpCondition: 'Dry', hairGoals: ['Volume'] }), L))
      .toEqual({ key: 'hair', lead: '4C', details: ['Dry scalp', 'Volume'] });
  });

  it('promotes the next answer when the headline field is blank', () => {
    expect(highlightCategory('nails', data({ nailLength: 'Short' }), L).lead).toBe('Short');
  });

  it('never surfaces skin tone', () => {
    const h = highlightCategory('skin', data({ skinTone: 'Deep', skinType: 'Oily' }), L);
    expect([h.lead, ...h.details]).toEqual(['Oily']);
  });

  it('returns no lead for an empty category', () => {
    expect(highlightCategory('makeup', EMPTY_BEAUTY_DATA, L)).toEqual({ key: 'makeup', lead: null, details: [] });
  });

  it('shows the medical note as a label, not its contents', () => {
    const h = highlightCategory('health', data({ allergies: ['Nickel'], medicalNotes: 'Private detail' }), L);
    expect(h).toEqual({ key: 'health', lead: 'Nickel', details: ['Medical note'] });
  });
});

describe('leadingCategory', () => {
  it('picks the fullest started section, earliest on a tie, never health', () => {
    const d = data({ allergies: ['Latex'], medicalNotes: 'x', nailShape: 'Oval', nailLength: 'Short', hairType: '4A' });
    expect(leadingCategory(computeBeautyProfileStats(d), CATEGORY_ORDER)).toBe('nails');
  });

  it('is null for a blank profile', () => {
    expect(leadingCategory(computeBeautyProfileStats(EMPTY_BEAUTY_DATA), CATEGORY_ORDER)).toBeNull();
  });
});
