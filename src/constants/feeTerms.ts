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
  'I agree that CERVICED may save this card with Stripe and, if the provider records that I arrived more than the stated grace period late or did not attend, may charge this card the applicable fee shown above. ' +
  'Each fee is for this booking only, is charged no later than 24 hours after the appointment ends, and will not exceed the amount shown. ' +
  'I can dispute a charged fee in the app within 7 days; the provider will review the dispute and may refund or keep the fee. This does not affect my statutory rights.';

/** Which wording the client agreed to. The database keeps the full text of each
 *  version (fee_terms_versions) and every agreement names one, so a consent
 *  record proves exactly what the client was shown. Changing any of the three
 *  strings above means a NEW version: a new fee_terms_versions row in a
 *  migration, then bump these two. feeTerms.test.ts fails until both match. */
export const FEE_TERMS_VERSION = '2026-10-19';

/** sha256 of heading, body and consent line joined by blank lines. The
 *  database refuses an agreement whose hash doesn't match the version's text. */
export const FEE_TERMS_SHA256 = '44b1d39d81d6e8dcf1907b33ff4cfd4843c5ce7ae51071a00592b83c5fb654c6';
