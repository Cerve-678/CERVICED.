import { beautyDataFromRow } from '../features/beauty-profile/profileRow';
import { highlightCategory } from '../features/beauty-profile/highlights';
import {
  EYE_SHAPES, HAIR_POROSITY, HAIR_THICKNESS, LASH_CURLS, LASH_STATUS, LASH_STYLES, SKIN_UNDERTONES,
} from '../features/beauty-profile/options';
import { tailoredOptions } from '../features/beauty-profile/tailoredOptions';
import { computeBeautyProfileStats } from '../utils/beautyProfileStats';
import { EMPTY_BEAUTY_DATA, type BeautyData } from '../types/beautyProfile';
import type { UserBeautyProfileRow } from '../services/databaseService';

// 2026-11-27: porosity, hair thickness, undertone, eye shape and lash curl,
// plus the lash maps people search on Pinterest (20261127110000).

const labels = { scalp: (c: string) => c, medicalNote: 'Medical note', photosOn: 'Photos on', photosOff: 'Photos off' };
const profile = (over: Partial<BeautyData>): BeautyData => ({ ...EMPTY_BEAUTY_DATA, ...over });

describe('Beauty Profile porosity, eye shape and the rest', () => {
  it('offers the answers people search for', () => {
    expect(HAIR_POROSITY).toEqual(expect.arrayContaining(['Low porosity', 'High porosity', 'Not sure']));
    expect(HAIR_THICKNESS).toContain('Fine');
    expect(SKIN_UNDERTONES).toEqual(expect.arrayContaining(['Cool', 'Warm', 'Neutral', 'Olive']));
    expect(EYE_SHAPES).toEqual(expect.arrayContaining(['Hooded', 'Almond', 'Monolid', 'Downturned']));
    expect(LASH_CURLS).toContain('Let my tech decide');
    expect(LASH_STYLES).toEqual(expect.arrayContaining(['Squirrel', 'Kitten']));
    expect(LASH_STATUS).toContain('Wear cluster lashes');
  });

  it('reads the new columns off the users row, and an older row as empty', () => {
    const d = beautyDataFromRow({
      hair_porosity: 'Low porosity', hair_thickness: 'Fine', skin_undertone: 'Olive',
      eye_shape: ['Hooded', 'Almond'], lash_curl: 'L / M (lifts hooded or straight lashes)',
    } as unknown as UserBeautyProfileRow);
    expect(d.hairPorosity).toBe('Low porosity');
    expect(d.hairThickness).toBe('Fine');
    expect(d.skinUndertone).toBe('Olive');
    expect(d.eyeShape).toEqual(['Hooded', 'Almond']);
    expect(d.lashCurl).toBe('L / M (lifts hooded or straight lashes)');

    const old = beautyDataFromRow({} as unknown as UserBeautyProfileRow);
    expect(old.hairPorosity).toBe('');
    expect(old.eyeShape).toEqual([]);
    expect(old.lashCurl).toBe('');
  });

  it('counts the new questions in each category', () => {
    const stats = computeBeautyProfileStats(profile({ hairPorosity: 'High porosity', eyeShape: ['Round'] }));
    expect(stats.byCategory.hair.fieldsTotal).toBe(6);
    expect(stats.byCategory.hair.fieldsSet).toBe(1);
    expect(stats.byCategory.lashesBrows.fieldsTotal).toBe(6);
    expect(stats.byCategory.skin.fieldsTotal).toBe(5);
  });

  it('shows real answers on the tile, never "Not sure" or "Let my tech decide"', () => {
    expect(highlightCategory('hair', profile({ hairPorosity: 'Low porosity' }), labels).lead).toBe('Low porosity');
    expect(highlightCategory('hair', profile({ hairPorosity: 'Not sure' }), labels).lead).toBeNull();
    expect(highlightCategory('lashesBrows', profile({ lashCurl: 'Let my tech decide' }), labels).lead).toBeNull();
  });

  it('suggests lash looks that suit cluster lashes', () => {
    const t = tailoredOptions('lashStyle', profile({ lashStatus: 'Wear cluster lashes' }));
    expect(t.because).toBe('wearing cluster lashes');
    expect(t.suited).toContain('Wispy');
  });
});
