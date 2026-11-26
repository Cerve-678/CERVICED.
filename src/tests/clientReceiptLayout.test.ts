// The client's in-app receipt (booking details → View Receipt): the service by
// name with add-ons under it and a Subtotal only when there are add-ons, the
// fee in lighter text, then Total, then the deposit beside what was paid.
// View Receipt itself is a dotted pill with no icon.

import * as fs from 'fs';
import * as path from 'path';

const src = fs.readFileSync(
  path.join(__dirname, '..', 'screens', 'client', 'BookingDetailScreen.tsx'),
  'utf8',
);
const at = (needle: string) => {
  const i = src.indexOf(needle);
  expect(i).toBeGreaterThan(-1);
  return i;
};

describe('client receipt layout', () => {
  it('names the service instead of "Base Price"', () => {
    expect(src).not.toContain('>Base Price<');
    at("{booking.serviceName || 'Service'}");
  });

  it('puts Subtotal right under the add-ons, only when there are any', () => {
    const addOns = at('(booking.addOns ?? []).map(');
    const subtotal = at('{payment.addOnsTotal > 0 && (');
    const fee = at("{tr('clientBooking.detail.platformFee')}");
    expect(addOns).toBeLessThan(subtotal);
    expect(subtotal).toBeLessThan(fee);
  });

  it('lists the deposit under Total, next to Paid', () => {
    const total = at("{tr('clientBooking.sheet.total')}");
    const deposit = at("{tr('clientBooking.detail.depositPaid')}");
    const paid = at("tr('clientBooking.detail.paidInclFee')");
    expect(total).toBeLessThan(deposit);
    expect(deposit).toBeLessThan(paid);
  });

  it('View Receipt has no icon', () => {
    const button = src.slice(at('style={[st.receiptButton'), at("{showReceipt ? tr('clientBooking.detail.hideReceipt') : tr('clientBooking.detail.viewReceipt')}"));
    expect(button).not.toContain('<Ionicons');
  });
});
