import { TREATMENT_HISTORY, hairTreatmentHistory } from '../features/beauty-profile/options';
import { areaRows } from '../features/beauty-profile/bodyMap';
import { highlightCategory } from '../features/beauty-profile/highlights';
import { EMPTY_BEAUTY_DATA, type BeautyData } from '../types/beautyProfile';

// Lash extensions aren't a hair answer: lashes have their own status under
// Lashes & Brows. Older profiles (and sign-up's cross-category question) can
// still hold the value, so every Hair display drops it.
const profile = (p: Partial<BeautyData>): BeautyData => ({ ...EMPTY_BEAUTY_DATA, ...p });
const LABELS = { scalp: (s: string) => `${s} scalp`, medicalNote: 'Medical note', photosOn: 'On', photosOff: 'Off' };

describe('lash extensions are not in Hair', () => {
  it('is not a chip in the Hair treatment history', () => {
    expect(TREATMENT_HISTORY).not.toContain('Lash extensions');
  });

  it('is dropped from a stored history, keeping the rest in order', () => {
    expect(hairTreatmentHistory(['Coloured', 'Lash extensions', 'Hair extensions']))
      .toEqual(['Coloured', 'Hair extensions']);
  });

  it('is not listed on the Hair pin of the map', () => {
    const rows = areaRows('hair', profile({ treatmentHistory: ['Lash extensions'] }));
    expect(rows.find(r => r.label === 'History')?.value).toBeNull();
  });

  it('is not a Hair highlight', () => {
    const h = highlightCategory('hair', profile({ treatmentHistory: ['Lash extensions', 'Coloured'] }), LABELS);
    expect([h.lead, ...h.details]).toEqual(['Coloured']);
  });
});
