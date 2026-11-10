import fs from 'fs';
import path from 'path';

/**
 * A provider sees a client's Beauty Profile only once they have accepted the
 * booking (user, 2026-11-10: "if cancelled/declined they won't be able to see
 * it. if it's a request they shouldn't be able to see it"). The database
 * decides; the screen says "shared once you accept" for a request instead of
 * an empty profile that would read as "no allergies".
 */
const root = path.join(__dirname, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8');
const sql = read('supabase', 'migrations', '20261110180000_beauty_profile_after_accept.sql');
const screen = read('src', 'screens', 'provider', 'ProviderBookingDetailScreen.tsx');
const service = read('src', 'services', 'databaseService.ts');

describe('beauty profile is shared only after the provider accepts', () => {
  it('returns a row only for accepted bookings', () => {
    expect(sql).toContain("AND b.status IN ('confirmed', 'in_progress', 'completed');");
    for (const status of ['pending', 'on_hold', 'cancelled', 'no_show']) {
      expect(sql).not.toMatch(new RegExp(`b\\.status IN \\([^)]*'${status}'`));
    }
  });

  it('still answers only the provider on that booking', () => {
    expect(sql).toContain('AND p.user_id = auth.uid()');
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_client_beauty_profile_for_booking\(uuid\) FROM PUBLIC, anon;/);
  });

  it('refuses to apply over a live definition it was not written against', () => {
    expect(sql).toMatch(/md5\(pg_get_functiondef\('public\.get_client_beauty_profile_for_booking\(uuid\)'::regprocedure\)\)/);
  });

  it('reads "no row" as not shared, never as an empty profile', () => {
    expect(service).toContain('): Promise<ClientBeautyProfile | null> {');
    expect(service).toContain('if (!data) return null;');
    expect(service).not.toContain('EMPTY_PROFILE');
  });

  it('reloads when the booking status changes and explains a request', () => {
    expect(screen).toContain('}, [clientUserId, bookingId, bookingStatus]);');
    expect(screen).toContain('{!clientProfile && isPendingConfirmation && (');
    expect(screen).toContain('Shared with you once you accept this booking');
  });
});
