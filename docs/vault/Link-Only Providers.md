# Link-Only Providers

Professionals who take bookings on **their own booking page** (Fresha, Treatwell, Booksy, Acuity…) but want to be found on CERVICED. Decided with the product owner on 2026-10-10. The original idea and its constraints are in `FUTURE_LOGIC.md` → "Signup Step 2b".

Designs: sign-up + provider + client flow canvas https://claude.ai/artifact/KHoSpyoht8Hw7R5FLT3TDh

## Status

| Piece | State |
|---|---|
| Book button opens their page **inside** the app | Built — `fix/external-booking-in-app` (`src/features/providers/externalBookingLink.ts`) |
| Sign-up asks for the link (Step 1, "I use my own booking link") | Built — `feat/signup-redesign`. Needs migration `20261010120000_users_external_booking_url` applied first |
| Link-only mode as a real provider column (`booking_mode`) | Not started |
| Their limited home screen, go-live, analytics | Not started |
| Client "Did you book?" → Upcoming | Not started (needs a new table) |
| Calendar sync (Google / iPhone) | Not started |

## What they get

- **Searchable** on CERVICED (Search, Explore) like any live provider.
- **Profile:** hero with their speciality chips, About + Policies, logo, portfolio. **No price list, no star rating.** The availability pill is replaced by the **Book** button with their social icons beside it in the accent colour.
- **Portfolio** and **in-app messages** with clients.
- **Opening hours** through InfoReg.
- **InfoReg** is limited to Step 1, opening hours and the portfolio section — the rest of CERVICED's booking setup does not apply.
- **Analytics:** Book-button taps (headline), profile views, search appearances, Instagram taps, saves.
- **Calendar sync** — connect Google Calendar or iPhone Calendar.

Everything else (in-app booking, schedule/availability, deposits and payouts, waitlist, offers, Becca) stays locked until the product owner switches it on.

## Go-live checklist

Exactly three things: **logo**, **About**, **policies**. This means the server go-live check (`check_and_set_provider_live()`) needs a separate branch for this mode — see [[Provider Onboarding & Go-Live]].

## Pricing (planned, not active)

- **Calendar sync + in-app messages** are planned as a **£5.99 / month** subscription **with a free trial**.
- **Right now everything above is free.** The product owner will switch the subscription on later.
- Before it is switched on, the subscription needs the legal check (Terms, cancellation, auto-renewal wording) — see `LEGAL-COMPLIANCE-NOTES.md`. Nothing about charging is built.

## Client side

1. Client taps **Book** → the provider's page opens in an in-app browser sheet.
2. On **Done**: "Did you book with *X*?" → **Yes, I booked** / **Not yet**.
3. Yes asks **day, time and service** (from the provider's specialities) → added to **Upcoming** with a "Booked on Fresha" tag and the note *"CERVICED doesn't handle bookings made on other sites — we just keep track of them, so your beauty life stays organised."*
4. The client **Upcoming screen itself stays as it is** — only the new card type appears in it.
5. **Booking details:** "Check your email" for the confirmation, "Need to change or cancel? That goes through *X*", buttons to open their booking page or message them, and a quiet **Remove from my bookings**. No editing.

## Rules for building it

- **Mode is a real column**, not inferred from whether `external_booking_url` is filled in (same lesson as [[Client vs Provider Hats]]).
- **Every booking affordance must know the mode** — a Book button that opens an empty slot sheet reads as broken.
- **CERVICED never tracks or vouches for the external booking or its payment** — the deposit/liability boundary in `CLAUDE.md` applies. The client's entry is their own note, not a CERVICED booking.
- **No teams** — the solo/team sign-up question was removed; teams aren't supported yet.
