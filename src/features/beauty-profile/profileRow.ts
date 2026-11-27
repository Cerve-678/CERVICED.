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
    hairType: toPickList(m.hair_type), scalpCondition: toPickList(m.scalp_condition),
    hairPorosity: m.hair_porosity ?? '', hairThickness: m.hair_thickness ?? '',
    hairGoals: m.hair_goals ?? [], treatmentHistory: m.treatment_history ?? [],
    skinType: toPickList(m.skin_type), skinTone: m.skin_tone ?? '', skinUndertone: m.skin_undertone ?? '',
    skinConcerns: m.skin_concerns ?? [], sensitiveAreas: m.sensitive_areas ?? [],
    nailCondition: m.nail_condition ?? [], nailService: m.nail_service ?? [],
    nailLength: toPickList(m.nail_length), nailShape: toPickList(m.nail_shape),
    nailStyle: m.nail_style ?? [], nailColours: m.nail_colours ?? [],
    lashStyle: toPickList(m.lash_style), lashStatus: m.lash_status ?? '',
    eyeShape: m.eye_shape ?? [], lashCurl: m.lash_curl ?? '', lashMap: m.lash_map ?? [],
    faceShape: m.face_shape ?? '', eyeColour: m.eye_colour ?? '', blushStyle: m.blush_style ?? [],
    browStyle: toPickList(m.brow_style), browCondition: toPickList(m.brow_condition),
    makeupCoverage: toPickList(m.makeup_coverage), makeupFinish: toPickList(m.makeup_finish),
    makeupEyes: toPickList(m.makeup_eyes), makeupLips: toPickList(m.makeup_lips),
    styleVibe: toPickList(m.style_vibe), serviceInterests: m.service_interests ?? [],
    styleAesthetics: m.style_aesthetics ?? [], styleOccasions: m.style_occasions ?? [], styleRoutine: m.style_routine ?? '',
    gender: (m.gender as Gender | null) ?? null, has_kids: m.has_kids ?? false,
    allergies: m.allergies ?? [], medicalNotes: m.medical_notes ?? '',
    photographyConsent: m.photography_consent ?? true,
  };
}
