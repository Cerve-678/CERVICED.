/**
 * A one-off id for a request that must not happen twice — e.g. a refund. The
 * server uses it as the Stripe idempotency key, so a double tap or a network
 * retry carrying the same id returns the first result instead of repeating it.
 * Not a security token: uniqueness per attempt is all it needs.
 */
export function newRequestId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}
