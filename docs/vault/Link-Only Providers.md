# Link-Only Providers

Professionals who take bookings on **their own booking page** (Fresha, Treatwell, Booksy, Acuity…) but want to be found on CERVICED. Decided with the product owner on 2026-10-10, revised 2026-10-17. The original idea and its constraints are in `FUTURE_LOGIC.md` → "Signup Step 2b".

Designs: sign-up + provider + client flow canvas https://claude.ai/artifact/KHoSpyoht8Hw7R5FLT3TDh (the provider Home mockup predates the 2026-10-17 answers — go-live is four steps, and Becca/Announcements are available). Home / Portfolio / Profile redesign (2026-10-19, supersedes that canvas's provider tabs): https://claude.ai/artifact/GqfMewfVv6g8Vv317YwV5f

## Status

| Piece | State |
|---|---|
| Book button opens their page **inside** the app | Merged (#66) — `src/features/providers/externalBookingLink.ts` |
| Sign-up asks for the link (Step 1, "I use my own booking link") | Merged (#67). Migration `20261011102423_users_external_booking_url` applied 2026-10-11 |
| `providers.booking_mode`, go-live branch, booking guard, booked-elsewhere table, daily stats | Built on `feat/link-only-provider`. Migration `20261018200000_link_only_providers` **applied 2026-10-18** |
| Provider tabs (Home, Portfolio, Messages, Profile), Home, Analytics | Built on `feat/link-only-provider` |
| Client profile (Book + socials, no price list / rating / reviews), "Did you book?", Booked elsewhere in Bookings | Built on `feat/link-only-provider` |
| Calendar: provider diary from the phone's calendar; client "Add to my calendar" | Built on `feat/link-only-provider` (expo-calendar legacy API) |
| Search: only category, speciality, area, accessibility | Built on `feat/link-only-provider` |

## What they get

> **Default is "yes" (product owner, 2026-10-17).** Link-only providers can use the app like any CERVICED provider. Only the exclusions named on this page are off. Anything not listed here, **ask the product owner** whether they can use it before building — don't assume either way.

**Yes:** searchable (Search + Explore), profile (hero, About + optional Policies, specialities under Additional Information, logo, portfolio, opening hours in About), Book button with socials beside it, portfolio, in-app messages, Becca, Branding, Analytics, calendar sync.

**No:** CERVICED's own booking flow (they book via their link), the price list on their profile, star ratings and reviews (no reviews section at all), teams, Offers / promo codes, all client-care tools (info packs, intake / consultation forms, Clientele list, reminders), Automations.

- **Tabs:** Home, Portfolio, Messages, Profile. Becca is a floating button on Home.
- **Messages tab:** one list titled General enquiries (questions from Get In Touch). No General enquiries / Messages tabs, since they take no CERVICED bookings (2026-10-19).
- **Home (Dashboard, redesigned 2026-10-19, https://claude.ai/artifact/DrnMGFGGk5HJZW9ij1F9FN):** greeting + Live pill + today's hours; before go-live, the checklist; their diary always open on the whole week (day strip + every day, free/closed included); once live, This week vs last week (→ Analytics), Profile strength (missing extras, each opens its editor; the payment one reads "State preferred payment method") and "Becca noticed" (busiest Book-tap day); shortcuts Add work / Hours / Branding.
- **Portfolio tab:** a small preview of their profile as clients see it (taps through to the real one), their specialities (editable — Search's Speciality filter reads them), then the photo grid.
- **Profile tab:** the shared Settings screen (ProviderAccountScreen). For link-only its hero has Edit profile + Branding, and a Your Business section has Business Info, Opening hours and Policies, above the usual account sections.
- **InfoReg:** Identity, About & Portfolio, Contact only — with their booking link required. No Services or Address pages. Identity shows their Business Type, locked like Business Name and Service Type; Business Info is where they change it.
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

1. Client taps **Book** → the provider's page opens straight away in an in-app browser sheet. No "you're leaving CERVICED" step (product owner, 2026-10-18 — briefly built, then removed).
2. When they come back: "Did you book with *X*?" → **Yes, I booked** / **Not yet**.
3. Yes asks **day, time and service** (from the provider's specialities, or "Something else") → saved to `client_external_bookings` and shown under **BOOKED ELSEWHERE** in Bookings, with a "Booked on Fresha" tag and the note *"CERVICED doesn't handle bookings made on other sites — we just keep track of them, so your beauty life stays organised."*
4. **Booking details:** "Check your email" for the confirmation, "Need to change or cancel? That goes through *X*", buttons to open their booking page, message them, or add it to the phone's calendar, and a quiet **Remove from my bookings**. No editing.

## Rules for building it

- **Mode is a real column** (`providers.booking_mode`), never inferred from whether `external_booking_url` is filled in (same lesson as [[Client vs Provider Hats]]). Before the providers row exists, the sign-up answer stands in (`getProviderOwnershipForUserId`). In the app, read it from `useAuth().myBookingMode` (provider side) or `provider.isLinkOnly` (profile).
- **Every booking affordance must know the mode.** The DB refuses a `bookings` row for an external provider, so a missed check fails loudly rather than booking silently.
- **CERVICED never tracks or vouches for the external booking or its payment** — the deposit/liability boundary in `CLAUDE.md` applies. The client's entry is their own note, readable only by them.
- **No Announcements for link-only pros** (product owner, 2026-10-19 — reverses the 2026-10-17 yes). The app-side sheet and `sendAnnouncementToMySavers` are deleted; the DB function `send_announcement_to_my_savers` (migration 20261018200000) is still live and now has no caller — drop it in a future migration (needs the MIGRATION_OWNER lock).
- **No teams** — the solo/team sign-up question was removed; teams aren't supported yet.
