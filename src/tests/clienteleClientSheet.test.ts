import fs from 'fs';
import path from 'path';
import { readDatabaseLayer } from './databaseLayerSource';

/**
 * My Clientele (user, 2026-11-18): tapping a client opens a sheet again, not
 * a dropdown in the card, with their Beauty Profile and a notes section as
 * well as their booking history.
 *
 * The Beauty Profile there follows the booking page's rule
 * (beautyProfileAfterAccept.test.ts): shared only once this provider has
 * accepted a booking from the client, and only the fields those bookings'
 * categories get. Notes are the provider's own and private to them.
 */
const root = path.join(__dirname, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8');
const sql = read('supabase', 'migrations', '20261118205332_clientele_notes_and_beauty_profile.sql');
const screen = read('src', 'screens', 'provider', 'ProviderClienteleScreen.tsx');
const bookingScreen = read('src', 'screens', 'provider', 'ProviderBookingDetailScreen.tsx');
const service = readDatabaseLayer();

const profileFn = sql.slice(
  sql.indexOf('CREATE OR REPLACE FUNCTION public.get_client_beauty_profile_for_provider'),
  sql.indexOf('-- ── 2. Private notes'),
);

describe('Clientele client sheet: Beauty Profile', () => {
  it('shares only after an accepted booking, and only with that provider', () => {
    expect(profileFn).toContain("AND b.status IN ('confirmed', 'in_progress', 'completed')");
    for (const status of ['pending', 'on_hold', 'cancelled', 'declined', 'no_show']) {
      expect(profileFn).not.toMatch(new RegExp(`b\\.status IN \\([^)]*'${status}'`));
    }
    expect(profileFn).toContain('AND p.user_id = auth.uid()');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.get_client_beauty_profile_for_provider(uuid) FROM PUBLIC, anon;');
  });

  it("gates every category field by the accepted bookings' categories", () => {
    expect(profileFn).toContain('public.beauty_profile_fields_for_category(c.cat)');
    const gated = profileFn.match(/CASE WHEN '\w+' = ANY \(f\) THEN u\.\w+ END/g) ?? [];
    expect(gated).toHaveLength(23);
  });

  it('refuses to apply over live definitions it was not written against', () => {
    expect(sql).toMatch(/md5\(pg_get_functiondef\('public\.beauty_profile_fields_for_category\(text\)'::regprocedure\)\)/);
    expect(sql).toMatch(/md5\(pg_get_functiondef\('public\.get_client_beauty_profile_for_booking\(uuid\)'::regprocedure\)\)/);
  });

  it('reads "no row" as not shared, never as an empty profile', () => {
    expect(service).toContain('export async function getClientBeautyProfileForProvider(');
    expect(screen).toContain("tr('providerBusiness.ui2.sharedWithYouOnceYouVe')");
  });

  it('shows the profile the same way as the booking page', () => {
    expect(screen).toContain('<ClientBeautyProfileDetails');
    expect(bookingScreen).toContain('<ClientBeautyProfileDetails');
  });
});

describe('Clientele client sheet: private notes', () => {
  it('keeps the table out of direct reach', () => {
    expect(sql).toContain('ALTER TABLE public.provider_client_notes ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('REVOKE ALL ON public.provider_client_notes FROM PUBLIC, anon, authenticated;');
    expect(sql).not.toMatch(/CREATE POLICY[^;]*provider_client_notes/);
  });

  it('only lets a provider note their own clients', () => {
    expect(sql).toContain('WHERE p.user_id = auth.uid()');
    expect(sql).toContain("RAISE EXCEPTION 'You can only keep notes on your own clients.'");
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.my_provider_id_for_client(uuid) FROM PUBLIC, anon, authenticated;');
  });

  it('deletes rather than stores a blank note', () => {
    expect(sql).toMatch(/IF v_note = '' THEN\s+DELETE FROM public\.provider_client_notes/);
  });
});

describe('Clientele client sheet: layout', () => {
  it('opens a sheet from the card instead of a dropdown inside it', () => {
    expect(screen).toContain('<ClientSheet');
    expect(screen).not.toContain('ClientHistoryList');
    expect(screen).not.toContain('onToggleHistory');
  });

  it('saves an unsaved note on close, but never traps them if that fails', () => {
    expect(screen).toContain('if (dirty && !saveError && !(await saveNote())) return;');
  });
});
