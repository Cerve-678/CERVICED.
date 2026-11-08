// src/features/beauty-profile/profileRow.ts
//
// The users-row → BeautyData mapping, shared by the Beauty Profile screen and
// the Settings row's to-do check so both read the saved answers the same way.

import type { UserBeautyProfileRow } from '../../services/databaseService';
import { type BeautyData, type Gender, EMPTY_BEAUTY_DATA } from '../../types/beautyProfile';
import { toPickList } from './pickList';

export function beautyDataFromRow(m: UserBeautyProfileRow | null): BeautyData {
  if (!m) return EMPTY_BEAUTY_DATA;
  return {
    hairType: m.hair_type ?? '', scalpCondition: m.scalp_condition ?? '',
    hairGoals: m.hair_goals ?? [], treatmentHistory: m.treatment_history ?? [],
    skinType: toPickList(m.skin_type), skinTone: m.skin_tone ?? '',
    skinConcerns: m.skin_concerns ?? [], sensitiveAreas: m.sensitive_areas ?? [],
    nailLength: m.nail_length ?? '', nailShape: m.nail_shape ?? '',
    lashStyle: m.lash_style ?? '', lashStatus: m.lash_status ?? '',
    browStyle: m.brow_style ?? '', browCondition: m.brow_condition ?? '',
    makeupCoverage: m.makeup_coverage ?? '', makeupFinish: m.makeup_finish ?? '',
    makeupEyes: m.makeup_eyes ?? '', makeupLips: m.makeup_lips ?? '',
    styleVibe: toPickList(m.style_vibe), serviceInterests: m.service_interests ?? [],
    gender: (m.gender as Gender | null) ?? null, has_kids: m.has_kids ?? false,
    allergies: m.allergies ?? [], medicalNotes: m.medical_notes ?? '',
    photographyConsent: m.photography_consent ?? true,
  };
}
