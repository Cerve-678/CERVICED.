import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'supabase/migrations');

/** The newest migration whose text matches `marker`, read as text.
 *
 *  Resolved by scanning rather than naming one file, for the same reason
 *  emergencyRequestNeverAutoConfirms.test.ts does: the failure mode is a LATER
 *  migration dropping or weakening the rule, which a test pinned to the file
 *  that added it would never see. iCloud's numbered forks (`… 2.sql`) are
 *  excluded -- they are never applied (see supabase/MIGRATION_OWNER.md). */
function latestMatching(marker: string): string {
  const file = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !/ \d+\.sql$/.test(f))
    .sort()
    .filter(f => readFileSync(join(MIGRATIONS_DIR, f), 'utf8').includes(marker))
    .pop();
  if (!file) throw new Error(`No migration matches ${marker}`);
  return readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
}

// A mobile provider travels TO the client. A committed mobile booking with no
// client address is a provider committed to turning up nowhere. The client app
// fails closed on the live (claim) route, but that lives in one screen and does
// not cover the Stripe checkout path, which writes no client address at all --
// so the database has to be the thing that refuses. This is the contract for
// that server-side guard (supabase/migrations/*_mobile_booking_requires_client_address.sql).
describe('a mobile booking cannot be committed without a client address (server guard)', () => {
  const marker = 'FUNCTION public.enforce_mobile_booking_has_client_address(';

  it('refuses a committed mobile booking with no address row', () => {
    const body = latestMatching(`CREATE OR REPLACE ${marker}`);

    // Only mobile providers, read live from the provider (no booking snapshot).
    expect(body).toMatch(/business_type\s*=\s*'mobile'/);
    // The invariant: an address must EXIST for the booking, and raise if not.
    expect(body).toMatch(/NOT EXISTS\s*\(/);
    expect(body).toContain('booking_client_addresses');
    expect(body).toMatch(/RAISE EXCEPTION/);
    expect(body).toContain("ERRCODE = 'P0001'");
    // Security posture consistent with the other DB-owned address functions.
    expect(body).toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/SET search_path TO 'public', 'pg_temp'/);
  });

  it('checks only a fresh transition INTO a committed status', () => {
    const body = latestMatching(`CREATE OR REPLACE ${marker}`);
    // Enforced states.
    expect(body).toMatch(/NEW\.status NOT IN \('confirmed', 'in_progress', 'completed'\)/);
    // Already-committed rows updated for other reasons are left alone, so legacy
    // no-address rows never become unmodifiable and the guard can't be tripped
    // by an unrelated edit.
    expect(body).toMatch(/OLD\.status IN \('confirmed', 'in_progress', 'completed'\)/);
  });

  it('runs at commit, after the address has been relocated', () => {
    // A DEFERRABLE INITIALLY DEFERRED constraint trigger is load-bearing: the
    // on_booking_client_address_written trigger relocates the address into
    // booking_client_addresses within the same transaction, so a non-deferred
    // check would race it and reject the legitimate claim path.
    const body = latestMatching('CREATE CONSTRAINT TRIGGER enforce_mobile_booking_has_client_address');
    expect(body).toMatch(/DEFERRABLE INITIALLY DEFERRED/);
    expect(body).toMatch(/AFTER INSERT OR UPDATE ON public\.bookings/);
    expect(body).toMatch(/FOR EACH ROW/);
  });
});

// The Stripe checkout path holds via prepare_checkout() (not the claim RPC) and
// promotes via finalize_checkout(); neither used to write the client address, so
// a mobile booking taken through Stripe would reach the provider with no
// destination. prepare_checkout() is where the address has to be captured -- the
// twin of claim_cart_booking_slots() on the live route.
describe('prepare_checkout captures the mobile client address (Stripe path)', () => {
  const marker = 'FUNCTION public.prepare_checkout(';

  it('rejects a mobile item with no client address, fail-closed like the other gates', () => {
    const body = latestMatching(`CREATE OR REPLACE ${marker}`);
    // business_type read from the provider row, not trusted from the client.
    expect(body).toMatch(/v_provider\.business_type\s*=\s*'mobile'/);
    expect(body).toMatch(/client_address.{0,80}IS NULL/s);
    expect(body).toMatch(/RAISE EXCEPTION 'A mobile booking needs the client''s address before payment'/);
  });

  it('writes client_address / client_area onto the held row for a mobile provider', () => {
    const body = latestMatching(`CREATE OR REPLACE ${marker}`);
    // Both columns are in the INSERT and only populated for a mobile provider,
    // so the on_booking_client_address_written trigger relocates the address at
    // hold time and finalize_checkout() needs no change.
    expect(body).toMatch(/is_emergency_request, emergency_ack_at, client_address, client_area/);
    expect(body).toMatch(/WHEN v_provider\.business_type = 'mobile' THEN NULLIF\(btrim\(v_item->>'client_address'\), ''\)/);
    expect(body).toMatch(/WHEN v_provider\.business_type = 'mobile' THEN NULLIF\(btrim\(v_item->>'client_area'\), ''\)/);
    // Reproduced faithfully: the security posture is unchanged.
    expect(body).toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/SET search_path TO 'public', 'pg_temp'/);
  });
});
