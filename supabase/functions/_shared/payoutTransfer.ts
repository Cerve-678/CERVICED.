// Finding the Stripe transfer that already paid a booking payout, without
// relying on a per-payout transfer group.
//
// One card charge often pays several bookings (a multi-service checkout), so
// several payouts are sent from the same charge. Stripe stamps the charge with
// the transfer group of the FIRST transfer made from it, and then refuses any
// later transfer from that charge that names a different group ("You cannot
// use `transfer_group` if the `source_transaction` already has one set").
// Booking payouts therefore send no transfer group at all, and find an earlier
// transfer by the `payout_id` metadata every payout transfer carries instead.
//
// Import-free (the Stripe client is passed in, typed by shape) so src/tests
// can pin it; the Deno functions apply it.

export interface TransferLike {
  id: string;
  metadata: Record<string, string> | null;
}

interface TransferListParams {
  destination: string;
  created: { gte: number };
  limit: number;
}

/** A day either side of the payout row's creation covers clock skew. */
const LOOKBACK_SECONDS = 24 * 60 * 60;

/**
 * The transfer already sent for this payout, or null if none was. Looks only
 * at the provider's own transfers made since the payout row was created, so
 * the scan stays small. Throws if Stripe can't be asked: callers must treat
 * that as "don't know", never as "nothing was sent".
 */
export async function findPayoutTransfer<T extends TransferLike>(
  stripe: { transfers: { list(params: TransferListParams): AsyncIterable<T> } },
  destination: string,
  payoutId: string,
  payoutCreatedAt: string,
): Promise<T | null> {
  const createdMs = Date.parse(payoutCreatedAt);
  if (Number.isNaN(createdMs)) throw new Error(`payout ${payoutId} has no usable created_at`);
  const gte = Math.floor(createdMs / 1000) - LOOKBACK_SECONDS;
  for await (const transfer of stripe.transfers.list({ destination, created: { gte }, limit: 100 })) {
    if (transfer.metadata?.['payout_id'] === payoutId) return transfer;
  }
  return null;
}
