# Link-Only Providers

Professionals who take bookings on **their own booking page** (Fresha, Treatwell, Booksy, Acuity…) but want to be found on CERVICED. Decided with the product owner on 2026-10-10, revised 2026-10-17. The original idea and its constraints are in `FUTURE_LOGIC.md` → "Signup Step 2b".

Designs: sign-up + provider + client flow canvas https://claude.ai/artifact/KHoSpyoht8Hw7R5FLT3TDh (the provider Home mockup predates the 2026-10-17 answers — go-live is four steps, and Becca/Announcements are available).

## Status

| Piece | State |
|---|---|
| Book button opens their page **inside** the app | Merged (#66) — `src/features/providers/externalBookingLink.ts` |
| Sign-up asks for the link (Step 1, "I use my own booking link") | Merged (#67). Migration `20261011102423_users_external_booking_url` applied 2026-10-11 |
| `providers.booking_mode`, go-live branch, booking guard, booked-elsewhere table, daily stats | Built on `feat/link-only-provider`. Migration `20261018170000_link_only_providers` **written, not applied** (renumbered from 20261017120000 above the 2026-10-18 frontier) |
| Provider tabs (Home, Portfolio, Messages, Profile), Home, Analytics | Built on `feat/link-only-provider` |
| Client profile (Book + socials, no price list / rating / reviews), "Did you book?", Booked elsewhere in Bookings | Built on `feat/link-only-provider` |
| Calendar: provider diary from the phone's calendar; client "Add to my calendar" | Built on `feat/link-only-provider` (expo-calendar legacy API) |
| Search: only category, speciality, area, accessibility | Built on `feat/link-only-provider` |

## What they get

> **Default is "yes" (product owner, 2026-10-17).** Link-only providers can use the app like any CERVICED provider. Only the exclusions named on this page are off. Anything not listed here, **ask the product owner** whether they can use it before building — don't assume either way.

**Yes:** searchable (Search + Explore), profile (hero with speciality chips, About + optional Policies, logo, portfolio, opening hours in About), Book button with socials beside it, portfolio, in-app messages, Announcements (to clients who **saved** them), Becca, Branding, Analytics, calendar sync.

**No:** CERVICED's own booking flow (they book via their link), the price list on their profile, star ratings and reviews (no reviews section at all), teams, Offers / promo codes, all client-care tools (info packs, intake / consultation forms, Clientele list, reminders), Automations.

- **Tabs:** Home, Portfolio, Messages, Profile. Becca is opened from Home.
- **Profile tab:** their public profile as clients see it, plus edit rows (profile, opening hours, business info, branding, policies) and a Settings row.
- **InfoReg:** Identity, About & Portfolio, Contact only — with their booking link required. No Services or Address pages.
- **Search:** they appear under **category, speciality, area, accessibility** only. Any availability, price, rating, hair-type, skin-tone, audience or practice filter drops them.
- **Analytics:** Book-button taps (headline), profile views, search appearances, Instagram taps, saves.
- **Calendar sync:** Home shows their diary from the calendars on their phone (iPhone Calendar, and Google if it's added to the phone). Nothing leaves the device. No Google sign-in.

## Go-live checklist

Exactly four things: **logo**, **About**, **opening hours**, **at least one portfolio photo**. Policies are optional. The server's `check_and_set_provider_live()` has a separate branch for `booking_mode = 'external'` — see [[Provider Onboarding & Go-Live]]. The app list is `buildLinkOnlyGoLiveSteps` in `src/features/providers/goLiveStatus.ts` and must never claim a step the server doesn't gate on.

## Pricing (planned, not active)

- Link-only is the free tier. Switching to CERVICED booking will be self-serve but on the next tier, **£19.99 / month**. Calendar sync (provider diary and client "Add to my calendar") is planned to go behind a paywall. Where the earlier £5.99 calendar-sync + messages idea fits is **not decided**.
- **Right now everything is free and nothing paid is built** (product owner, 2026-10-17). `booking_mode` stays switchable in the data.
- Before anything is charged, it needs the legal check (Terms, cancellation, auto-renewal wording) — see `LEGAL-COMPLIANCE-NOTES.md` item 16.

## Client side

1. Client taps **Book** → a "You're leaving CERVICED" notice says they're booking with the provider on their site, and that the provider's own terms cover the booking, payment and any cancellation or refund (product owner, 2026-10-18). **Continue** opens the page in an in-app browser sheet.
2. When they come back: "Did you book with *X*?" → **Yes, I booked** / **Not yet**.
3. Yes asks **day, time and service** (from the provider's specialities, or "Something else") → saved to `client_external_bookings` and shown under **BOOKED ELSEWHERE** in Bookings, with a "Booked on Fresha" tag and the note *"CERVICED doesn't handle bookings made on other sites — we just keep track of them, so your beauty life stays organised."*
4. **Booking details:** "Check your email" for the confirmation, "Need to change or cancel? That goes through *X*", buttons to open their booking page, message them, or add it to the phone's calendar, and a quiet **Remove from my bookings**. No editing.

## Rules for building it

- **Mode is a real column** (`providers.booking_mode`), never inferred from whether `external_booking_url` is filled in (same lesson as [[Client vs Provider Hats]]). Before the providers row exists, the sign-up answer stands in (`getProviderOwnershipForUserId`). In the app, read it from `useAuth().myBookingMode` (provider side) or `provider.isLinkOnly` (profile).
- **Every booking affordance must know the mode.** The DB refuses a `bookings` row for an external provider, so a missed check fails loudly rather than booking silently.
- **CERVICED never tracks or vouches for the external booking or its payment** — the deposit/liability boundary in `CLAUDE.md` applies. The client's entry is their own note, readable only by them.
- **Saving a provider counts as agreeing to their announcements** (product owner, 2026-10-18). The save moment doesn't say so yet — flagged, not built.
- **No teams** — the solo/team sign-up question was removed; teams aren't supported yet.
