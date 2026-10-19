-- Fee terms wording version '2026-10-19': the checkout tick-box line from
-- feat/combined-saved-cards-fees, brought in at the user's direction
-- 2026-10-19 (not lawyer-reviewed; LEGAL-COMPLIANCE-NOTES §17). Heading and
-- body are unchanged from '2026-10-18'. Data only: adds the row the app's
-- FEE_TERMS_VERSION / FEE_TERMS_SHA256 name, so accept_checkout_fees accepts
-- the new wording. '2026-10-18' stays, so agreements already recorded keep
-- pointing at the exact text they were shown, and older app builds still work.
--
-- Apply BEFORE an app build with this wording ships. Frontier at authoring:
-- 20261019120000. Safe to paste into the SQL editor or run via apply_migration.

INSERT INTO public.fee_terms_versions (version, heading, body, consent_line, sha256)
VALUES (
  '2026-10-19',
  'Late Arrival & No-Show Fees',
  'Some providers set a late arrival fee, a no-show fee, or both. Any fee is shown to you before you pay, and you must agree to it at checkout to book. If you agree, your card is saved securely by Stripe, and the provider may charge the agreed fee to it within 24 hours of your appointment: the late arrival fee if you arrive after the provider''s stated grace period, or the no-show fee if you do not attend. Each fee is fixed at the amount shown when you book, can be charged only once per booking, and can never be more than half the price of the booking. You will be notified whenever a fee is charged. If you believe a fee is wrong, you can dispute it with the provider in the app within 7 days of the charge, and the provider decides whether to refund it. Fees are paid to the provider, not to Cerviced, and Cerviced does not decide fee disputes. This does not affect your statutory rights, including your right to contact your bank.',
  'I agree that CERVICED may save this card with Stripe and, if the provider records that I arrived more than the stated grace period late or did not attend, may charge this card the applicable fee shown above. Each fee is for this booking only, is charged no later than 24 hours after the appointment ends, and will not exceed the amount shown. I can dispute a charged fee in the app within 7 days; the provider will review the dispute and may refund or keep the fee. This does not affect my statutory rights.',
  ''  -- replaced by before_fee_terms_sha256
)
ON CONFLICT (version) DO NOTHING;
