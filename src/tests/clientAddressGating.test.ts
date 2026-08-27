import { readFileSync } from 'fs';
import { join } from 'path';

const REPO = join(__dirname, '..', '..');
const MIGRATION = readFileSync(
  join(REPO, 'supabase/migrations/20260827161000_client_address_released_on_confirmation.sql'),
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
    // Same statement sets the coarse area — see the area suite below.
    expect(MIGRATION).toContain('client_address = NULL\n WHERE client_address IS NOT NULL');
  });
});

describe('readers were moved off the dead column', () => {
  // UNSKIPPED 2026-08-27: 20260827161000 is applied live and the embed was
  // restored in the same change, as the note that stood here required.
  // bookings.client_address is now a write-only funnel, always NULL at rest,
  // so a reader that still selects it off the base table gets an empty field
  // rather than an error — which is why these are asserted, not assumed.
  it('provider booking reads embed the gated row', () => {
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

describe('the coarse area is readable before accepting', () => {
  // A mobile provider deciding whether to accept needs the distance — gating
  // the address outright would make them accept blind and find out after.
  // So it splits the way a provider's own address already does:
  //   providers.location_text        <-> bookings.client_area        (coarse)
  //   provider_private_details       <-> booking_client_addresses    (gated)
  it('lives on bookings, not in the gated table', () => {
    // Two TABLES, not two columns of one: RLS gates rows, never columns —
    // the same constraint that forced the full address out in the first place.
    expect(MIGRATION).toContain('ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS client_area');
  });

  it('is written in the same statement that blanks the full address', () => {
    const fn = MIGRATION.slice(MIGRATION.indexOf('FUNCTION public.relocate_booking_client_address'));
    const upd = fn.slice(fn.indexOf('UPDATE public.bookings'), fn.indexOf('RETURN NULL'));
    // Split across two statements there would be an instant with neither the
    // area nor the address visible to the provider.
    expect(upd).toContain('client_address = NULL');
    expect(upd).toContain('client_area = public.coarse_area_from_address');
  });

  it('never falls back to a guessed town or street', () => {
    const fn = MIGRATION.slice(
      MIGRATION.indexOf('FUNCTION public.coarse_area_from_address'),
      MIGRATION.indexOf('REVOKE ALL ON FUNCTION public.coarse_area_from_address'),
    );
    // "the comma-separated part before the postcode" would return a STREET on
    // any address the pattern missed — leaking the exact thing being
    // protected, silently, and only for addresses that parsed badly.
    expect(fn).not.toContain('split_part');
    expect(fn).toContain('regexp_match');
  });

  it('backfills the area for addresses already stored', () => {
    expect(MIGRATION).toContain('SET client_area = public.coarse_area_from_address(client_address)');
  });
});

describe('UK outward-code extraction', () => {
  // Mirrors the Postgres pattern in coarse_area_from_address(). \m and \M are
  // Postgres word boundaries; \b is the JS equivalent.
  const outward = (a: string): string | null =>
    (/\b([A-Z]{1,2}[0-9][A-Z0-9]?)\s*[0-9][A-Z]{2}\b/.exec(a.toUpperCase()) ?? [])[1] ?? null;

  it.each([
    ['12 Bellenden Road, London SE15 4QA, UK', 'SE15'],
    ['5 High Street, Manchester M1 1AE', 'M1'],
    ['10 Downing Street, London SW1A 2AA', 'SW1A'],
    ['221B Baker Street, London NW1 6XE', 'NW1'],
    ['Unit 7, Estate Road, Leeds LS12 6JG, United Kingdom', 'LS12'],
  ])('reads %s as %s', (addr, want) => {
    expect(outward(addr as string)).toBe(want);
  });

  it('returns nothing rather than guessing when there is no postcode', () => {
    expect(outward('no postcode here at all')).toBeNull();
    expect(outward('')).toBeNull();
  });

  it('does not mistake a house number for an outward code', () => {
    // 221B leads with digits, so it cannot match [A-Z]{1,2}[0-9]...
    expect(outward('221B Baker Street, London NW1 6XE')).not.toBe('221B');
  });
});
