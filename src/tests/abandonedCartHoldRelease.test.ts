import { readFileSync } from 'fs';
import { join } from 'path';

const REPO = join(__dirname, '..', '..');
const MIGRATION = readFileSync(
  join(REPO, 'supabase/migrations/20260907153528_own_cart_holds_never_block_their_owner.sql'),
  'utf8',
);
const CART = readFileSync(join(REPO, 'src/screens/client/CartScreen.tsx'), 'utf8');

// Reproduced live on 2026-09-07: two "Confirm & Pay" taps left an on_hold row
// each, neither released, and the client who placed them was then told their
// own 11:30 and 12:30 were unavailable. Both halves of the fix are easy to
// undo by accident — one is a NOT(...) buried in a long WHERE clause, the
// other a cleanup effect that looks redundant next to the × button's release.

describe('a client’s own cart hold never blocks that client', () => {
  const busySpans = MIGRATION.slice(
    MIGRATION.indexOf('FUNCTION public.get_provider_busy_spans'),
    MIGRATION.indexOf('FUNCTION public.hold_cart_booking_slots'),
  );

  it('excludes the caller’s own cart hold from their busy spans', () => {
    const exclusion = busySpans.slice(busySpans.indexOf('AND NOT ('));
    expect(exclusion).toContain("b.status = 'on_hold'");
    expect(exclusion).toContain('b.hold_batch_id IS NOT NULL');
    expect(exclusion).toContain('b.user_id = auth.uid()');
  });

  it('guards that exclusion on auth.uid() being present', () => {
    // Without it, an anonymous caller (auth.uid() NULL) turns the comparison
    // NULL, NOT(NULL) is NULL, and every held row is silently dropped from
    // the result — the slot picker would offer other people's held slots.
    const exclusion = busySpans.slice(busySpans.indexOf('AND NOT ('));
    expect(exclusion).toContain('auth.uid() IS NOT NULL');
  });

  it('still hides a hold that is NOT a cart hold from nobody it used to', () => {
    // Reschedule holds carry no hold_batch_id and must keep blocking.
    expect(busySpans).toContain("AND (b.status <> 'on_hold' OR b.hold_expires_at IS NULL OR b.hold_expires_at > NOW())");
  });
});

describe('placing a hold clears the caller’s own stranded ones first', () => {
  const holdFn = MIGRATION.slice(MIGRATION.indexOf('FUNCTION public.hold_cart_booking_slots'));

  it('deletes before inserting, or the client’s leftover row rejects the retry', () => {
    const del = holdFn.indexOf('DELETE FROM public.bookings b');
    const insert = holdFn.indexOf('INSERT INTO public.bookings');
    expect(del).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(-1);
    expect(del).toBeLessThan(insert);
  });

  it('never touches another batch’s, another client’s, or a reschedule hold', () => {
    const del = holdFn.slice(holdFn.indexOf('DELETE FROM public.bookings b'));
    const clause = del.slice(0, del.indexOf(';'));
    expect(clause).toContain('b.user_id = auth.uid()');
    expect(clause).toContain('b.hold_batch_id IS NOT NULL');
    expect(clause).toContain('b.hold_batch_id <> p_hold_batch_id');
  });

  it('never touches a row with money or a review attached', () => {
    const del = holdFn.slice(holdFn.indexOf('DELETE FROM public.bookings b'));
    const clause = del.slice(0, del.indexOf(';'));
    expect(clause).toContain('public.transactions t WHERE t.booking_id = b.id');
    expect(clause).toContain('public.reviews r WHERE r.booking_id = b.id');
  });
});

describe('CartScreen hands the slots back on every exit it can see', () => {
  it('releases when the client navigates away from the cart', () => {
    const blur = CART.slice(CART.indexOf("navigation.addListener('blur'"));
    expect(blur.slice(0, 600)).toContain('abandonOutstandingCheckout()');
  });

  it('releases when the screen unmounts', () => {
    expect(CART).toContain('useEffect(() => () => abandonRef.current(), [])');
  });

  it('refuses to release while the hold is being claimed', () => {
    // Releasing mid-claim DELETEs the rows claim_cart_booking_slots is
    // converting, and its fallback insert has been RLS-blocked since
    // 20260810180302 — the booking would not be re-created, just lost.
    const fn = CART.slice(CART.indexOf('const abandonOutstandingCheckout'));
    expect(fn.slice(0, 400)).toContain('if (isClaimingRef.current) return;');
    expect(CART).toContain('isClaimingRef.current = true;');
    expect(CART).toContain('isClaimingRef.current = false;');
  });
});
