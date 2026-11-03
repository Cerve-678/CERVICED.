import {
  settledFromBatch,
  settledFromCaptureStatus,
  waitForCheckoutOutcome,
} from '../features/cart/checkoutOutcome';

const noSleep = () => Promise.resolve();

describe('checkout outcome', () => {
  it('reads the capture answer', () => {
    expect(settledFromCaptureStatus('succeeded')).toBe('succeeded');
    expect(settledFromCaptureStatus('refunded')).toBe('refunded');
    expect(settledFromCaptureStatus('canceled')).toBe('not_charged');
    expect(settledFromCaptureStatus('processing')).toBeNull();
  });

  it('reads the checkout row', () => {
    expect(settledFromBatch({ status: 'finalised', outcome: null })).toBe('succeeded');
    expect(settledFromBatch({ status: 'expired', outcome: 'refunded' })).toBe('refunded');
    expect(settledFromBatch({ status: 'expired', outcome: 'not_charged' })).toBe('not_charged');
    expect(settledFromBatch({ status: 'expired', outcome: 'abandoned' })).toBeNull();
    expect(settledFromBatch({ status: 'prepared', outcome: null })).toBeNull();
  });

  it('keeps asking while the server is failing, and stops at the first answer', async () => {
    let calls = 0;
    const result = await waitForCheckoutOutcome({
      capture: async () => { calls += 1; if (calls < 3) throw new Error('timeout'); return 'succeeded'; },
      readBatch: async () => ({ status: 'prepared', outcome: null }),
      sleep: noSleep,
    });
    expect(result).toBe('succeeded');
    expect(calls).toBe(3);
  });

  it('takes the answer from the checkout row when capture keeps failing', async () => {
    const result = await waitForCheckoutOutcome({
      capture: async () => { throw new Error('500'); },
      readBatch: async () => ({ status: 'expired', outcome: 'refunded' }),
      sleep: noSleep,
    });
    expect(result).toBe('refunded');
  });

  it("says it doesn't know yet rather than guessing", async () => {
    const errors: unknown[] = [];
    const result = await waitForCheckoutOutcome({
      capture: async () => { throw new Error('500'); },
      readBatch: async () => ({ status: 'prepared', outcome: null }),
      sleep: noSleep,
      onError: err => errors.push(err),
      attempts: 2,
    });
    expect(result).toBe('unknown');
    expect(errors).toHaveLength(2);
  });
});
