/**
 * Name search for the provider's Clientele list. Pure, so the screen and its
 * test share one definition of what a match is.
 */

/** Spaces and capitals don't matter; a match anywhere in the name counts. */
export function searchClientele<T extends { customer_name: string | null }>(
  clients: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLocaleLowerCase('en-GB');
  if (!q) return [...clients];
  return clients.filter(c => (c.customer_name ?? '').toLocaleLowerCase('en-GB').includes(q));
}
