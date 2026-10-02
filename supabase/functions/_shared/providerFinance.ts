// Read-only connected-account projection. Never accept an account ID from the app.
export async function readProviderFinance(stripe: any, accountId: string | null, cursor?: string) {
  if (!accountId) return { connected: false, livemode: false, available: [], pending: [], payouts: [], hasMore: false };
  const scope = { stripeAccount: accountId };
  const [balance, payouts] = await Promise.all([
    stripe.balance.retrieve({}, scope),
    stripe.payouts.list({ limit: 20, ...(cursor ? { starting_after: cursor } : {}) }, scope),
  ]);
  return {
    connected: true,
    livemode: balance.livemode,
    available: balance.available.map(({ amount, currency }: any) => ({ amount, currency })),
    pending: balance.pending.map(({ amount, currency }: any) => ({ amount, currency })),
    payouts: payouts.data.map((p: any) => ({
      id: p.id, amount: p.amount, currency: p.currency, status: p.status,
      arrivalDate: p.arrival_date, created: p.created, automatic: p.automatic,
    })),
    hasMore: payouts.has_more,
  };
}
