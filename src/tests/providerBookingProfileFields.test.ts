import { SERVICE_PROFILE_FIELDS } from '../features/provider-bookings/profileFields';

describe('provider booking profile fields', () => {
  it('always includes safety-critical client fields', () => {
    for (const fields of Object.values(SERVICE_PROFILE_FIELDS)) {
      expect(fields).toContain('allergies');
      expect(fields).toContain('medicalNotes');
      expect(fields).toContain('photographyConsent');
    }
  });
});
