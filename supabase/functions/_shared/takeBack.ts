import type Stripe from 'npm:stripe@17.4.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.100.0';
import { isInsufficientBalance, planTakeBack } from './takeBackPlan.ts';

// Takes money back from a provider who was already paid. Reverses as much of
// the Stripe transfer as is left on it; anything Stripe won't reverse (the
// provider's Stripe balance can't cover it) or that the transfer never carried
// (part of the payout went to settling an earlier shortfall) is recorded as a
// shortfall, which release-payouts takes out of their next booking or
// late/no-show fee payout. Recording one notifies the provider (a trigger on
// provider_shortfalls, migration 20261029120000).
//
// Used by every path that claws back a paid provider: reconcileRefund,
// apply-cancellation-refund, booking-fee refunds and bank disputes.

export type ShortfallSource = 'refund' | 'cancellation' | 'fee_refund' | 'bank_dispute';

export interface TakeBackInput {
  providerId: string;
  bookingId: string | null;
  source: ShortfallSource;
  /** null when nothing was ever transferred (a payout fully used on shortfalls). */
  transferId: string | null;
  /** How much to take back. Omit to take back everything left on the transfer. */
  wantPence?: number;
  /** Most the transfer itself can return. Omit to read it from Stripe. */
  reversiblePence?: number;
  /** Idempotency key for the reversal; also the shortfall's unique key. */
  key: string;
  metadata: Record<string, string>;
}

export interface TakeBackResult {
  reversalId: string | null;
  reversedPence: number;
  shortfallPence: number;
}

export async function takeBackFromProvider(
  admin: SupabaseClient,
  stripe: Stripe,
  input: TakeBackInput,
): Promise<TakeBackResult> {
  let reversible = input.reversiblePence;
  if (reversible === undefined) {
    if (!input.transferId) {
      reversible = 0;
    } else {
      const transfer = await stripe.transfers.retrieve(input.transferId);
      reversible = transfer.amount - (transfer.amount_reversed ?? 0);
    }
  }
  const want = input.wantPence ?? reversible;
  const plan = planTakeBack(want, reversible);

  // A retry after an earlier attempt already recorded this as owed must not
  // also reverse it now — that would take the money twice.
  const { data: existing, error: existingErr } = await admin.from('provider_shortfalls')
    .select('amount_pence').eq('source_key', input.key).maybeSingle();
  if (existingErr) throw existingErr;
  if (existing) return { reversalId: null, reversedPence: 0, shortfallPence: Number(existing.amount_pence) };

  let reversalId: string | null = null;
  let reversed = 0;
  let shortfall = plan.shortfall;
  let unreversed = 0;
  if (plan.reverse > 0 && input.transferId) {
    try {
      const reversal = await stripe.transfers.createReversal(
        input.transferId,
        { amount: plan.reverse, metadata: input.metadata },
        { idempotencyKey: input.key },
      );
      reversalId = reversal.id;
      reversed = plan.reverse;
    } catch (err) {
      if (!isInsufficientBalance(err)) throw err;
      shortfall += plan.reverse;
      unreversed = plan.reverse;
    }
  } else {
    shortfall += plan.reverse;
  }

  if (shortfall > 0) {
    const { error } = await admin.from('provider_shortfalls').upsert({
      provider_id: input.providerId,
      booking_id: input.bookingId,
      source: input.source,
      source_key: input.key,
      stripe_transfer_id: input.transferId,
      amount_pence: shortfall,
      unreversed_pence: unreversed,
    }, { onConflict: 'source_key', ignoreDuplicates: true });
    if (error) throw error;
    console.warn(`[takeBack] provider ${input.providerId} owes ${shortfall}p (${input.source}, ${input.key}); it comes out of their next payout`);
  }
  return { reversalId, reversedPence: reversed, shortfallPence: shortfall };
}
