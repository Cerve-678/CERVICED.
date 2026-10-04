import type { ConfirmedBooking } from '../../contexts/BookingContext';
import { formatLongDate, formatShortDate } from '../../utils/dateUtils';
import { PAYMENT_METHOD_LABELS, calculateBookingPaymentBreakdown } from './paymentPresentation';
import { formatBookingRef } from './presentation';
import {
  CVD_MARK_CHOCOLATE,
  CVD_MARK_PLUM,
  RECEIPT_FONT_BAKBAK,
  RECEIPT_FONT_JURA,
  RECEIPT_FONT_PRATA,
} from './receiptAssets';

/** expo-print defaults to US Letter; both documents are laid out for A4. */
export const A4_PRINT_SIZE = { width: 595, height: 842 } as const;

const money = (amount: number) => `£${Math.max(0, amount).toFixed(2)}`;
// Coerce to string first: a receipt is built from booking data that must never
// fail to render, and calling .replace() on an undefined/null field (e.g. an
// add-on with no name) would throw and take the whole receipt down.
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]!));

/** One hat's colours — the same values as the app's own palettes
 *  (clientLightTheme for the client, the provider L palette for the provider).
 *  A PDF is always light, so there is no dark variant. */
type Letterhead = {
  tint: string;
  accent: string;
  accentDim: string;
  second: string;
  sub: string;
  hair: string;
  mark: string;
};

const CLIENT_LETTERHEAD: Letterhead = {
  tint: '#FBF7F8',
  accent: '#4A2340',
  accentDim: 'rgba(74,35,64,0.10)',
  second: '#4A6B8F',
  sub: 'rgba(74,35,64,0.62)',
  hair: 'rgba(74,35,64,0.12)',
  mark: CVD_MARK_PLUM,
};

const PROVIDER_LETTERHEAD: Letterhead = {
  tint: '#F5F1EC',
  accent: '#5C4033',
  accentDim: 'rgba(92,64,51,0.10)',
  second: '#7E6667',
  sub: '#7E6667',
  hair: 'rgba(126,102,103,0.18)',
  mark: CVD_MARK_CHOCOLATE,
};

type Line = { label: string; amount: number; kind?: 'addon' | 'fee' };
type PaymentRow = { label: string; amount: number; strong?: boolean };

type DocumentContent = {
  docType: string;
  serviceName: string;
  /** Already-escaped HTML: the "with <provider>" line under the service. */
  withLine: string;
  when: string;
  reference: string;
  issued: string;
  method: string;
  lines: Line[];
  total: number;
  state: string;
  paymentRows: PaymentRow[];
  aside: string | null;
  footer: string;
};

/** The shared A4 letterhead both documents print on: a tinted masthead in the
 *  hat's colour with the CVD mark, then services, total and payment. */
function renderDocument(theme: Letterhead, doc: DocumentContent): string {
  const lineRows = doc.lines.map(line => `
      <div class="line ${line.kind ?? 'main'}"><span class="name">${escapeHtml(line.label)}</span><span class="amt">${money(line.amount)}</span></div>`).join('');
  const paymentRows = doc.paymentRows.map(row => `
      <div class="pline${row.strong ? ' strong' : ''}"><span>${escapeHtml(row.label)}</span><span class="amt">${money(row.amount)}</span></div>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face{font-family:"Bakbak One";src:url(${RECEIPT_FONT_BAKBAK}) format("woff2")}
    @font-face{font-family:"Jura";src:url(${RECEIPT_FONT_JURA}) format("woff2");font-weight:300 700}
    @font-face{font-family:"Prata";src:url(${RECEIPT_FONT_PRATA}) format("woff2")}
    @page{size:A4;margin:0}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff}
    body{font-family:"Jura","Avenir Next","Segoe UI",Arial,sans-serif;font-weight:600;color:#000;font-size:3.4mm;line-height:1.6;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .sheet{min-height:297mm;display:flex;flex-direction:column}
    .label{font-family:"Bakbak One","Arial Black",sans-serif;font-weight:400;font-size:2.4mm;letter-spacing:.63mm;text-transform:uppercase;color:${theme.sub}}
    .mast{background:${theme.tint};padding:16mm 29mm 12.5mm;text-align:center;border-bottom:1mm solid ${theme.accent}}
    .mark{display:block;width:31mm;height:15.5mm;margin:0 auto}
    .doctype{display:inline-block;margin-top:3mm;padding:1mm 3.8mm;border-radius:20mm;background:${theme.accentDim};color:${theme.accent}}
    .service{margin-top:9mm;font-family:"Bakbak One","Arial Black",sans-serif;font-weight:400;font-size:7mm;letter-spacing:.3mm;line-height:1.15;text-transform:uppercase}
    .with{margin-top:3mm;color:${theme.sub};font-size:3.7mm;font-weight:700}
    .with b{font-family:"Prata",Georgia,serif;font-weight:400;color:#000;font-size:4.4mm}
    .when{color:${theme.sub};font-size:3.6mm;font-weight:700}
    .band{height:1mm;background:${theme.second};width:36%;margin-left:auto}
    .body{flex:1;display:flex;flex-direction:column;padding:9.5mm 29mm 12.5mm}
    .facts{display:flex;border-bottom:1px solid ${theme.hair}}
    .facts>div{flex:1;padding-bottom:4.6mm;text-align:center}
    .facts>div+div{border-left:1px solid ${theme.hair}}
    .facts .v{margin-top:1mm;font-weight:700}
    .items{margin-top:7.5mm}
    .items>.label{display:block;margin-bottom:2mm;color:${theme.accent}}
    .line,.pline{display:flex;justify-content:space-between;align-items:baseline;gap:6mm}
    .line{padding:2.4mm 0}
    .amt{white-space:nowrap;font-weight:700}
    .line.main{font-weight:700}
    .line.addon,.line.fee{color:${theme.sub}}
    .line.addon .name:before{content:"+ "}
    .rule{height:1px;background:${theme.hair};margin:2mm 0}
    .line.total{align-items:center;padding-top:3.8mm}
    .line.total .name{font-family:"Bakbak One","Arial Black",sans-serif;font-weight:400;font-size:2.7mm;letter-spacing:.63mm;text-transform:uppercase;color:${theme.sub}}
    .line.total .amt{font-family:"Bakbak One","Arial Black",sans-serif;font-weight:400;font-size:7.5mm;line-height:1;color:${theme.accent}}
    .pay{margin-top:7.5mm;background:${theme.tint};border-radius:3.8mm;padding:5mm 6mm}
    .pay-head{display:flex;justify-content:space-between;align-items:center;padding-bottom:2.5mm;border-bottom:1px solid ${theme.hair}}
    .state{font-family:"Bakbak One","Arial Black",sans-serif;font-size:2.7mm;letter-spacing:.4mm;text-transform:uppercase;color:${theme.accent}}
    .state:before{content:"";display:inline-block;width:1.9mm;height:1.9mm;border-radius:50%;background:${theme.accent};margin-right:1.9mm;vertical-align:.2mm}
    .pline{padding-top:2.1mm;color:${theme.sub}}
    .pline .amt{color:#000}
    .pline.strong{color:#000;font-weight:700}
    .pline.strong .amt{color:${theme.accent}}
    .aside{margin:5.5mm 0 0;font-size:3mm;line-height:1.65;color:${theme.sub};text-align:center}
    .foot{margin-top:auto;padding-top:8mm;text-align:center}
    .wordmark{font-family:"Bakbak One","Arial Black",sans-serif;color:${theme.accent};font-size:4mm;letter-spacing:1.3mm;padding-left:1.3mm}
    .small{margin-top:2mm;font-size:2.5mm;color:${theme.sub}}
  </style></head><body><main class="sheet">
    <header class="mast">
      <img class="mark" src="${theme.mark}" alt="CERVICED"/>
      <span class="doctype label">${escapeHtml(doc.docType)}</span>
      <div class="service">${escapeHtml(doc.serviceName)}</div>
      <div class="with">${doc.withLine}</div>
      <div class="when">${escapeHtml(doc.when)}</div>
    </header>
    <div class="band"></div>
    <div class="body">
      <section class="facts">
        <div><div class="label">Reference</div><div class="v">${escapeHtml(doc.reference)}</div></div>
        <div><div class="label">Issued</div><div class="v">${escapeHtml(doc.issued)}</div></div>
        <div><div class="label">Method</div><div class="v">${escapeHtml(doc.method)}</div></div>
      </section>
      <section class="items">
        <span class="label">Services</span>${lineRows}
        <div class="rule"></div>
        <div class="line total"><span class="name">Total</span><span class="amt">${money(doc.total)}</span></div>
      </section>
      <section class="pay">
        <div class="pay-head"><span class="label">Payment</span><span class="state">${escapeHtml(doc.state)}</span></div>${paymentRows}
      </section>
      ${doc.aside ? `<p class="aside">${escapeHtml(doc.aside)}</p>` : ''}
      <footer class="foot">
        <div class="wordmark">CERVICED</div>
        <div class="small">${escapeHtml(doc.footer)}</div>
      </footer>
    </div>
  </main></body></html>`;
}

const serviceLines = (booking: ConfirmedBooking, servicePrice: number): Line[] => [
  { label: booking.serviceName ?? 'Service', amount: servicePrice },
  ...(booking.addOns ?? []).map(addOn => ({ label: addOn.name, amount: Number(addOn.price) || 0, kind: 'addon' as const })),
];

const appointmentWhen = (booking: ConfirmedBooking) =>
  [booking.bookingDate ? formatLongDate(booking.bookingDate) : null, booking.bookingTime].filter(Boolean).join(' · ') || '—';

// No card brand or last four is stored for a payment yet, so the method is
// the generic label; "—" when nothing has been paid through the app at all.
const methodLabel = (booking: ConfirmedBooking, isUnpaid: boolean) => {
  if (isUnpaid) return '—';
  const method = (booking as { paymentMethod?: string }).paymentMethod;
  return method ? PAYMENT_METHOD_LABELS[method] ?? 'Card' : 'Card';
};

/** The client's shareable receipt, on the plum client letterhead. Deposits are
 * provider money: a zero platform fee is shown as no line at all, and the
 * client sees exactly what remains to be settled with the provider at the
 * appointment. */
export function buildClientReceiptHTML(booking: ConfirmedBooking): string {
  // Shares calculateBookingPaymentBreakdown with the in-app payment card so
  // the printed receipt and the screen can never word the same booking
  // differently — in particular which figure counts as "paid" on a deposit,
  // and whether anything was paid at all.
  const payment = calculateBookingPaymentBreakdown(booking);
  const remainingBalance = Math.max(0, payment.remainingBalance);
  const providerName = booking.providerName?.trim() || 'your provider';

  // On a deposit this is the provider's deposit alone — the platform fee is
  // already its own line above and is not part of what the client has put
  // towards the service.
  const paidLabel = payment.isDeposit && !payment.isUnpaid
    ? 'Deposit paid to provider'
    : payment.isUnpaid ? 'Total paid' : 'Paid today';
  const paymentRows: PaymentRow[] = [
    { label: paidLabel, amount: payment.paidAmount, strong: remainingBalance <= 0 },
    remainingBalance > 0
      ? { label: 'Due to provider at appointment', amount: remainingBalance, strong: true }
      : { label: 'Balance due', amount: 0 },
  ];

  // Driven by payment_status, never payment_type: a booking the provider
  // added by hand is payment_type 'full' with nothing paid, and used to head
  // its own receipt "Paid in full · £0.00".
  const state = payment.isDeposit
    ? 'Deposit paid'
    : payment.isPaidInFull ? 'Paid in full' : 'Awaiting payment';

  let aside: string | null = null;
  if (payment.isDeposit) {
    aside = `Your ${money(payment.depositAmount)} deposit is for the provider’s service. ${remainingBalance > 0
      ? `${money(remainingBalance)} remains payable directly to the provider at your appointment.`
      : 'No balance remains.'}`;
  } else if (payment.isUnpaid && remainingBalance > 0) {
    aside = `No payment has been taken through CERVICED for this booking. Payment is arranged directly with ${providerName}.`;
  }

  return renderDocument(CLIENT_LETTERHEAD, {
    docType: 'Receipt',
    serviceName: booking.serviceName ?? 'Service',
    withLine: `with <b>${escapeHtml(providerName)}</b>`,
    when: appointmentWhen(booking),
    reference: formatBookingRef(booking),
    issued: formatShortDate(booking.createdAt ? new Date(booking.createdAt) : new Date()),
    method: methodLabel(booking, payment.isUnpaid),
    lines: [
      ...serviceLines(booking, payment.servicePrice),
      ...(payment.serviceCharge > 0 ? [{ label: 'Cerviced platform fee', amount: payment.serviceCharge, kind: 'fee' as const }] : []),
    ],
    total: payment.total,
    state,
    paymentRows,
    aside,
    footer: 'Keep this receipt for your records · support@cerviced.co',
  });
}

/** The provider's shareable invoice, on the chocolate provider letterhead.
 * Shows the provider's own money only: the CERVICED platform fee is never
 * theirs, so it is neither a line nor inside the total. */
export function buildProviderInvoiceHTML(booking: ConfirmedBooking): string {
  const payment = calculateBookingPaymentBreakdown(booking);
  const providerTotal = payment.subtotal;
  // Provider's own cut, never amount_paid — that figure is what left the
  // client's card and, on a card charge, includes CERVICED's platform fee.
  // Keyed off payment_status (via isUnpaid), so a hand-added booking with
  // nothing paid is never invoiced as a "Full payment".
  const received = payment.isUnpaid ? 0 : payment.isDeposit ? payment.depositAmount : providerTotal;
  const balance = Math.max(0, providerTotal - received);
  const providerName = booking.providerName?.trim();
  const clientName = booking.customerName?.trim();

  const state = payment.isUnpaid
    ? 'Not paid in app'
    : payment.isDeposit ? 'Deposit paid' : 'Full payment';
  const paymentRows: PaymentRow[] = [
    ...(received > 0 ? [{ label: payment.isDeposit ? 'Deposit paid' : 'Full payment', amount: received, strong: balance <= 0 }] : []),
    ...(balance > 0 ? [{ label: 'Balance due', amount: balance, strong: true }] : []),
  ];

  const withParts = [
    providerName ? `<b>${escapeHtml(providerName)}</b>` : null,
    clientName ? `booked by ${escapeHtml(clientName)}` : null,
  ].filter(Boolean);
  const endTime = booking.endTime && booking.endTime !== booking.bookingTime ? booking.endTime : null;

  return renderDocument(PROVIDER_LETTERHEAD, {
    docType: 'Invoice',
    serviceName: booking.serviceName ?? 'Service',
    withLine: withParts.join(' · '),
    when: endTime ? `${appointmentWhen(booking)} – ${endTime}` : appointmentWhen(booking),
    reference: formatBookingRef(booking),
    issued: formatShortDate(new Date()),
    method: methodLabel(booking, payment.isUnpaid),
    lines: serviceLines(booking, payment.servicePrice),
    total: providerTotal,
    state,
    paymentRows,
    aside: payment.isDeposit && !payment.isUnpaid && balance > 0
      ? 'The balance is settled directly between you and your client at the appointment.'
      : null,
    footer: 'Invoice generated by CERVICED · support@cerviced.co',
  });
}
