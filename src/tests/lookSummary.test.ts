import { lookLine, lookTitle } from '../features/beauty-profile/lookSummary';
import { EMPTY_BEAUTY_DATA, type BeautyData } from '../types/beautyProfile';

const profile = (p: Partial<BeautyData>): BeautyData => ({ ...EMPTY_BEAUTY_DATA, ...p });

describe('the Your look card says more than one word', () => {
  it('pairs their vibe with their aesthetic', () => {
    expect(lookTitle(profile({ styleVibe: ['Glam'], styleAesthetics: ['Soft glam'] }))).toBe('Glam & Soft glam');
  });

  it('falls back to makeup finish, then hair, for the second word', () => {
    expect(lookTitle(profile({ styleVibe: ['Natural'], makeupFinish: ['Dewy'] }))).toBe('Natural & Dewy');
    expect(lookTitle(profile({ styleVibe: ['Natural'], hairType: ['4C'] }))).toBe('Natural & 4C');
    expect(lookTitle(profile({ styleVibe: ['Natural', 'Classic'] }))).toBe('Natural & Classic');
  });

  it('never repeats a word, and is empty with nothing to say', () => {
    expect(lookTitle(profile({ styleVibe: ['Editorial'], styleAesthetics: ['Editorial', 'Y2K'] }))).toBe('Editorial & Y2K');
    expect(lookTitle(profile({}))).toBeNull();
  });

  it('writes a sentence from the rest of their answers', () => {
    expect(lookLine(profile({
      hairType: ['4C'],
      nailShape: ['Almond'],
      nailService: ['BIAB / builder gel'],
      lashStyle: ['Wispy'],
      makeupFinish: ['Dewy'],
      styleOccasions: ['Everyday', 'Weddings', 'Work'],
    }))).toBe('4C hair, almond BIAB nails, wispy lashes and a dewy finish, for everyday and weddings.');
    expect(lookLine(profile({ hairType: ['Curly'] }))).toBe('Curly hair.');
    expect(lookLine(profile({}))).toBeNull();
  });
});
