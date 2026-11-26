import { readFileSync } from 'fs';
import { join } from 'path';

const REPO = join(__dirname, '..', '..');
const MIGRATION = readFileSync(
  join(REPO, 'supabase/migrations/20260907153528_own_cart_holds_never_block_their_owner.sql'),
  'utf8',
);
const CART = readFileSync(join(REPO, 'src/screens/client/CartScreen.tsx'), 'utf8');
// The Stripe sheet the Cart (and a waitlist ticket) opens.
const PAY_SHEET = readFileSync(join(REPO, 'src/features/cart/StripePaymentSheet.tsx'), 'utf8');

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
});

describe('leaving the Cart while a payment is going through', () => {
  // Found 2026-11-22: a client who left the Cart during "Confirming your
  // payment…" (a tapped notification, say) cancelled their own checkout, so
  // the server released the card they had just approved and dropped the booking.
  const abandon = CART.slice(
    CART.indexOf('const abandonOutstandingCheckout = useCallback'),
    CART.indexOf('// An RN Modal renders in a native overlay above whatever screen is'),
  );
  const pay = PAY_SHEET.slice(PAY_SHEET.indexOf('export const StripePaymentSheet'));

  it('does not cancel a checkout whose payment is in flight', () => {
    expect(abandon).toContain('if (paymentInFlightRef.current) return;');
    expect(abandon.indexOf('paymentInFlightRef.current')).toBeLessThan(abandon.indexOf('cancelCheckout('));
  });

  it('marks the payment in flight before Stripe is asked, and clears it however it ends', () => {
    expect(pay.indexOf('onPaymentInFlight?.(true)')).toBeGreaterThan(-1);
    expect(pay.indexOf('onPaymentInFlight?.(true)')).toBeLessThan(pay.indexOf('confirmPlatformPayPayment(clientSecret'));
    const fin = pay.slice(pay.indexOf('} finally {') + '} finally {'.length);
    expect(fin.slice(0, fin.indexOf('}'))).toContain('onPaymentInFlight?.(false)');
    expect(CART).toContain('onPaymentInFlight={inFlight => { paymentInFlightRef.current = inFlight; }}');
  });

  it('shows the success sheet only while the Cart is on screen', () => {
    expect(CART).toContain('if (navigation.isFocused()) setShowPaymentSuccessModal(true);');
  });

  // Found 2026-11-23: if the card was then refused, the decline only reached
  // the hidden sheet. Nothing cancelled the checkout, and the database's
  // double-booking guard counts the client's own hold, so trying again was
  // refused with "That time is no longer available" until the hold ran out.
  describe('when the payment then fails', () => {
    const fn = pay.slice(pay.indexOf('const releaseIfSheetLeft'));
    const helper = fn.slice(0, fn.indexOf('\n      };') + 9);
    const away = CART.slice(CART.indexOf('onPaymentFailedAway={(checkoutBatchId, message) =>'));
    const awayHandler = away.slice(0, away.indexOf('onPaymentPending={'));

    it('knows it has been left by the sheet opening it belongs to, moved on in the same tick as the leave', () => {
      expect(pay).toContain('const openId = getSheetOpenId?.();');
      expect(helper).toContain('if (getSheetOpenId?.() === openId) return false;');
      const blur = CART.slice(CART.indexOf("navigation.addListener('blur'"));
      const blurBody = blur.slice(0, blur.indexOf('abandonOutstandingCheckout()'));
      expect(blurBody).toContain('paymentSheetOpenIdRef.current += 1;');
      expect(CART).toContain('paymentSheetOpenIdRef.current += 1;\n                        setShowPaymentModal(true);');
    });

    it('cancels the payment, and never touches a newer checkout the Cart may have', () => {
      expect(helper).toContain('cancelPaymentIntent(checkoutBatchId, intentId)');
      expect(helper).not.toContain('onClose()');
      expect(awayHandler).toContain('if (serverCheckoutBatchIdRef.current === checkoutBatchId)');
    });

    it('says "still confirming" only when the server says the card was approved after all', () => {
      const failed = helper.slice(helper.indexOf('catch'));
      expect(failed).toContain('?.context?.status === 409');
      expect(failed.indexOf('=== 409')).toBeLessThan(failed.indexOf("onPaymentPending?.('unknown')"));
    });

    it('runs before the card goes to Stripe, on a refused card, on a wallet that would not start, and on a thrown error', () => {
      const early = pay.indexOf('if (await releaseIfSheetLeft(null)) return;');
      expect(early).toBeGreaterThan(-1);
      expect(early).toBeLessThan(pay.indexOf("if (method === 'paypal' && !paypalAvailable)"));
      expect(early).toBeLessThan(pay.indexOf('onPaymentInFlight?.(true)'));
      expect(pay).toContain('if (await releaseIfSheetLeft(confirmError.code');
      expect(pay).toContain("if (await releaseIfSheetLeft('We couldn");
      const caught = pay.slice(pay.indexOf('PAYMENT ERROR'));
      expect(caught.indexOf("releaseIfSheetLeft(handedToStripe ? '' : null)")).toBeLessThan(caught.indexOf('onClose();'));
    });

    it('tells the client their payment did not go through', () => {
      expect(helper).toContain('onPaymentFailedAway?.(checkoutBatchId, message)');
      expect(awayHandler).toContain(`showAlert("Payment didn't go through"`);
    });

    it('does not start a new checkout while the last payment is still going through', () => {
      const confirm = CART.slice(CART.indexOf("console.log('[CartScreen] Confirm & Pay pressed'"));
      const guard = confirm.indexOf('if (paymentInFlightRef.current) {');
      expect(guard).toBeGreaterThan(-1);
      expect(guard).toBeLessThan(confirm.indexOf('setIsReservingSlots(true);'));
    });
  });
});
