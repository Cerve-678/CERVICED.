import { beautyDataFromRow } from '../features/beauty-profile/profileRow';
import { highlightCategory } from '../features/beauty-profile/highlights';
import {
  BLUSH_STYLES, EYE_COLOURS, EYE_SHAPES, FACE_SHAPES, HAIR_POROSITY, HAIR_THICKNESS, LASH_CURLS, LASH_MAP_MAX_MM,
  LASH_MAP_MIN_MM, LASH_MAP_PRESETS, LASH_MAP_ZONES, LASH_STATUS, LASH_STYLES, SKIN_UNDERTONES, formatLashMap, hairGoalsFor,
} from '../features/beauty-profile/options';
import { lashStrandPaths } from '../features/beauty-profile/LashMapBuilder';
import { HAIR_TYPES, hairTypeFamily } from '../constants/hairTypes';
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
    expect(SKIN_UNDERTONES).toEqual(expect.arrayContaining(['Cool', 'Warm', 'Neutral', 'Olive', 'Yellow']));
    expect(FACE_SHAPES).toEqual(expect.arrayContaining(['Oval', 'Round', 'Heart', 'Diamond']));
    expect(EYE_COLOURS).toContain('Hazel');
    expect(BLUSH_STYLES).toEqual(expect.arrayContaining(['Igari (under the eyes)', 'Draped (cheek to temple)']));
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
    expect(stats.byCategory.lashesBrows.fieldsTotal).toBe(7);
    expect(stats.byCategory.makeup.fieldsTotal).toBe(7);
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

  it('suggests lash looks for the eye shape before the lash status', () => {
    const t = tailoredOptions('lashStyle', profile({ eyeShape: ['Hooded'], lashStatus: 'Wear cluster lashes' }));
    expect(t.because).toBe('your hooded eyes');
    expect(t.suited).toEqual(expect.arrayContaining(['Open eye', 'Squirrel']));
  });
});

describe('lash map', () => {
  it('has start shapes that are five usable lengths, with the cat eye longest at the outer corner', () => {
    for (const p of LASH_MAP_PRESETS) {
      expect(p.map).toHaveLength(LASH_MAP_ZONES);
      p.map.forEach(mm => {
        expect(mm).toBeGreaterThanOrEqual(LASH_MAP_MIN_MM);
        expect(mm).toBeLessThanOrEqual(LASH_MAP_MAX_MM);
      });
      expect(LASH_STYLES).toContain(p.name);
    }
    const cat = LASH_MAP_PRESETS.find(p => p.name === 'Cat eye')!.map;
    expect(Math.max(...cat)).toBe(cat[cat.length - 1]);
  });

  it('reads like a lash tech writes it', () => {
    expect(formatLashMap([8, 10, 12, 14, 16])).toBe('8 · 10 · 12 · 14 · 16mm');
    expect(formatLashMap([])).toBe('');
  });

  it('draws longer lashes where the map is longer', () => {
    const tipY = (d: string) => Number(d.trim().split(' ').pop());
    const flat = lashStrandPaths([10, 10, 10, 10, 10]);
    const longEnd = lashStrandPaths([10, 10, 10, 10, 16]);
    expect(flat.length).toBeGreaterThan(20);
    // Last strand (outer corner) reaches higher (smaller y) with 16mm.
    expect(tipY(longEnd[longEnd.length - 1]!)).toBeLessThan(tipY(flat[flat.length - 1]!));
    // Inner corner unchanged.
    expect(longEnd[0]).toBe(flat[0]);
    expect(lashStrandPaths([0, 0, 0, 0, 0])).toHaveLength(0);
  });

  it('is saved and counted as one answer', () => {
    const d = beautyDataFromRow({ lash_map: [8, 10, 12, 14, 16] } as unknown as UserBeautyProfileRow);
    expect(d.lashMap).toEqual([8, 10, 12, 14, 16]);
    const stats = computeBeautyProfileStats(profile({ lashMap: [8, 10, 12, 14, 16] }));
    expect(stats.byCategory.lashesBrows.fieldsSet).toBe(1);
  });
});

describe('2A–3C hair types', () => {
  it('sit after their family word and lead to the right goals', () => {
    expect(HAIR_TYPES.indexOf('3B')).toBeGreaterThan(HAIR_TYPES.indexOf('Curly'));
    expect(hairTypeFamily('2C')).toBe('Wavy');
    expect(hairTypeFamily('3A')).toBe('Curly');
    expect(hairTypeFamily('Straight')).toBe('Straight');
    expect(hairGoalsFor(['3B'])[0]).toBe('Length retention');
    expect(tailoredOptions('scalpCondition', profile({ hairType: ['3C'] })).because).toBe('your 3C hair');
  });
});
