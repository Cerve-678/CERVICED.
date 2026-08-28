import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'supabase/migrations');

/** The newest migration that redefines `name`, read as text.
 *
 *  Deliberately resolved by scanning rather than by naming one file: the bug
 *  this suite exists for is a LATER reproduction of the function silently
 *  dropping the rule, which a test pinned to the file that added the rule
 *  would never see. iCloud's numbered forks (`… 2.sql`) are excluded — they
 *  are never applied (see supabase/MIGRATION_OWNER.md). */
function latestDefinitionOf(name: string): { file: string; body: string } {
  const marker = `FUNCTION public.${name}(`;
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !/ \d+\.sql$/.test(f))
    .sort()
    .filter(f => readFileSync(join(MIGRATIONS_DIR, f), 'utf8').includes(`CREATE OR REPLACE ${marker}`));
  const file = files[files.length - 1];
  if (!file) throw new Error(`No migration defines ${name}`);
  const text = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
  return { file, body: text.slice(text.indexOf(`CREATE OR REPLACE ${marker}`)) };
}

// An emergency request is a client asking for a time the provider's own rules
// exclude. It only exists because that provider opted into being ASKED — so it
// has to reach them as a question, never as a booking already made on their
// behalf. providers.auto_accept_bookings must not reach it.
//
// There are two checkout paths and for six days only one of them knew that.
// 20260821144027 taught finalize_checkout() the rule and left its twin,
// claim_cart_booking_slots() — the path the app actually runs — auto-
// confirming, so the provider's inbox never showed a pending row and none of
// the Confirm/Decline UI built for these ever rendered. Two live bookings were
// created that way, one of them at 00:30.
describe('an emergency request never auto-confirms, on either checkout path', () => {
  it('claim_cart_booking_slots() decides status from the held row, not auto-accept alone', () => {
    const { body } = latestDefinitionOf('claim_cart_booking_slots');

    // Both arms matter: a status of 'pending' with a confirmed_at timestamp
    // is a booking that reads as answered everywhere that checks the date.
    const armed = body.match(/CASE WHEN v_auto_accept AND NOT COALESCE\([\w.]*is_emergency_request, FALSE\)/g);
    expect(armed).toHaveLength(2);
    expect(body).toContain("THEN 'confirmed' ELSE 'pending' END");

    // The flag is stamped on the hold and read back off the row; the client's
    // p_items payload has no authority over whether this needs an answer.
    expect(body).not.toMatch(/v_item->>'is_emergency_request'/);
  });

  it('finalize_checkout() forces auto-accept off for one', () => {
    const { body } = latestDefinitionOf('finalize_checkout');
    expect(body).toMatch(
      /IF COALESCE\(v_booking\.is_emergency_request, false\) THEN v_auto_accept := false; END IF;/,
    );
  });

  it('tells the provider WHY they are being asked, on the path that asks them', () => {
    // A request that arrives looking like every other one is one they confirm
    // without registering that it is 8pm on a day they had blocked out. Same
    // split finalize_checkout() already made.
    const { body } = latestDefinitionOf('claim_cart_booking_slots');
    expect(body).toContain('Booking Request — Outside Your Hours');
    expect(body).toContain('New Booking Request');
  });
});
