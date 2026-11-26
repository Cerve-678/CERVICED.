// Did the card actually approve this payment? Takes a PaymentIntent's expanded
// latest_charge. Zero imports so jest can test it.
//
// A declined attempt leaves a charge behind too, with status 'failed', so a
// charge merely existing proves nothing. An approval shows as 'succeeded', and
// stays that way if it's cancelled before capture.
export function chargeWasApproved(latestCharge: unknown): boolean {
  if (typeof latestCharge !== 'object' || latestCharge === null) return false;
  return (latestCharge as { status?: unknown }).status === 'succeeded';
}

// Which refused attempt a payment's last_payment_error describes: the failed
// charge when there is one, otherwise the card and the reason (a failed bank
// check leaves no charge). The payment sheet stamps this into the payment's
// metadata (decline_seen, via finalize-payment-intent) when it shows the
// client the refusal, and reconcile-checkouts only notifies them of a refusal
// not stamped. Null when nothing was refused.
export function declineKey(intent: {
  last_payment_error?: {
    charge?: string | null;
    payment_method?: { id?: string } | string | null;
    code?: string | null;
    type?: string | null;
  } | null;
}): string | null {
  const error = intent.last_payment_error;
  if (!error) return null;
  if (error.charge) return `charge:${error.charge}`;
  const pm = error.payment_method;
  const paymentMethodId = typeof pm === 'string' ? pm : pm?.id ?? '';
  return `refused:${paymentMethodId}:${error.code ?? error.type ?? ''}`;
}
