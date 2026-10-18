// The client-facing Terms clause for late arrival and no-show fees — one copy,
// shown in the Terms & Conditions and beside the checkout tick box, so what a
// client reads at checkout is exactly what they agree to. Drafted 2026-10-18 at
// the user's direction; NOT lawyer-reviewed (see LEGAL-COMPLIANCE-NOTES.md).

export const FEE_TERMS_HEADING = 'Late Arrival & No-Show Fees';

export const FEE_TERMS_BODY =
  'Some providers set a late arrival fee, a no-show fee, or both. Any fee is shown to you before you pay, and you must agree to it at checkout to book. ' +
  'If you agree, your card is saved securely by Stripe, and the provider may charge the agreed fee to it within 24 hours of your appointment: the late arrival fee if you arrive after the provider\'s stated grace period, or the no-show fee if you do not attend. ' +
  'Each fee is fixed at the amount shown when you book, can be charged only once per booking, and can never be more than half the price of the booking. You will be notified whenever a fee is charged. ' +
  'If you believe a fee is wrong, you can dispute it with the provider in the app within 7 days of the charge, and the provider decides whether to refund it. Fees are paid to the provider, not to Cerviced, and Cerviced does not decide fee disputes. ' +
  'This does not affect your statutory rights, including your right to contact your bank.';

/** The tick-box line at checkout. */
export const FEE_CONSENT_LINE =
  'I agree to these fees and to the Late Arrival & No-Show Fees terms, and that my card will be saved so the provider can charge an agreed fee within 24 hours of my appointment.';
