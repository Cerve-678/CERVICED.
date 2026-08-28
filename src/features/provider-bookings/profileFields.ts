import type { ServiceCategory } from '../../types/database';
import type { ClientBeautyProfile } from '../../services/databaseService';

/** Beauty-profile fields relevant to each provider service category. */
export const SERVICE_PROFILE_FIELDS: Partial<Record<ServiceCategory, (keyof ClientBeautyProfile)[]>> = {
  HAIR: ['hairType', 'scalpCondition', 'hairGoals', 'treatmentHistory', 'allergies', 'styleVibe', 'medicalNotes', 'photographyConsent'],
  NAILS: ['nailLength', 'nailShape', 'allergies', 'skinConcerns', 'sensitiveAreas', 'medicalNotes', 'photographyConsent'],
  LASHES: ['lashStyle', 'lashStatus', 'skinType', 'skinConcerns', 'allergies', 'sensitiveAreas', 'medicalNotes', 'photographyConsent'],
  BROWS: ['browStyle', 'browCondition', 'skinType', 'skinConcerns', 'allergies', 'sensitiveAreas', 'medicalNotes', 'photographyConsent'],
  MUA: ['skinType', 'skinTone', 'skinConcerns', 'makeupCoverage', 'makeupFinish', 'makeupEyes', 'makeupLips', 'allergies', 'styleVibe', 'medicalNotes', 'photographyConsent'],
  AESTHETICS: ['skinType', 'skinTone', 'skinConcerns', 'sensitiveAreas', 'allergies', 'treatmentHistory', 'medicalNotes', 'photographyConsent'],
  MALE: ['hairType', 'scalpCondition', 'skinType', 'skinTone', 'skinConcerns', 'allergies', 'medicalNotes', 'photographyConsent'],
  KIDS: ['allergies', 'sensitiveAreas', 'medicalNotes', 'photographyConsent'],
  OTHER: ['hairType', 'scalpCondition', 'hairGoals', 'treatmentHistory', 'skinType', 'skinTone', 'skinConcerns', 'sensitiveAreas', 'nailLength', 'nailShape', 'lashStyle', 'lashStatus', 'browStyle', 'browCondition', 'makeupCoverage', 'makeupFinish', 'makeupEyes', 'makeupLips', 'allergies', 'styleVibe', 'medicalNotes', 'photographyConsent'],
};
