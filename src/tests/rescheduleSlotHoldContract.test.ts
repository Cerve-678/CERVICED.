import { readFileSync } from 'fs';
import { join } from 'path';

const REPO = join(__dirname, '..', '..');
const MIGRATION = readFileSync(
  join(REPO, 'supabase/migrations/20260827120337_reschedule_slot_holds.sql'),
  'utf8',
);
const SCREEN = readFileSync(
  join(REPO, 'src/screens/client/RescheduleScreen.tsx'),
  'utf8',
);

// The SQL raises a message the screen shows to the client VERBATIM. The two
// live in different languages in different folders with nothing but wording
// connecting them, so a reworded RAISE would silently drop the client into
// RescheduleScreen's generic "please try again" fallback — advice that can
// never work for a slot somebody else now owns.
const TAKEN = 'That time has just been taken. Please pick another slot.';

describe('reschedule slot holds — client-facing message contract', () => {
  it('raises the exact string RescheduleScreen passes through', () => {
    expect(MIGRATION).toContain(`RAISE EXCEPTION '${TAKEN}'`);
    expect(SCREEN).toContain(TAKEN);
  });

  it('raises it as P0001, which is what the screen gates the passthrough on', () => {
    const raise = MIGRATION.slice(MIGRATION.indexOf(`RAISE EXCEPTION '${TAKEN}'`));
    expect(raise.slice(0, 200)).toContain("ERRCODE = 'P0001'");
  });
});

describe('reschedule slot holds — release coverage', () => {
  // A hold that outlives its request blocks a provider's slot with nothing in
  // any UI to explain it and no way for either party to clear it. Every path
  // that closes a request must therefore drop its holds.
  it('releases on every terminal request status', () => {
    const fn = MIGRATION.slice(
      MIGRATION.indexOf('FUNCTION public.release_reschedule_holds_on_close'),
    );
    for (const status of ['rejected', 'expired', 'cancelled', 'confirmed']) {
      expect(fn.slice(0, 900)).toContain(`'${status}'`);
    }
  });

  it('releases BEFORE moving the booking when confirming', () => {
    const fn = MIGRATION.slice(
      MIGRATION.indexOf('FUNCTION public.confirm_reschedule_own_booking'),
    );
    const release = fn.indexOf('release_reschedule_holds');
    const update = fn.indexOf('UPDATE public.bookings');
    expect(release).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(-1);
    // Reversed, the booking moves onto a slot its own hold still occupies and
    // bookings_no_overlap rejects it — confirming the offered time fails
    // because that time is taken, by you.
    expect(release).toBeLessThan(update);
  });

  it('releases the stage-1 hold before placing the provider’s alternatives', () => {
    const fn = MIGRATION.slice(
      MIGRATION.indexOf('FUNCTION public.respond_to_reschedule_request'),
    );
    const release = fn.indexOf('release_reschedule_holds');
    const place = fn.indexOf('place_reschedule_holds_from_slots');
    expect(release).toBeGreaterThan(-1);
    expect(place).toBeGreaterThan(-1);
    // Otherwise a provider re-offering the very time the client asked for is
    // blocked by that client's own hold.
    expect(release).toBeLessThan(place);
  });
});

describe('hold rows do not generate booking side effects', () => {
  const GUARD = readFileSync(
    join(REPO, 'supabase/migrations/20260827120122_hold_rows_skip_booking_side_effects.sql'),
    'utf8',
  );

  it('guards all three AFTER INSERT triggers that lacked one', () => {
    for (const fn of [
      'handle_auto_send_intake_form',
      'handle_attach_info_packs',
      'handle_booking_todo_notification',
    ]) {
      const body = GUARD.slice(GUARD.indexOf(`FUNCTION public.${fn}`));
      expect(body.slice(0, 900)).toContain("IF NEW.status = 'on_hold' THEN");
    }
  });

  it('re-applies them when a hold is claimed, but not when it lapses', () => {
    const fn = GUARD.slice(
      GUARD.indexOf('FUNCTION public.apply_hold_claimed_side_effects'),
    );
    expect(fn).toContain("OLD.status = 'on_hold'");
    // A lapsed or declined hold must stay silent — that client is being told
    // the slot is gone, not handed paperwork for it.
    expect(fn).toContain("'cancelled'");
  });
});
