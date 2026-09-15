import { readFileSync } from 'fs';
import { join } from 'path';

const REPO = join(__dirname, '..', '..');
const MIGRATION = readFileSync(
  join(REPO, 'supabase/migrations/20260907153537_private_cart_holds_never_become_bookings.sql'),
  'utf8',
);
const FINALIZE_EDGE = readFileSync(
  join(REPO, 'supabase/functions/finalize-payment-intent/index.ts'),
  'utf8',
);

describe('cart reservations stay private implementation state', () => {
  it('keeps the waitlist expiry worker away from cart holds', () => {
    const fn = MIGRATION.slice(
      MIGRATION.indexOf('FUNCTION public.expire_waitlist_holds'),
      MIGRATION.indexOf('FUNCTION public.cancel_checkout'),
    );
    expect(fn).toContain('waitlist_entry_id IS NOT NULL');
    expect(fn).toContain('hold_batch_id IS NULL');
  });

  it('deletes cancelled checkout holds instead of creating Past bookings', () => {
    const fn = MIGRATION.slice(MIGRATION.indexOf('FUNCTION public.cancel_checkout'));
    const body = fn.slice(0, fn.indexOf('$function$;', fn.indexOf('$function$') + 1));
    expect(body).toContain('DELETE FROM public.bookings b');
    expect(body).toContain("b.status = 'on_hold'");
    expect(body).toContain('b.hold_batch_id = p_checkout_batch_id');
    expect(body).toContain('b.user_id = auth.uid()');
    expect(body).not.toContain("SET status = 'cancelled'\n   WHERE hold_batch_id");
  });

  it('does not delete a hold with money or a review attached', () => {
    const fn = MIGRATION.slice(MIGRATION.indexOf('FUNCTION public.cancel_checkout'));
    expect(fn).toContain('public.transactions t WHERE t.booking_id = b.id');
    expect(fn).toContain('public.reviews r WHERE r.booking_id = b.id');
  });

  it('routes Stripe cancellation through the owner-checked cleanup RPC', () => {
    const cancelBranch = FINALIZE_EDGE.slice(
      FINALIZE_EDGE.indexOf("if (body.action === 'cancel')"),
      FINALIZE_EDGE.indexOf("if (batch.status !== 'prepared'"),
    );
    expect(cancelBranch).toContain("supabase.rpc('cancel_checkout'");
    expect(cancelBranch).not.toContain("from('bookings').update");
    expect(cancelBranch).not.toContain("status: 'cancelled'");
  });

  it('cleans existing placeholder history and linked notifications safely', () => {
    expect(MIGRATION).toContain("b.service_name_snapshot = 'Reserving' || chr(8230)");
    expect(MIGRATION).toContain("b.provider_name_snapshot = 'Reserving' || chr(8230)");
    expect(MIGRATION).toContain('DELETE FROM public.notifications n');
  });
});
