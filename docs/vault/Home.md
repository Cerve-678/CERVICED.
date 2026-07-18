# 🧠 CERVICED — Brain

The map of the whole app. This is an Obsidian vault: every `[[link]]` is a jump to another note, and the **graph view** (left sidebar ⚙️ → open graph) draws the whole web. Start here.

> New to this? Read [[Setup — Using This Vault]] first.

## The big picture
- 🗺️ **[[Architecture.canvas|Architecture board]]** — the visual system map (drag-around Canvas)
- [[Architecture Overview]] — the app in one page
- [[Client vs Server Authority]] — who's allowed to decide what (security spine)
- [[Data Layer — Supabase]] — tables, triggers, RLS, cron, views

## Core features (how they actually work)
- [[Booking Flow]] — cart → checkout → booking created → confirmed
- [[Availability & Slots]] — how open times are computed and double-booking is blocked
- [[Address Release]] — when a client can see the provider's address
- [[Payments]] — money fields, deposits, who computes them
- [[Notifications]] — push + in-app, driven by DB triggers
- [[Provider Onboarding & Go-Live]] — signup → services → `has_gone_live`

## The code, by layer
- [[Screens & Navigation]] — 52 screens, dual client/provider modes
- [[Contexts]] — global React state (auth, cart, booking, theme…)
- [[Services]] — the data/API layer that talks to Supabase

## Live from the code (auto-generated) 🤖
Refreshes itself on every commit that touches `src/` or `supabase/` — never edit these by hand.
- [[Code Index]] — live counts + jump-off point
- [[Screens (generated)]] · [[Services (generated)]] · [[Contexts (generated)]] · [[Routes (generated)]] · [[Database Objects (generated)]]
- 🔀 [[Navigation Graph (generated)]] — real screen→screen wiring, with a live Mermaid diagram
- 🧠 [[Function Index (generated)]] — **every** function in `src`, by file (bold = exported)
- 🗂️ [[Feature Map (generated)]] — where each concern lives (the logic map)
- ✅ [[TODO Backlog (generated)]] — every `// TODO`/`// FIXME` in the code

## Capture & logistics 📓
- Templates (one-click **bug** / **feature** / **decision** notes): `_templates/` — see [[Sync, Mobile & Publish]]
- Phone, git sync, sharing: [[Sync, Mobile & Publish]]

## How to use this
- **Curated notes** (this folder) = the *why* and *how it connects* — hand-written, you maintain them.
- **`auto/` notes** = the *what* — regenerated from code by `scripts/gen-vault.mjs`. See [[Setup — Using This Vault]].
- Every note ends with **Connections** (`[[links]]`) and **Open questions**.
- Keep this vault in the repo so it version-controls alongside the code.
