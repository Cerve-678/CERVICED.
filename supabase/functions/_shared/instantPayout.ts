// Instant Payouts: a provider sends money that is already in their Stripe
// balance to their debit card or bank in ~30 minutes, for a fee.
//
// Only the provider's Stripe balance can be paid out, and money reaches that
// balance only when release-payouts transfers it after CERVICED's hold, so
// this never pays out anything still held for refunds or no-show disputes.
//
// The fee is not computed here. It is set once in Stripe's Platform Pricing
// Tool (Connect → Instant Payouts) and Stripe takes it as an application fee
// on each payout. instant_available.net_available is Stripe's own figure
// after that fee, so what the provider is shown is what Stripe charges.
// A destination with no fee configured (net == gross) is refused, so CERVICED
// never silently absorbs Stripe's 1% because the dashboard wasn't set.

export interface InstantDestination {
  id: string;
  /** "Monzo ••1234" or "Visa debit ••4242". Never a full number: Stripe doesn't return one. */
  label: string;
  currency: string;
  /** What leaves their Stripe balance (pence). */
  grossPence: number;
  /** What reaches them after the fee (pence). */
  netPence: number;
}

export interface InstantAvailability {
  eligible: boolean;
  destinations: InstantDestination[];
}

// Stripe's GB per-payout minimum.
export const INSTANT_MIN_PENCE = 40;

// deno-lint-ignore no-explicit-any
type StripeClient = any;

function describe(ext: { object: string; bank_name?: string | null; brand?: string | null; last4: string }): string {
  if (ext.object === 'card') return `${ext.brand ?? 'Debit card'} ••${ext.last4}`;
  return `${ext.bank_name ?? 'Bank account'} ••${ext.last4}`;
}

export async function readInstantAvailability(stripe: StripeClient, accountId: string | null): Promise<InstantAvailability> {
  if (!accountId) return { eligible: false, destinations: [] };
  const scope = { stripeAccount: accountId };
  const [account, balance, externals] = await Promise.all([
    stripe.accounts.retrieve(accountId),
    stripe.balance.retrieve({ expand: ['instant_available.net_available'] }, scope),
    stripe.accounts.listExternalAccounts(accountId, { limit: 10 }),
  ]);
  if (!account.payouts_enabled) return { eligible: false, destinations: [] };

  const instantCapable = new Map<string, string>();
  // Their default card/bank first, so destinations[0] is the one they'd expect.
  const ordered = [...(externals.data ?? [])].sort((a, b) => Number(!!b.default_for_currency) - Number(!!a.default_for_currency));
  for (const ext of ordered) {
    if ((ext.available_payout_methods ?? []).includes('instant')) instantCapable.set(ext.id, describe(ext));
  }

  const order = [...instantCapable.keys()];
  const destinations: InstantDestination[] = [];
  for (const pot of balance.instant_available ?? []) {
    if (pot.currency !== 'gbp') continue;
    for (const net of pot.net_available ?? []) {
      const label = instantCapable.get(net.destination);
      // net < gross: a fee is configured. Without one, refuse rather than pay
      // Stripe's 1% out of CERVICED's pocket.
      if (!label || net.amount >= pot.amount) continue;
      destinations.push({ id: net.destination, label, currency: pot.currency, grossPence: pot.amount, netPence: net.amount });
    }
  }
  destinations.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return { eligible: instantCapable.size > 0, destinations };
}

export type InstantPayoutResult =
  | { ok: true; payoutId: string; netPence: number; arrivalDate: number }
  | { ok: false; code: 'instant_unavailable' | 'instant_amount_changed' | 'instant_below_minimum'; status: number };

/**
 * Pays out the provider's whole instant balance to one destination. The app
 * sends the after-fee amount the provider confirmed; if the balance moved in
 * between (a release landed, a refund was taken back), it's refused so the
 * provider never confirms one figure and gets another.
 */
export async function createInstantPayout(stripe: StripeClient, accountId: string, providerId: string,
  destination: string, confirmedNetPence: number, requestId: string): Promise<InstantPayoutResult> {
  const { destinations } = await readInstantAvailability(stripe, accountId);
  const target = destinations.find(d => d.id === destination);
  if (!target) return { ok: false, code: 'instant_unavailable', status: 409 };
  if (target.netPence !== confirmedNetPence) return { ok: false, code: 'instant_amount_changed', status: 409 };
  if (target.netPence < INSTANT_MIN_PENCE) return { ok: false, code: 'instant_below_minimum', status: 409 };

  const payout = await stripe.payouts.create(
    {
      amount: target.netPence,
      currency: target.currency,
      method: 'instant',
      destination: target.id,
      metadata: { provider_id: providerId, source: 'cerviced_app', request_id: requestId },
    },
    { stripeAccount: accountId, idempotencyKey: `instant_${accountId}_${requestId}` },
  );
  return { ok: true, payoutId: payout.id, netPence: payout.amount, arrivalDate: payout.arrival_date };
}
