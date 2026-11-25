import { chargeWasApproved, declineKey } from '../../supabase/functions/_shared/checkoutCharge';

describe('chargeWasApproved', () => {
  it('counts an approval, including one cancelled before capture', () => {
    expect(chargeWasApproved({ status: 'succeeded', captured: false })).toBe(true);
  });

  it('does not count a declined attempt', () => {
    expect(chargeWasApproved({ status: 'failed' })).toBe(false);
  });

  it('does not count no charge, or a charge that was not expanded', () => {
    expect(chargeWasApproved(null)).toBe(false);
    expect(chargeWasApproved('ch_123')).toBe(false);
  });
});

// The payment sheet stamps the refusal it showed (decline_seen); the 5-minute
// cleanup only notifies a refusal it didn't. Each refusal needs its own key.
describe('declineKey', () => {
  it('is null when nothing was refused', () => {
    expect(declineKey({ last_payment_error: null })).toBeNull();
    expect(declineKey({})).toBeNull();
  });

  it('names a declined card by its failed charge, so a second decline is a new one', () => {
    expect(declineKey({ last_payment_error: { charge: 'ch_1', code: 'card_declined' } })).toBe('charge:ch_1');
    expect(declineKey({ last_payment_error: { charge: 'ch_2', code: 'card_declined' } })).toBe('charge:ch_2');
  });

  it('names a failed bank check, which leaves no charge, by card and reason', () => {
    expect(declineKey({ last_payment_error: { payment_method: { id: 'pm_1' }, code: 'payment_intent_authentication_failure' } }))
      .toBe('refused:pm_1:payment_intent_authentication_failure');
  });
});

describe('a decline the client already saw', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('path') as typeof import('path');
  const read = (p: string) => readFileSync(join(__dirname, '../..', p), 'utf8');
  const SHEET = read('src/features/cart/StripePaymentSheet.tsx');
  const RECONCILE = read('supabase/functions/reconcile-checkouts/index.ts');
  const FINALIZE = read('supabase/functions/finalize-payment-intent/index.ts');

  it('is marked seen by the payment sheet right after it shows it, not for one the client cancelled', () => {
    const shown = SHEET.indexOf("if (confirmError.code !== 'Canceled') {\n            setPayError(");
    expect(shown).toBeGreaterThan(-1);
    const branch = SHEET.slice(shown, SHEET.indexOf('return;', shown));
    expect(branch).toContain('if (isCardError) {\n              markDeclineSeen(checkoutBatchId, paymentIntentId)');
  });

  it('is stamped on the payment only after the usual ownership checks', () => {
    expect(FINALIZE.indexOf("body.action === 'decline_seen'")).toBeGreaterThan(FINALIZE.indexOf("'Not your payment'"));
    expect(FINALIZE.indexOf("body.action === 'decline_seen'")).toBeGreaterThan(FINALIZE.indexOf("'Checkout not found'"));
  });

  it('is not notified again by the 5-minute cleanup', () => {
    expect(RECONCILE).toContain('intent.metadata?.decline_seen !== refused');
    expect(RECONCILE).toContain("cancelled === 'abandoned' && unseen ? 'declined' : cancelled");
  });
});
