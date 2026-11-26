import { readFileSync } from 'fs';
import { join } from 'path';
import { priceChangedFrom } from '../features/cart/pricing';

const REPO = join(__dirname, '..', '..');
const CART = readFileSync(join(REPO, 'src/screens/client/CartScreen.tsx'), 'utf8');
const PAY_SHEET = readFileSync(join(REPO, 'src/features/cart/StripePaymentSheet.tsx'), 'utf8');

// The server prices a checkout from the provider's live prices, so a price
// changed after the service went in the cart is what the card is charged.
// The client must be told before paying, not find out on their statement.
describe('a price that changed after it went in the cart', () => {
  it('is reported with the total the client was shown', () => {
    expect(priceChangedFrom(40, 45)).toBe(40);
    expect(priceChangedFrom(52.5, 48.3)).toBe(52.5);
  });

  it('is not reported when the totals agree to the penny', () => {
    expect(priceChangedFrom(45, 45)).toBeNull();
    // Floating-point sums of the same pence.
    expect(priceChangedFrom(45.3 + 45.3 + 45.3, 135.9)).toBeNull();
  });

  it('compares the server total with what the summary showed, and passes it to the sheet', () => {
    expect(CART).toContain('setPriceChangedTotal(priceChangedFrom(frozenCheckoutTotals.total, prepared.amountDue));');
    expect(CART).toContain('previousTotal={priceChangedTotal}');
  });

  it('says so in the sheet and hides the old per-service prices', () => {
    expect(PAY_SHEET).toContain("t('cart.payment.priceChanged'");
    expect(PAY_SHEET).toContain('previousTotal == null &&');
  });
});
