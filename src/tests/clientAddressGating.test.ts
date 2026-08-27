import { readFileSync } from 'fs';
import { join } from 'path';

const REPO = join(__dirname, '..', '..');
const MIGRATION = readFileSync(
  join(REPO, 'supabase/migrations/20260827130000_client_address_released_on_confirmation.sql'),
  'utf8',
);
const DB = readFileSync(join(REPO, 'src/services/databaseService.ts'), 'utf8');

// A mobile provider's appointment happens at the CLIENT's home, so the client
// must hand over their address to book at all. It used to sit on the booking
// row, readable by the provider from the instant the request existed — before
// accepting, and still after declining.
describe('client address is gated until the provider accepts', () => {
  it('lets the provider read it only once the booking was accepted', () => {
    const policy = MIGRATION.slice(MIGRATION.indexOf('bca_provider_read_after_accept'));
    const head = policy.slice(0, 900);
    for (const accepted of ['confirmed', 'in_progress', 'completed']) {
      expect(head).toContain(`'${accepted}'`);
    }
    // A booking that never reached acceptance must read NULL.
    expect(head).not.toContain("'pending'");
    expect(head).not.toContain("'cancelled'");
  });

  it('never lets a provider WRITE the client’s own address', () => {
    const policy = MIGRATION.slice(
      MIGRATION.indexOf('bca_provider_read_after_accept'),
      MIGRATION.indexOf('GRANT SELECT, INSERT, UPDATE'),
    );
    expect(policy).toContain('FOR SELECT');
    expect(policy).not.toContain('WITH CHECK');
  });

  it('leaves the client full access to what is theirs', () => {
    const policy = MIGRATION.slice(MIGRATION.indexOf('bca_client_all'));
    expect(policy.slice(0, 500)).toContain('FOR ALL');
  });
});

describe('the old column is a write funnel, not storage', () => {
  it('relocates any write and blanks the column', () => {
    const fn = MIGRATION.slice(MIGRATION.indexOf('FUNCTION public.relocate_booking_client_address'));
    expect(fn.slice(0, 800)).toContain('INSERT INTO public.booking_client_addresses');
    expect(fn.slice(0, 800)).toContain('SET client_address = NULL');
  });

  it('fires only on a non-null write, so blanking cannot recurse', () => {
    expect(MIGRATION).toContain('WHEN (NEW.client_address IS NOT NULL)');
  });

  it('backfills and empties what was already stored', () => {
    expect(MIGRATION).toContain('INSERT INTO public.booking_client_addresses (booking_id, address)');
    expect(MIGRATION).toContain('UPDATE public.bookings SET client_address = NULL WHERE client_address IS NOT NULL');
  });
});

describe('readers were moved off the dead column', () => {
  it('provider booking reads embed the gated row', () => {
    // Providers read `bookings` directly with select("*"), which now returns
    // NULL for client_address — without the embed a mobile provider would see
    // no address at all, for every booking, silently.
    expect(DB).toContain('booking_client_addresses ( address )');
  });

  it('no reader still selects the dead column off the base table', () => {
    expect(DB).not.toContain('booking_date, booking_time, client_address');
  });

  it('the one remaining client_address select reads the VIEW, not bookings', () => {
    // getMyLastClientAddress is correct as-is: client_bookings sources the
    // column from the gated table now, so the client still prefills their own
    // address at checkout. Pinned so a future "tidy-up" doesn't repoint it at
    // the base table, where the column is permanently NULL and the failure is
    // silent — an empty address field nobody can explain.
    const idx = DB.indexOf('.select("client_address")');
    expect(idx).toBeGreaterThan(-1);
    expect(DB.slice(Math.max(0, idx - 300), idx)).toContain('client_bookings');
  });
});
