# Stripe testing handoff — 30 September 2026

## Deployment status

The user explicitly approved deployment. All six financial Edge Functions are
now deployed and ACTIVE in project `ztrfpfvvejzaysrelmfm`:

| Function | Version |
| --- | --- |
| `create-payment-intent` | 14 |
| `finalize-payment-intent` | 14 |
| `stripe-webhook` | 4 |
| `create-connect-account` | 6 |
| `refund-payment` | 4 |
| `release-payouts` | 4 |
| `stripe-connect-return` | 1 |

The deployed functions include their shared settlement/refund helpers. Remote
HTTP checks passed: all five authenticated endpoints return 401 without an auth
header; the webhook returns 400 for missing and invalid signatures; the HTTPS
return endpoint responds with 302 to `cerviced://stripe-connect?result=return`.
No charge, refund, or transfer was submitted during those checks. The mobile
changes are local source changes and must be loaded into the testing app.

Deployment and boundary checks are complete. A signed Stripe event and a device
payment still need end-to-end verification using the sequence below.

## Configuration to verify before device testing

The local app has `EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED=true` and a test publishable
key. Secret values were not read or changed. Confirm the Edge Function
`STRIPE_SECRET_KEY` belongs to the same Stripe test account/sandbox. The app checks
the returned PaymentIntent mode against its publishable key.

Webhook destination:
`https://ztrfpfvvejzaysrelmfm.supabase.co/functions/v1/stripe-webhook`

Subscribe the platform destination to:

- `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`
- `refund.created`, `refund.updated`
- `transfer.created`, `transfer.updated`, `transfer.reversed`
- `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`

Subscribe the connected-account destination to `account.updated` and
`payout.failed`. If Stripe uses a separate destination and signing secret for
Connect events, set `STRIPE_CONNECT_WEBHOOK_SECRET` as well as the platform
`STRIPE_WEBHOOK_SECRET`. Both destinations can use the URL above. Signature
verification is mandatory; the webhook and return redirect use `verify_jwt=false`.
Other payment functions require authentication.

Use a development build with the `cerviced` URL scheme for the complete redirect
flow. Apple Pay additionally needs the registered Apple merchant configuration;
wallet options are omitted inside Expo Go. Google Pay test mode follows the
publishable key, not whether the build is a debug build.

## What changed

Client checkout reuses a single PaymentIntent for a prepared batch, checks provider
payout setup before payment, supports bank-authentication return links, and avoids
claiming an uncertain charge failed. A signed webhook and the app share settlement
logic: capture first, confirm bookings second, retry transient failures, refund
when a captured checkout has lost its reservation.

Provider Payments now includes Stripe onboarding, fresh account status, dashboard
access, the latest 50 payout records with booking/client labels, and confirmed
full-booking refunds including the platform fee. A refund does not cancel the
appointment. Payouts are distinguished from transfers into the provider's bank.
The client Payment Methods screen explains secure checkout; saved-card management
is not included in this change.

Refund events reconcile delayed results and reclaim transferred provider funds.
Payout release verifies the charge, skips refunds/disputes, and links transfers to
the underlying Stripe charge. Durable transfer-group/refund lookups supplement
Stripe's time-limited idempotency keys.

## Verification completed

- `npm run test:stripe`: 17 checkout/refund/onboarding and error-message tests passed.
- Six existing focused Jest suites: 43 tests passed (deposits, cart, private
  holds, abandoned holds, and database access boundaries).
- App TypeScript check passed after adding the already-handled `points_earned`
  notification to its local type union.
- Targeted payment UI lint and diff whitespace checks passed. The wider
  notifications-screen lint check still reports 8 existing errors and 1 warning
  in unrelated hooks/animation code; its type-union correction passes TypeScript.
- Read-only live checks confirmed payout RLS/owner-only reads, service-role-only
  checkout finalisation, refund columns, and the active 15-minute payout cron.
- No real or test charge, refund, transfer, or provider account was created during
  this session. No device payment or valid signed webhook delivery has been verified yet.

## Device test sequence after deployment

1. Provider → Payments → Connect with Stripe. Complete test onboarding. Return to
   the app and confirm payout status updates. Verify expired-link refresh and
   continuing incomplete onboarding; open the Stripe dashboard.
2. Client → book a service → checkout. Test full payment and deposits, including
   platform fee and remaining balance. Use Stripe's test cards, never real cards.
3. Test success, decline, 3D Secure, cancelling the sheet, and tapping Pay twice.
   Check that each successful checkout produces one charge and matching bookings
   on both accounts.
4. Close the app or interrupt its connection immediately after authorisation.
   Confirm signed webhook delivery completes the booking without another charge.
5. Replay the same signed webhook and confirm no duplicate booking or charge.
   Test a reservation expiring during payment and verify a refund rather than an
   unfulfilled captured payment.
6. Confirm the provider ledger shows gross payment less platform fee. After the
   appointment plus hold period, verify one transfer and its Stripe bank schedule.
7. Refund before and after transfer. Confirm the full client amount is refunded,
   a transferred provider share is reversed, and retries do not refund twice.
8. Confirm the webhook rejects unsigned requests, another user's checkout cannot
   be accessed, and a different provider cannot read or refund these payments.

Reference: [Stripe mobile payments](https://docs.stripe.com/payments/mobile/accept-payment?platform=react-native&type=payment),
[Stripe test cards](https://docs.stripe.com/testing),
[Supabase webhook verification](https://supabase.com/docs/guides/functions/examples/stripe-webhooks).

## Onboarding fix — 1 October 2026

The actual onboarding request failed because Stripe rejected Accounts v1 account
creation for this platform. New Express recipients are now created with
`POST /v2/core/accounts`, API version `2026-08-26.dahlia`, keeping the existing
Express dashboard and platform liability settings. Existing account retrieval,
hosted onboarding links, and account.updated events use Stripe's documented v1
interoperability for v2 accounts. No Accounts v1 dashboard override is required.

Stripe functions now use pinned native npm dependencies and Deno.serve instead
of the old compatibility shim that logged runMicrotasks errors. The mobile app
maps known backend error codes to useful messages without exposing raw errors.
The 18:43:18 checkout request returned 409 and its batch had no PaymentIntent.
The exact rejection body was not retained in those logs; future responses carry
explicit provider-setup and reservation-expiry codes.

Reference: https://docs.stripe.com/connect/accounts-v2/migrate-integration

The next signed-in attempt revealed Stripe requires `contact_email` for recipient
accounts. Version 5 passes the authenticated user's email to account creation and
rejects missing email before calling Stripe. Regression tests cover the field and
missing-email rejection. Signed-in onboarding still needs a successful retry.

## Provider onboarding return and payment navigation

- Payments now opens directly from Business Profile; removed its Business Details hub row.
- Root navigation handles exact `cerviced://stripe-connect?result=return|refresh` links for both cold and warm starts, waits for authentication/navigation, and uses the existing ownership-checked provider mode switch before opening Profile → Payments.
- Payments refreshes server status on return and app foreground. An expired onboarding link requests a fresh link. Returning from onboarding is never treated as approval.
- Account status and recent payouts load independently; payout errors cannot hide successful account status. Existing status remains visible during refresh. Submitted setup without enabled payouts links to the Stripe dashboard.
- Updated the local test publishable key supplied by the user. Restart Metro and reload the app to pick up the environment change.
- Read-only database check found the current provider connected, details submitted, and payouts enabled. These are stored backend flags; no real payment or live verification was performed.
- Validation: TypeScript passed; targeted ESLint passed; 18 Stripe tests passed, including exact callback route validation.
- Device validation still required: complete onboarding in a development build, verify return to Payments and Payouts enabled, repeat with app closed, and test an expired onboarding link. The `cerviced` scheme requires a development/installed build for this round-trip; Expo Go cannot register that application scheme.

## Provider dashboard browser sheet

The Open Stripe dashboard action uses expo-web-browser (system Safari view on iOS,
Custom Tabs on Android), retaining the authenticated, single-use server login link.
Closing the sheet refreshes Payments; Android also refreshes on app foreground.
Onboarding keeps its existing callback flow. This is Stripe's hosted dashboard in
a system browser surface, not an embedded WebView or native Connect components.
Rebuild an installed development client after adding the native browser module.
Device QA: open dashboard, complete any Stripe authentication, close with Done/back,
verify Payments remains visible and refreshes; repeat on Android.


## CERVICED Payments & payouts dashboard

Implemented four sections in the existing Payments route:

- **Overview:** live connected-account available and pending Stripe balances, the next upcoming payout found in recent Stripe history, and three recent booking payments. Test data is explicitly labelled. Balances from different currencies are displayed separately.
- **Booking payments:** latest 50 online booking payment records, expandable gross/fee/provider-share breakdown, release eligibility explanation, and existing confirmed refund action. These are not records of in-person payments.
- **Payouts:** actual Stripe bank payouts with status and estimated arrival dates; 20 per page, with Load earlier payouts. A three-step explanation distinguishes appointment completion, transfer to Stripe, and payout to the bank.
- **Payment settings:** connected-account status and required actions, existing payment method preferences, deposits and refund policy link. Successful saves remain on the dashboard.

The existing authenticated create-connect-account function is now deployed as version 6.
Its read-only finance action resolves the caller's own provider account before requesting
Stripe balance/payouts with stripeAccount scope. No platform balance fallback, bank account
numbers, or payout creation is exposed. Cursor input is validated. A provider without a
connected account receives an explicit unconnected state. No schema changes were needed.

Dashboard loading is independent of payment-settings loading. Account, booking-history and
finance errors are isolated. Missing finance data is shown as unavailable, never as a
fabricated zero. Refresh preserves previous data with an error notice if the new request fails.

Validation: 21 Stripe helper tests passed, including account scope, pagination projection,
unconnected providers and failure semantics. Three Jest suites passed (15 tests), including
four-section interaction, fee details, partial failure isolation, deposit policies and the
screen data-access boundary. TypeScript, targeted ESLint and git diff --check passed.
The deployed finance endpoint returned HTTP 401 for an unauthenticated POST.

Remaining device QA: authenticated balances/history response, visual review on small and large
phones, dark mode and larger text, onboarding return, browser-sheet dismissal, refund confirmation,
and bank payout pagination with a populated test account. No real money was moved during this work.
