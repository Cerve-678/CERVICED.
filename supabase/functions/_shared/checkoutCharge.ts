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
