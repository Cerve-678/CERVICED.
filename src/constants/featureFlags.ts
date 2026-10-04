// Temporary kill-switches for features pulled from the client app without
// deleting the underlying code. See FUTURE_LOGIC.md for why each is off.

export const OFFERS_ENABLED = false;

// Multi-service booking — selecting several services from one provider and
// booking them together as a group (the "Select" mode on a provider profile,
// its floating "Book" bar, and MultiBookingSheet). Off pulls only that grouped
// path from the UI; single-service Book, Offers/Explore "Book Now", the cart,
// and checkout are all untouched. See FUTURE_LOGIC.md.
export const MULTI_SERVICE_BOOKING_ENABLED = false;

// Client-facing emergency / out-of-hours booking requests — picking a time the
// provider's own rules exclude (outside their hours, a blocked date, inside
// their notice period, beyond their booking window) and asking anyway. Off
// pulls the whole request path from the client UI (the by-request slots in
// ModernBeautyCalendar, RequestTimePanel, EmergencyBookingPrompt), the provider
// opt-in controls (SchedulingScreen's "Requests Outside Your Availability"
// card), and the Emergency Booking Policy editor on PoliciesScreen. Server-side
// pieces are untouched (prepare_checkout's emergency_ack, providers.allow_*_
// requests, the provider inbox accept/decline of an existing request), so
// re-enabling is a one-line flip. See FUTURE_LOGIC.md.
export const EMERGENCY_BOOKINGS_ENABLED = false;

// Provider Stripe Connect payouts — makes "payouts set up" part of the go-live
// checklist (goLiveStatus) and the provider's own profile. Onboarding itself
// lives on the Payments & payouts screen (ProviderStripePayments), which is not
// gated by this flag.
//
// ON as of 2026-09-29: the Connect backend is live — providers.stripe_* columns
// applied (20260929050150), the create-connect-account / stripe-webhook /
// release-payouts / refund-payment functions deployed, Stripe secrets + webhook
// configured. Currently on TEST-mode Stripe keys, so onboarding creates test
// Express accounts; swap to live keys at real launch (no code change here).
// NOTE: this is a build-time flag — it reaches providers only in the next
// build/OTA update. See the auto-memory stripe-connect-payouts-build-handoff.
export const STRIPE_CONNECT_PAYOUTS_ENABLED = true;

// The "Popular Men's/Kids' Services" photo rail on HomeScreen's Male/Kids
// sections — actual matching services.audience-tagged services shown as
// PortfolioCard photo tiles (tap → that service's booking modal), fetched via
// getDiscoverServices(undefined, 15, audience). Off pulls only this photo
// rail and its fetch; the Male/Kids sections themselves (provider tiles,
// widened via getProviderIdsByServiceAudience) and Search's/Becca's audience
// matching are untouched. See FUTURE_LOGIC.md.
export const AUDIENCE_SERVICE_PHOTOS_ENABLED = false;
