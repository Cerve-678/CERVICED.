import { releaseEarlierPayments } from '../features/cart/releaseEarlierPayments';

// Found 2026-11-25: the app closed while paying, the card was declined, and
// on reopening, paying again for the same time said it was taken, because
// the client's own failed checkout still held it.
describe('releaseEarlierPayments', () => {
  const slots = [{ providerId: 'p1', date: '2026-12-01', time: '14:30' }];
  const earlier = [{ checkoutBatchId: 'b1', paymentIntentId: 'pi_1' }];

  it('cancels the earlier declined payment, so paying again can go ahead', async () => {
    const cancel = jest.fn().mockResolvedValue(undefined);
    const find = jest.fn().mockResolvedValue(earlier);
    await expect(releaseEarlierPayments(slots, { find, cancel })).resolves.toBe('clear');
    expect(find).toHaveBeenCalledWith(slots);
    expect(cancel).toHaveBeenCalledWith('b1', 'pi_1');
  });

  it('does nothing when there is no earlier payment', async () => {
    const cancel = jest.fn();
    await expect(releaseEarlierPayments(slots, { find: jest.fn().mockResolvedValue([]), cancel })).resolves.toBe('clear');
    expect(cancel).not.toHaveBeenCalled();
  });

  it('says the last payment is still going through when Stripe had approved it (409)', async () => {
    const cancel = jest.fn().mockRejectedValue({ context: { status: 409 } });
    const onError = jest.fn();
    await expect(releaseEarlierPayments(slots, { find: jest.fn().mockResolvedValue(earlier), cancel, onError }))
      .resolves.toBe('still_paying');
    expect(onError).not.toHaveBeenCalled();
  });

  it('lets them pay when a cancel fails for any other reason, and logs it', async () => {
    const onError = jest.fn();
    const cancel = jest.fn().mockRejectedValue(new Error('network'));
    await expect(releaseEarlierPayments(slots, { find: jest.fn().mockResolvedValue(earlier), cancel, onError }))
      .resolves.toBe('clear');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('lets them pay when the earlier payments could not be read, and logs it', async () => {
    const onError = jest.fn();
    const cancel = jest.fn();
    await expect(releaseEarlierPayments(slots, { find: jest.fn().mockRejectedValue(new Error('offline')), cancel, onError }))
      .resolves.toBe('clear');
    expect(cancel).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('cancels every earlier payment, and one approved among them still stops a new payment', async () => {
    const cancel = jest.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ context: { status: 409 } });
    const find = jest.fn().mockResolvedValue([...earlier, { checkoutBatchId: 'b2', paymentIntentId: 'pi_2' }]);
    await expect(releaseEarlierPayments(slots, { find, cancel })).resolves.toBe('still_paying');
    expect(cancel).toHaveBeenCalledTimes(2);
  });
});

describe('the Cart', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('path') as typeof import('path');
  const CART = readFileSync(join(__dirname, '../screens/client/CartScreen.tsx'), 'utf8');

  it('cancels an earlier failed payment before preparing the new checkout, and stops on one still going through', () => {
    const release = CART.indexOf('await releaseEarlierPayments(');
    const prepare = CART.indexOf('await prepareCheckout(intent)');
    expect(release).toBeGreaterThan(-1);
    expect(release).toBeLessThan(prepare);
    const between = CART.slice(release, prepare);
    expect(between).toContain("if (earlier === 'still_paying')");
    expect(between).toContain('Your last payment is still going through');
  });
});
