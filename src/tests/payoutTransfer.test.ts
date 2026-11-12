import { findPayoutTransfer, type TransferLike } from '../../supabase/functions/_shared/payoutTransfer';

type ListParams = { destination: string; created: { gte: number }; limit: number };

function fakeStripe(transfers: TransferLike[], fail = false) {
  const calls: ListParams[] = [];
  return {
    calls,
    transfers: {
      list(params: ListParams): AsyncIterable<TransferLike> {
        calls.push(params);
        return {
          async *[Symbol.asyncIterator]() {
            if (fail) throw new Error('stripe unavailable');
            yield* transfers;
          },
        };
      },
    },
  };
}

const createdAt = '2026-11-06T18:30:00Z';

describe('findPayoutTransfer', () => {
  it('finds the transfer for this payout among others sent from the same charge', async () => {
    const stripe = fakeStripe([
      { id: 'tr_other', metadata: { payout_id: 'payout-a' } },
      { id: 'tr_none', metadata: {} },
      { id: 'tr_mine', metadata: { payout_id: 'payout-b' } },
    ]);
    const found = await findPayoutTransfer(stripe, 'acct_1', 'payout-b', createdAt);
    expect(found?.id).toBe('tr_mine');
  });

  it('returns null when nothing has been sent for this payout yet', async () => {
    const stripe = fakeStripe([{ id: 'tr_other', metadata: { payout_id: 'payout-a' } }, { id: 'tr_x', metadata: null }]);
    await expect(findPayoutTransfer(stripe, 'acct_1', 'payout-b', createdAt)).resolves.toBeNull();
  });

  it("asks only for the provider's own transfers since a day before the payout was created", async () => {
    const stripe = fakeStripe([]);
    await findPayoutTransfer(stripe, 'acct_1', 'payout-b', createdAt);
    expect(stripe.calls).toEqual([{
      destination: 'acct_1',
      created: { gte: Date.parse(createdAt) / 1000 - 86_400 },
      limit: 100,
    }]);
  });

  it("throws when Stripe can't be asked, so a caller never reads that as nothing sent", async () => {
    await expect(findPayoutTransfer(fakeStripe([], true), 'acct_1', 'payout-b', createdAt)).rejects.toThrow('stripe unavailable');
    await expect(findPayoutTransfer(fakeStripe([]), 'acct_1', 'payout-b', 'not a date')).rejects.toThrow('created_at');
  });
});
