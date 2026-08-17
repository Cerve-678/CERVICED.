import type { ConfirmedBooking } from '../../contexts/BookingContext';
import { formatLongDate, formatShortDate } from '../../utils/dateUtils';
import { PAYMENT_METHOD_LABELS } from './paymentPresentation';

const money = (amount: number) => `£${Math.max(0, amount).toFixed(2)}`;
const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]!));

/** A clear, print-safe receipt. Deposits are provider money: a zero platform
 * fee is shown as no line at all, and the client sees exactly what remains to
 * be settled with the provider at the appointment. */
export function buildClientReceiptHTML(booking: ConfirmedBooking): string {
  const servicePrice = Number(booking.price) || 0;
  const addOns = booking.addOns ?? [];
  const addOnsTotal = addOns.reduce((sum, addOn) => sum + (Number(addOn.price) || 0), 0);
  const serviceTotal = servicePrice + addOnsTotal;
  const platformFee = Number(booking.serviceCharge) || 0;
  const bookingTotal = serviceTotal + platformFee;
  const paymentType = booking.paymentType || 'full';
  const amountPaid = Number(booking.amountPaid) || 0;
  const depositAmount = Number(booking.depositAmount) || 0;
  const remainingBalance = Math.max(0, bookingTotal - amountPaid);
  const paymentMethod = (booking as { paymentMethod?: string }).paymentMethod;
  const paymentMethodLabel = paymentMethod ? PAYMENT_METHOD_LABELS[paymentMethod] ?? 'Card' : 'Card';
  const addOnRows = addOns.map(addOn => `<tr><td class="muted indent">+ ${escapeHtml(addOn.name)}</td><td>${money(Number(addOn.price) || 0)}</td></tr>`).join('');
  const platformFeeRow = platformFee > 0 ? `<tr><td class="muted">Cerviced platform fee</td><td>${money(platformFee)}</td></tr>` : '';
  const paidLabel = paymentType === 'deposit' ? 'Deposit paid to provider' : 'Paid today';
  const balanceRow = remainingBalance > 0
    ? `<tr class="balance"><td>Due to provider at appointment</td><td>${money(remainingBalance)}</td></tr>`
    : `<tr class="settled"><td>Balance due</td><td>£0.00</td></tr>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page{margin:18mm}*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#211d1a;background:#fff;font-size:13px;line-height:1.45}.page{max-width:680px;margin:0 auto}.header{display:flex;justify-content:space-between;align-items:flex-start;padding:4px 0 26px;border-bottom:2px solid #211d1a}.brand{font-size:25px;font-weight:800;letter-spacing:4px}.eyebrow{font-size:10px;letter-spacing:1.6px;color:#786e68;text-transform:uppercase;margin-top:4px}.receipt-title{text-align:right;font-size:21px;font-weight:750}.reference{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:1px;color:#786e68;margin-top:4px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:22px;padding:23px 0}.block-title{font-size:10px;letter-spacing:1.4px;color:#786e68;font-weight:700;margin-bottom:6px;text-transform:uppercase}.block-value{font-size:14px;font-weight:650}.block-note{color:#625954;margin-top:2px}section{padding:18px 0;border-top:1px solid #ded8d3}table{width:100%;border-collapse:collapse}td{padding:7px 0;vertical-align:top}td:last-child{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}.muted{color:#786e68}.indent{padding-left:14px}.strong td{font-weight:700}.total{border-top:1.5px solid #211d1a}.total td{padding-top:13px;font-size:16px;font-weight:750}.paid td{color:#146c43;font-weight:700}.balance td{color:#a55713;font-weight:700}.settled td{color:#146c43;font-weight:700}.notice{padding:12px 14px;background:#f6f2ee;border-radius:8px;color:#625954;font-size:12px;margin-top:14px}.footer{text-align:center;color:#8e8580;font-size:11px;padding:26px 0 0}@media print{body{font-size:12px}.page{max-width:none}}
  </style></head><body><main class="page"><header class="header"><div><div class="brand">CERVICED</div><div class="eyebrow">Booking payment receipt</div></div><div><div class="receipt-title">Receipt</div><div class="reference">#${escapeHtml((booking.id ?? '').slice(0, 8).toUpperCase())}</div></div></header><div class="grid"><div><div class="block-title">Provider</div><div class="block-value">${escapeHtml(booking.providerName ?? '—')}</div></div><div><div class="block-title">Appointment</div><div class="block-value">${booking.bookingDate ? escapeHtml(formatLongDate(booking.bookingDate)) : '—'}</div><div class="block-note">${escapeHtml(booking.bookingTime ?? '—')}</div></div></div><section><div class="block-title">Services</div><table><tr class="strong"><td>${escapeHtml(booking.serviceName ?? 'Service')}</td><td>${money(servicePrice)}</td></tr>${addOnRows}${addOns.length > 0 ? `<tr><td class="muted">Service subtotal</td><td>${money(serviceTotal)}</td></tr>` : ''}${platformFeeRow}</table></section><section><div class="block-title">Payment</div><table><tr class="total"><td>Booking total</td><td>${money(bookingTotal)}</td></tr><tr class="paid"><td>${paidLabel}</td><td>${money(amountPaid)}</td></tr>${balanceRow}<tr><td class="muted">Payment method</td><td>${escapeHtml(paymentMethodLabel)}</td></tr></table>${paymentType === 'deposit' ? `<div class="notice">Your ${money(depositAmount || amountPaid)} deposit is for the provider’s service. ${remainingBalance > 0 ? `${money(remainingBalance)} remains payable directly to the provider at your appointment.` : 'No balance remains.'}</div>` : ''}</section><footer class="footer">Issued ${escapeHtml(formatShortDate(new Date(booking.createdAt)))} · Keep this receipt for your records</footer></main></body></html>`;
}
