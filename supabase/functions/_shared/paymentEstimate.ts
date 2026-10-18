// When one booking's share reaches the provider's Stripe balance, from Stripe's
// own figures. A Transfer made with source_transaction (what release-payouts
// uses) takes on the client's charge's availability, which Stripe counts from
// the client's payment, not from our release. So:
//   - held:        the client charge's available_on (the app takes the later
//                  of that and release_after)
//   - transferred: the connected-side payment's own available_on (exact)
// The bank date is worked out in the app from the payout schedule returned here.
// The payout row is read with the caller's own session (RLS:
// provider_payouts_owner_read) and the provider id, before anything is read
// with the service role, so a caller can only ever ask about their own payment.

export interface PaymentEstimate {
  status: string;
  releaseAfter: string;
  /** Unix seconds the money is (or becomes) available in the provider's Stripe balance; null if Stripe has no date. */
  availableOn: number | null;
  schedule: { interval: string; weeklyAnchor: string | null; monthlyAnchor: number | null } | null;
}

// deno-lint-ignore no-explicit-any
type Client = any;

export async function readPaymentEstimate(stripe: Client, userClient: Client, admin: Client, providerId: string,
  accountId: string | null, payoutId: string): Promise<PaymentEstimate | null> {
  const { data: row, error } = await userClient.from('provider_payouts')
    .select('id, booking_id, status, release_after, stripe_transfer_id')
    .eq('id', payoutId).eq('provider_id', providerId).maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const schedulePromise = accountId
    ? stripe.accounts.retrieve(accountId).then((account: Client) => {
      const s = account.settings?.payouts?.schedule;
      return s ? { interval: s.interval, weeklyAnchor: s.weekly_anchor ?? null, monthlyAnchor: s.monthly_anchor ?? null } : null;
    })
    : Promise.resolve(null);
  // Marked handled so a failure here while the lookups below are still running
  // isn't an unhandled rejection; the await at the end still throws it.
  schedulePromise.catch(() => {});

  let availableOn: number | null = null;
  if (row.status === 'transferred' && row.stripe_transfer_id && accountId) {
    const transfer = await stripe.transfers.retrieve(row.stripe_transfer_id);
    const paymentId = typeof transfer.destination_payment === 'string' ? transfer.destination_payment : transfer.destination_payment?.id;
    if (paymentId) {
      const payment = await stripe.charges.retrieve(paymentId, { expand: ['balance_transaction'] }, { stripeAccount: accountId });
      availableOn = payment.balance_transaction?.available_on ?? null;
    }
  } else if (row.status === 'held') {
    // Providers don't read bookings.payment_intent_id, so it's read with the
    // service role — only for the booking of a payout the caller already owns.
    const { data: booking, error: bookingError } = await admin.from('bookings')
      .select('payment_intent_id').eq('id', row.booking_id).maybeSingle();
    if (bookingError) throw bookingError;
    if (booking?.payment_intent_id) {
      const intent = await stripe.paymentIntents.retrieve(booking.payment_intent_id, { expand: ['latest_charge.balance_transaction'] });
      availableOn = intent.latest_charge?.balance_transaction?.available_on ?? null;
    }
  }

  return { status: row.status, releaseAfter: row.release_after, availableOn, schedule: await schedulePromise };
}
