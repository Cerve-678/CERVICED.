import type { ConfirmedBooking } from '../../contexts/BookingContext';
import { formatLongDate, formatShortDate } from '../../utils/dateUtils';
import { PAYMENT_METHOD_LABELS, calculateBookingPaymentBreakdown } from './paymentPresentation';

const money = (amount: number) => `£${Math.max(0, amount).toFixed(2)}`;
// Coerce to string first: a receipt is built from booking data that must never
// fail to render, and calling .replace() on an undefined/null field (e.g. an
// add-on with no name) would throw and take the whole receipt down.
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]!));

/** A clear, print-safe receipt. Deposits are provider money: a zero platform
 * fee is shown as no line at all, and the client sees exactly what remains to
 * be settled with the provider at the appointment. */
export function buildClientReceiptHTML(booking: ConfirmedBooking): string {
  // Shares calculateBookingPaymentBreakdown with the in-app payment card so
  // the printed receipt and the screen can never word the same booking
  // differently — in particular which figure counts as "paid" on a deposit,
  // and whether anything was paid at all.
  const payment = calculateBookingPaymentBreakdown(booking);
  const addOns = booking.addOns ?? [];
  const servicePrice = payment.servicePrice;
  const serviceTotal = payment.subtotal;
  const platformFee = payment.serviceCharge;
  const bookingTotal = payment.total;
  const remainingBalance = Math.max(0, payment.remainingBalance);
  const depositAmount = payment.depositAmount;
  const paymentMethod = (booking as { paymentMethod?: string }).paymentMethod;
  const paymentMethodLabel = paymentMethod ? PAYMENT_METHOD_LABELS[paymentMethod] ?? 'Card' : 'Card';
  const addOnRows = addOns.map(addOn => `<tr><td class="muted indent">+ ${escapeHtml(addOn.name)}</td><td>${money(Number(addOn.price) || 0)}</td></tr>`).join('');
  const platformFeeRow = platformFee > 0 ? `<tr><td class="muted">Cerviced platform fee</td><td>${money(platformFee)}</td></tr>` : '';
  // On a deposit this is the provider's deposit alone — the platform fee is
  // already its own line above and is not part of what the client has put
  // towards the service.
  const paidLabel = payment.isDeposit
    ? 'Deposit paid to provider'
    : payment.isUnpaid ? 'Paid so far' : 'Paid today';
  const paidAmount = payment.paidAmount;
  const balanceRow = remainingBalance > 0
    ? `<tr class="balance"><td>Due to provider at appointment</td><td>${money(remainingBalance)}</td></tr>`
    : `<tr class="settled"><td>Balance due</td><td>£0.00</td></tr>`;

  // Driven by payment_status, never payment_type: a booking the provider
  // added by hand is payment_type 'full' with nothing paid, and used to head
  // its own receipt "Paid in full · £0.00".
  const statusLabel = payment.isDeposit
    ? 'Deposit paid'
    : payment.isPaidInFull ? 'Paid in full' : 'Awaiting payment';

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page{margin:16mm}*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#211d1a;background:#fff;font-size:13px;line-height:1.45}.page{max-width:680px;margin:0 auto}
    .header{display:flex;justify-content:space-between;align-items:flex-start;padding:0 0 22px}
    .brand{font-size:24px;font-weight:800;letter-spacing:3px;color:#4A2340}
    .eyebrow{font-size:10px;letter-spacing:1.6px;color:#786e68;text-transform:uppercase;margin-top:5px}
    .receipt-title{text-align:right;font-size:11px;letter-spacing:1.4px;color:#786e68;text-transform:uppercase;font-weight:700}
    .reference{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;letter-spacing:0.5px;color:#211d1a;margin-top:4px;font-weight:600}
    .accent-bar{height:3px;background:linear-gradient(90deg,#4A2340,#4A2340 60%,#E5ECF4 60%,#E5ECF4)}
    .status-panel{display:flex;justify-content:space-between;align-items:center;background:#FBF7F8;border:1px solid #eee0e6;border-radius:12px;padding:16px 18px;margin:22px 0}
    .status-label{font-size:10px;letter-spacing:1.4px;color:#7E6667;text-transform:uppercase;font-weight:700;margin-bottom:4px}
    .status-value{font-size:20px;font-weight:800;color:#4A2340}
    .status-total{text-align:right}
    .status-total .status-value{color:#211d1a}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:22px;padding:4px 0 22px}
    .block-title{font-size:10px;letter-spacing:1.4px;color:#786e68;font-weight:700;margin-bottom:6px;text-transform:uppercase}
    .block-value{font-size:14px;font-weight:650}
    .block-note{color:#625954;margin-top:2px}
    section{padding:18px 0;border-top:1px solid #ede4e7}
    .section-title{font-size:10px;letter-spacing:1.4px;color:#4A2340;font-weight:700;margin-bottom:10px;text-transform:uppercase}
    table{width:100%;border-collapse:collapse}
    td{padding:7px 0;vertical-align:top}
    td:last-child{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
    .muted{color:#786e68}
    .indent{padding-left:14px}
    .strong td{font-weight:700}
    .total{border-top:1.5px solid #211d1a}
    .total td{padding-top:13px;font-size:16px;font-weight:750}
    .paid td{color:#146c43;font-weight:700}
    .balance td{color:#a55713;font-weight:700}
    .settled td{color:#146c43;font-weight:700}
    .notice{padding:12px 14px;background:#FBF7F8;border-left:3px solid #4A2340;border-radius:0 8px 8px 0;color:#4A2340;font-size:12px;margin-top:14px}
    .footer{text-align:center;color:#8e8580;font-size:11px;padding:28px 0 0;border-top:1px solid #ede4e7;margin-top:6px}
    .footer-brand{color:#4A2340;font-weight:700;letter-spacing:1px}
    @media print{body{font-size:12px}.page{max-width:none}}
  </style></head><body><main class="page">
    <header class="header"><div><div class="brand">CERVICED</div><div class="eyebrow">Booking payment receipt</div></div><div><div class="receipt-title">Receipt</div><div class="reference">#${escapeHtml((booking.id ?? '').slice(0, 8).toUpperCase())}</div></div></header>
    <div class="accent-bar"></div>
    <div class="status-panel"><div><div class="status-label">${escapeHtml(statusLabel)}</div><div class="status-value">${money(paidAmount)}</div></div><div class="status-total"><div class="status-label">Booking total</div><div class="status-value">${money(bookingTotal)}</div></div></div>
    <div class="grid"><div><div class="block-title">Provider</div><div class="block-value">${escapeHtml(booking.providerName ?? '—')}</div></div><div><div class="block-title">Appointment</div><div class="block-value">${booking.bookingDate ? escapeHtml(formatLongDate(booking.bookingDate)) : '—'}</div><div class="block-note">${escapeHtml(booking.bookingTime ?? '—')}</div></div></div>
    <section><div class="section-title">Services</div><table><tr class="strong"><td>${escapeHtml(booking.serviceName ?? 'Service')}</td><td>${money(servicePrice)}</td></tr>${addOnRows}${addOns.length > 0 ? `<tr><td class="muted">Service subtotal</td><td>${money(serviceTotal)}</td></tr>` : ''}${platformFeeRow}</table></section>
    <section><div class="section-title">Payment</div><table><tr class="total"><td>Booking total</td><td>${money(bookingTotal)}</td></tr><tr class="paid"><td>${paidLabel}</td><td>${money(paidAmount)}</td></tr>${balanceRow}<tr><td class="muted">Payment method</td><td>${escapeHtml(paymentMethodLabel)}</td></tr></table>${payment.isDeposit ? `<div class="notice">Your ${money(depositAmount)} deposit is for the provider’s service. ${remainingBalance > 0 ? `${money(remainingBalance)} remains payable directly to the provider at your appointment.` : 'No balance remains.'}</div>` : ''}${payment.isUnpaid && remainingBalance > 0 ? `<div class="notice">No payment has been taken through CERVICED for this booking. Payment is arranged directly with ${escapeHtml(booking.providerName ?? 'your provider')}.</div>` : ''}</section>
    <footer class="footer">${booking.createdAt ? `Issued ${escapeHtml(formatShortDate(new Date(booking.createdAt)))} · ` : ''}Keep this receipt for your records<br/><span class="footer-brand">CERVICED</span></footer>
  </main></body></html>`;
}
