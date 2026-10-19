import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.100.0';
import type Stripe from 'npm:stripe@17.4.0';

/** The client's existing Stripe Customer id, or null if they've never saved a
 *  card or checked out. client_stripe_customers is service-role only, so this
 *  takes the admin client. */
export async function findStripeCustomer(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: row, error } = await admin
    .from('client_stripe_customers')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (row?.stripe_customer_id as string | null) ?? null;
}

/** True when Stripe says the Customer no longer exists (deleted in the
 *  dashboard, or the account was switched between test and live). */
export function isMissingStripeCustomer(err: unknown): boolean {
  const e = err as { code?: string; param?: string } | null;
  return e?.code === 'resource_missing' && (e.param === 'customer' || e.param === 'id');
}

/** Forget a Customer id that Stripe no longer has, so the next call makes a
 *  fresh one instead of failing forever. Only clears the exact stale id. */
export async function forgetStripeCustomer(
  admin: SupabaseClient,
  userId: string,
  customerId: string,
): Promise<void> {
  const { error } = await admin
    .from('client_stripe_customers')
    .delete()
    .eq('user_id', userId)
    .eq('stripe_customer_id', customerId);
  if (error) throw error;
}

/**
 * Resolve the signed-in client's Stripe Customer id, creating it once and
 * reusing it after. This is the join that makes saved cards work: a card saved
 * through Stripe is only reusable at checkout if the SAME Customer is used to
 * save it and to charge it.
 *
 * The id lives in client_stripe_customers, which only the service role can
 * read or write, so it can never be pointed at someone else's Customer from
 * the app.
 */
export async function getOrCreateStripeCustomer(
  admin: SupabaseClient,
  stripe: Stripe,
  user: { id: string; email?: string | null },
): Promise<string> {
  const existing = await findStripeCustomer(admin, user.id);
  if (existing) {
    try {
      const customer = await stripe.customers.retrieve(existing);
      if (!('deleted' in customer && customer.deleted)) return existing;
    } catch (err) {
      if (!isMissingStripeCustomer(err)) throw err;
    }
    await forgetStripeCustomer(admin, user.id, existing);
  }

  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    metadata: { user_id: user.id },
  });

  // Only fill an empty slot, so concurrent calls converge on one Customer.
  const { error: writeError } = await admin
    .from('client_stripe_customers')
    .upsert({ user_id: user.id, stripe_customer_id: customer.id }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (writeError) {
    await deleteOrphan(stripe, customer.id);
    throw writeError;
  }

  const { data: fresh, error: readError } = await admin
    .from('client_stripe_customers')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .single();
  if (readError) throw readError;
  const bound = (fresh?.stripe_customer_id as string | null) ?? null;
  if (bound !== customer.id) {
    // The other call won the race: reuse its Customer, drop ours.
    await deleteOrphan(stripe, customer.id);
    if (!bound) throw new Error('Stripe customer was not recorded for this client');
  }
  return bound;
}

async function deleteOrphan(stripe: Stripe, customerId: string): Promise<void> {
  await stripe.customers.del(customerId).catch((err) => {
    console.error(`[stripeCustomer] could not delete orphaned customer ${customerId}: ${String(err)}`);
  });
}
