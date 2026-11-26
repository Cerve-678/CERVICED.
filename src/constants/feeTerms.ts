// The client-facing clause for late arrival, no-show and late cancellation
// fees, shown beside the checkout tick boxes and hashed into each consent
// record, so what a client reads at checkout is exactly what they agree to.
// The published Terms (cerviced.co/legal, Client Terms §16) say the same in
// formal wording; change both together. Drafted 2026-10-18 at the user's direction, late cancellation added
// 2026-11-13 (user chose a separate tick box); NOT lawyer-reviewed (see
// LEGAL-COMPLIANCE-NOTES.md).

export const FEE_TERMS_HEADING = 'Late Arrival, No-Show & Late Cancellation Fees';

export const FEE_TERMS_BODY =
  'Some providers set a late arrival fee, a no-show fee, or both. Any fee is shown to you before you pay, and you must agree to it at checkout to book. ' +
  'If you agree, your card is saved securely by Stripe, and the provider may charge the agreed fee to it within 24 hours of your appointment: the late arrival fee if you arrive after the provider\'s stated grace period, or the no-show fee if you do not attend. ' +
  'If a provider\'s cancellation policy is half the price and you pay only a deposit, you must also agree at checkout to their late cancellation charge. If you then cancel within their notice period, or cancel after moving the booking once that period had begun, the provider keeps your deposit and may charge your saved card the difference between that deposit and half the price of the booking (the service and any add-ons, not including the Cerviced service fee), no later than 24 hours after the time the appointment would have ended. The amount is shown before you book and again before you cancel, and the provider decides whether to charge it. ' +
  'If the charge is declined, we will ask you to pay the fee in the app or by email within 7 days, and we may try your saved card again up to three more times in those 7 days. If your bank asks you to approve the charge, we won\'t try the card again; you can pay it yourself within the 7 days. ' +
  'Each fee is fixed at the amount shown when you book, can be collected only once per booking, and can never be more than half the price of the booking. You will be notified whenever a fee is charged or retried. ' +
  'If you believe a fee is wrong, you can dispute it with the provider in the app within 7 days of the charge, and the provider decides whether to refund it. Fees are paid to the provider, not to Cerviced, and Cerviced does not decide fee disputes. ' +
  'This does not affect your statutory rights, including your right to contact your bank.';

/** The late arrival / no-show tick box at checkout. */
export const FEE_CONSENT_LINE =
  'I agree that CERVICED may save this card with Stripe and, if the provider records that I arrived more than the stated grace period late or did not attend, may charge this card the applicable fee shown above. ' +
  'Each fee is for this booking only, is first charged no later than 24 hours after the appointment ends, and will not exceed the amount shown. If that charge is declined, it may be tried again up to three times within the following 7 days, and I may pay it myself in that time. ' +
  'I can dispute a charged fee in the app within 7 days; the provider will review the dispute and may refund or keep the fee. This does not affect my statutory rights.';

/** The separate late cancellation tick box (user choice 2026-11-13, option C).
 *  Shown only when a booking could carry the charge: a deposit-only booking
 *  under a "Half the price" policy whose deposit is less than half. The £
 *  amounts sit above it in the box, one line per provider. */
export const LATE_CANCEL_CONSENT_LINE =
  'I understand that if I cancel within the provider\'s notice period, or after moving the booking once that period had begun, I lose my deposit, and CERVICED may save this card with Stripe so the provider can charge it up to the amount shown above, no later than 24 hours after the time the appointment would have ended. ' +
  'The provider decides whether to charge it, I will be notified if they do, and I can dispute it in the app within 7 days. This does not affect my statutory rights.';

/** Which wording the client agreed to. The database keeps the full text of each
 *  version (fee_terms_versions) and every agreement names one, so a consent
 *  record proves exactly what the client was shown. Changing any of the four
 *  strings above means a NEW version: a new fee_terms_versions row in a
 *  migration, then bump these two. feeTerms.test.ts fails until both match.
 *  Which boxes were on screen follows from the amounts the record keeps: the
 *  late arrival / no-show box only with those fees, the late cancellation box
 *  only with a late cancellation amount. */
export const FEE_TERMS_VERSION = '2026-11-13-late-cancel';

/** sha256 of heading, body, consent line and late cancellation line joined by
 *  blank lines. The database refuses an agreement whose hash doesn't match the
 *  version's text. */
export const FEE_TERMS_SHA256 = '1d365e984f93acf326586243a9814c878bc7659031d3f0f111a3275e436ea42e';
