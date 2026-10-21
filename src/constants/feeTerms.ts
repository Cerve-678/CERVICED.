// The client-facing Terms clause for late arrival and no-show fees — one copy,
// shown in the Terms & Conditions and beside the checkout tick box, so what a
// client reads at checkout is exactly what they agree to. Drafted 2026-10-18 at
// the user's direction; NOT lawyer-reviewed (see LEGAL-COMPLIANCE-NOTES.md).

export const FEE_TERMS_HEADING = 'Late Arrival & No-Show Fees';

export const FEE_TERMS_BODY =
  'Some providers set a late arrival fee, a no-show fee, or both. Any fee is shown to you before you pay, and you must agree to it at checkout to book. ' +
  'If you agree, your card is saved securely by Stripe, and the provider may charge the agreed fee to it within 24 hours of your appointment: the late arrival fee if you arrive after the provider\'s stated grace period, or the no-show fee if you do not attend. ' +
  'If the charge is declined, we will ask you to pay the fee in the app or by email within 7 days, and we may try your saved card again up to three more times in those 7 days. If your bank asks you to approve the charge, we won\'t try the card again; you can pay it yourself within the 7 days. ' +
  'Each fee is fixed at the amount shown when you book, can be collected only once per booking, and can never be more than half the price of the booking. You will be notified whenever a fee is charged or retried. ' +
  'If you believe a fee is wrong, you can dispute it with the provider in the app within 7 days of the charge, and the provider decides whether to refund it. Fees are paid to the provider, not to Cerviced, and Cerviced does not decide fee disputes. ' +
  'This does not affect your statutory rights, including your right to contact your bank.';

/** The tick-box line at checkout. */
export const FEE_CONSENT_LINE =
  'I agree that CERVICED may save this card with Stripe and, if the provider records that I arrived more than the stated grace period late or did not attend, may charge this card the applicable fee shown above. ' +
  'Each fee is for this booking only, is first charged no later than 24 hours after the appointment ends, and will not exceed the amount shown. If that charge is declined, it may be tried again up to three times within the following 7 days, and I may pay it myself in that time. ' +
  'I can dispute a charged fee in the app within 7 days; the provider will review the dispute and may refund or keep the fee. This does not affect my statutory rights.';

/** Which wording the client agreed to. The database keeps the full text of each
 *  version (fee_terms_versions) and every agreement names one, so a consent
 *  record proves exactly what the client was shown. Changing any of the three
 *  strings above means a NEW version: a new fee_terms_versions row in a
 *  migration, then bump these two. feeTerms.test.ts fails until both match. */
export const FEE_TERMS_VERSION = '2026-10-19-retries';

/** sha256 of heading, body and consent line joined by blank lines. The
 *  database refuses an agreement whose hash doesn't match the version's text. */
export const FEE_TERMS_SHA256 = 'c21a93f9397eb3f1e2cabd7fc5f56bbd8fcd3776e1e53083043db09a3e8bedfe';
