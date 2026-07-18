# Architecture Overview

CERVICED is a **React Native (Expo)** beauty-booking app with a **Supabase (Postgres)** backend. One codebase serves two roles — **clients** who book and **providers** who run a business — switched by [[Screens & Navigation|navigation mode]].

## The stack, top to bottom
```
Screens (52, src/screens)            ← UI, per client/provider mode
   │  read/write global state
Contexts (src/contexts)              ← Auth, Booking, Cart, Theme, Font, Registration
   │  call the data layer
Services (src/services)              ← databaseService, AvailabilityService, checkoutService…
   │  Supabase JS client
Supabase / Postgres                  ← tables + RLS + triggers + pg_cron + views + Edge Functions
```
See [[Screens & Navigation]], [[Contexts]], [[Services]], [[Data Layer — Supabase]].

## The golden rule (learned the hard way)
**Security and policy decisions belong in the database, not the screen.** The client renders what the server allows; it doesn't get to decide what it's allowed to see or do. This is the spine of the whole system → [[Client vs Server Authority]]. [[Address Release]] is the worked example of doing it right.

## The main flows
- A client books: [[Booking Flow]] (gated by [[Availability & Slots]]).
- A provider goes live: [[Provider Onboarding & Go-Live]].
- Everyone gets pinged: [[Notifications]] (DB-trigger driven).
- Money moves: [[Payments]].

## Where the "logic" really lives
A lot of behaviour is enforced by **Postgres triggers and cron jobs**, not app code — double-booking, address release, status-change notifications, 24h reminders. If something happens "automatically," look in [[Data Layer — Supabase]] first.

## Connections
[[Home]] · [[Client vs Server Authority]] · [[Data Layer — Supabase]] · [[Booking Flow]]

## Open questions
- Is there a per-provider timezone anywhere? Time-based rules currently assume UTC. #needs-verification
