import { beautyDataFromRow } from '../features/beauty-profile/profileRow';
import type { UserBeautyProfileRow } from '../services/databaseService';

// 20261110120000 turned hair type, scalp, nails, lashes/brows style and
// condition, and the four makeup answers into lists. A row can still arrive
// with the old single string (read before the migration is applied), so the
// reader must accept both.
const base = {
  hair_goals: [], treatment_history: [], skin_type: null, skin_tone: null, skin_concerns: [],
  sensitive_areas: [], lash_status: null, style_vibe: null, service_interests: [], gender: null,
  has_kids: null, allergies: [], medical_notes: null, photography_consent: null,
};

describe('beautyDataFromRow with multi-pick columns', () => {
  it('reads the new lists as they are', () => {
    const d = beautyDataFromRow({
      ...base, hair_type: ['4B', '4C'], scalp_condition: ['Dry'], nail_length: ['Short', 'Long'],
      nail_shape: ['Almond'], lash_style: ['Wispy'], brow_style: null, brow_condition: [],
      makeup_coverage: ['Full glam'], makeup_finish: null, makeup_eyes: null, makeup_lips: ['Gloss', 'Nude'],
    } as unknown as UserBeautyProfileRow);
    expect(d.hairType).toEqual(['4B', '4C']);
    expect(d.nailLength).toEqual(['Short', 'Long']);
    expect(d.browStyle).toEqual([]);
    expect(d.makeupLips).toEqual(['Gloss', 'Nude']);
  });

  it('turns an old single answer into a one-answer list', () => {
    const d = beautyDataFromRow({
      ...base, hair_type: '4C', scalp_condition: '', nail_length: null, nail_shape: 'Coffin',
      lash_style: null, brow_style: 'Fluffy', brow_condition: null, makeup_coverage: null,
      makeup_finish: 'Dewy', makeup_eyes: null, makeup_lips: null,
    } as unknown as UserBeautyProfileRow);
    expect(d.hairType).toEqual(['4C']);
    expect(d.scalpCondition).toEqual([]);
    expect(d.nailShape).toEqual(['Coffin']);
    expect(d.makeupFinish).toEqual(['Dewy']);
  });
});
