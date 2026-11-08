import fs from 'fs';
import path from 'path';

/**
 * A provider sees only the part of a client's Beauty Profile that fits the
 * service the client booked (user, 2026-11-08: "a nail provider should only
 * get nail related client info"). The database decides, so the rest never
 * reaches the provider's phone; the screen just shows what comes back.
 */
const root = path.join(__dirname, '..', '..');
const sql = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20261108110000_beauty_profile_shared_by_booked_service.sql'),
  'utf8',
);
const screen = fs.readFileSync(
  path.join(root, 'src', 'screens', 'provider', 'ProviderBookingDetailScreen.tsx'),
  'utf8',
);

function fieldsFor(category: string): string[] {
  const m = new RegExp(`WHEN '${category}' THEN ARRAY\\[([^\\]]*)\\]`).exec(sql);
  if (!m) throw new Error(`no field list for ${category}`);
  return [...m[1]!.matchAll(/'([a-z_]+)'/g)].map(x => x[1]!);
}

describe('beauty profile follows the booked service', () => {
  it('gives every category the safety fields', () => {
    expect(sql).toContain("SELECT ARRAY['allergies', 'medical_notes', 'photography_consent']::text[]");
  });

  it('gives a nail booking only nail length and shape on top of them', () => {
    expect(fieldsFor('NAILS')).toEqual(['nail_length', 'nail_shape']);
  });

  it('keeps sensitive areas for a kids booking', () => {
    expect(fieldsFor('KIDS')).toEqual(['sensitive_areas']);
  });

  it('skips a category value that is not a real category, like a menu heading', () => {
    expect(sql).toContain("WHERE c IN ('HAIR', 'NAILS', 'LASHES', 'BROWS', 'MUA', 'AESTHETICS', 'MALE', 'KIDS', 'OTHER')");
  });

  it('gives an unknown category nothing beyond the safety fields', () => {
    expect(sql).toMatch(/ELSE ARRAY\[\]::text\[\]\s*END;/);
  });

  it('answers only the provider on that booking, and not anonymous callers', () => {
    expect(sql).toContain('AND p.user_id = auth.uid()');
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_client_beauty_profile_for_booking\(uuid\)\s+FROM PUBLIC, anon;/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.beauty_profile_fields_for_category\(text\)\s+FROM PUBLIC, anon, authenticated;/);
  });

  it('retires the whole-profile lookup', () => {
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.get_client_beauty_profile_for_provider(uuid);');
  });

  it('has the provider screen fetch by booking and filter nothing itself', () => {
    expect(screen).toContain('getClientBeautyProfileForBooking(bookingId)');
    expect(screen).not.toContain('SERVICE_PROFILE_FIELDS');
    expect(screen).not.toContain('getProviderServiceCategoryByUserId');
  });
});
