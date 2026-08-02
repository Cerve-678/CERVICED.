# CERVICED — Engineering Standards

Read this at the start of every session. It's the standing bar for how work gets
done in this repo — security, scalability, and functionality — not a description
of what the app does (see `LOGIC.md` for that, though treat it as aspirational/
stale, not authoritative — verify against actual code) and not a log of ongoing
work (see the auto-memory `MEMORY.md`, which tracks facts, bugs, and decisions
over time).

CERVICED is a two-sided beauty & wellness marketplace (React Native/Expo +
TypeScript, Supabase backend), UK-based (£ pricing), connecting clients with
independent providers. Some data is health-adjacent (patch-test requirements,
pregnancy-safety flags, contraindications, aftercare notes) — treat it with the
same care as any sensitive personal data, not just as ordinary product copy.

## Specialist agents

This repo has domain-specific subagents (`.claude/agents/`) — reach for them
instead of re-deriving their knowledge from scratch:

- **`cerviced-app-knowledge`** — general orientation: "what's going on,"
  "where does X live," "what's the current state of Y." The right first stop
  when picking work back up after time away, or when a question spans more
  than one area below. It reconciles memory/docs against the actual current
  code and git state rather than trusting any one source.
- **`cerviced-booking-domain`** — booking/notification internals: status
  mapping, DB-trigger-owned notifications, dual provider-name sources,
  reschedule RPCs, permissive RLS on `bookings`.
- **`cerviced-legal-flagger`** — flags (never drafts) legal-adjacent gaps
  when a change touches Terms & Conditions, Privacy Policy, refunds, age
  limits, or payment handling.
- **`cerviced-scalability-review`** — reviews a diff against the Scalability
  patterns below (unbounded queries, N+1 loops, unmemoized context, unstable
  list keys, image flicker).
- **`cerviced-security-review`** — reviews a diff against the Security rules
  below (Supabase access boundary, `has_gone_live` gating, private-field
  leakage, payment handling).

---

## Security

- `src/services/databaseService.ts` is the **only** file allowed to import the
  Supabase client and call `.from()`. Screens/components/other services import
  functions from there — never call Supabase directly elsewhere.
- Every client-facing provider query **must** filter `has_gone_live = true`
  (and typically `is_active = true`). The only exception is a provider reading
  their own record — comment the exception inline when you write one.
- Never send a provider's private fields (full street address, anything in
  `provider_private_details`) to a client-facing query or screen. Address
  release is policy-gated server-side (`client_bookings` view) — the app is
  not the enforcement point, the DB is.
- RLS has no DELETE policy on `bookings`/`notifications` — a client-side
  delete is a silent no-op, not an error. Use a SECURITY DEFINER RPC.
- Functions in `databaseService.ts` throw on error — never swallow errors or
  quietly return null/empty on failure. Callers decide how to degrade.
- All parameters and return types are explicitly typed — no `any` in new
  service code.
- Never build a feature that has the app itself collect, store, verify, or
  attest to an in-person/off-app payment between a client and provider (e.g.
  a deposit's remaining balance). If it isn't money moving through the app's
  own payment processor, the app has no business tracking its status —
  that's a liability boundary the product has deliberately drawn (see the
  Terms & Conditions "Deposits & Remaining Balances" clause, and the
  removed "mark balance collected" feature).
- The in-app payment form (`CartScreen.tsx`'s `PaymentModal`) currently
  collects raw card fields itself rather than tokenizing through a
  PCI-DSS-compliant processor (Stripe/Adyen/etc.) — before this ever
  handles real money, that has to change. Don't extend the current mock
  flow as if it were production-ready payment handling.

## Scalability

Patterns to default to, not exceptions to reach for only when something is
visibly slow:

- **No unbounded list queries.** Every provider/booking/search list query
  should have a `.limit()`. `getProviders`/`searchProviders` default to a
  200-row cap (`DEFAULT_PROVIDER_QUERY_LIMIT` in `databaseService.ts`) —
  match that pattern for new list queries instead of fetching a whole table.
- **No N+1 loops.** If you're about to `await` a per-row Supabase call inside
  a `for`/`.forEach`/`.map(async ...)` over a list you already have, batch it
  into one `.in('id', ids)` query instead. See `AvailabilityService.
  hasNearTermAvailabilityForServices` and the `createBooking` conflict-check
  batch fetch for the shape to follow.
- **No sequential awaits for independent work.** If two `await` calls don't
  depend on each other's result, run them with `Promise.all` /
  `Promise.allSettled`, not one after another.
- **Memoize context values.** Any React Context's `value` prop must be
  `useMemo`'d (deps on the actual changing pieces), and anything folded into
  it that isn't already a `useCallback`/stable primitive needs its own
  `useMemo` too — otherwise every consumer re-renders on every provider
  render, regardless of what actually changed. `BookingContext` is the
  reference example.
- **Stable list keys.** Never embed an array index in a React `key` for a
  list keyed by a real entity id (`` `${label}-${index}-${id}` ``) — if the
  list can ever reorder, the index-in-key forces an unmount/remount (visible
  as a flash/pop, not just a wasted render) even though the item didn't
  change. Key by the entity id alone.
- **Image flicker:** always pass `fadeDuration={0}` on RN `<Image>` for
  provider/portfolio/logo images. Without it, any re-render (not just a new
  URI) can retrigger the default fade-in, which reads as a glitch on lists
  that re-render for unrelated reasons (location resolving, sort changing).

## Functionality & verification

- `npx tsc --noEmit` is the actual verification standard right now —
  `npm test` (no `jest-expo` installed) and `npm run lint` (ESLint 9, no
  config file) are both broken pre-existing, not something your change broke.
  Don't try to "fix" that as a side effect of an unrelated task without
  asking; do run `tsc` before calling anything done.
- For UI changes, actually run the app and exercise the golden path when you
  can (see the `run` skill). Typechecking proves the code compiles, not that
  the feature works.
- Don't reintroduce dead code. If a change makes a function/type/notification
  variant have zero callers, delete it in the same pass rather than leaving
  it "just in case."

## Legal & compliance

There is no in-house legal review of this app. Product/copy decisions that
touch Terms & Conditions, Privacy Policy, refunds, age limits, or payment
handling are not something to draft unilaterally as if they were ordinary
engineering work — implement the specific wording/behavior the user directs,
but flag anything that looks like a legal gap rather than silently
"improving" legal copy on your own initiative. See `LEGAL-COMPLIANCE-NOTES.md`
for the standing punch-list of known gaps (no Privacy Policy screen, mock
payment flow, health-adjacent data handling, age-verification questions,
etc.) — that file is not legal advice and hasn't been reviewed by a lawyer;
treat it as things to raise, not things to consider resolved.
