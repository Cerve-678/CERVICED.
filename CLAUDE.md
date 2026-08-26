# CERVICED — Engineering Standards

Read this at the start of every session. It's the standing bar for how work gets
done in this repo — security, scalability, and functionality — not a description
of what the app does (see `APP_STATE.md` for that — a living doc, kept current,
not a one-time snapshot; verify anything load-bearing against actual code
regardless) and not a log of ongoing work (see the auto-memory `MEMORY.md`,
which tracks facts, bugs, and decisions over time).

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
- **`cerviced-becca-intelligence`** — Becca's capability registry, entity
  resolver, and confidence/fallback behaviour (`src/services/becca/`), plus
  the staged path to a real LLM. Use it for anything Becca can understand,
  answer, or route to, and before wiring a model in — the registry is
  deliberately shaped as the LLM's tool schema, so `matcher.ts` is the only
  file a model should replace. See `BECCA_CAPABILITIES.md`.
- **`cerviced-legal-flagger`** — flags (never drafts) legal-adjacent gaps
  when a change touches Terms & Conditions, Privacy Policy, refunds, age
  limits, or payment handling.
- **`cerviced-scalability-review`** — reviews a diff against the Scalability
  patterns below (unbounded queries, N+1 loops, unmemoized context, unstable
  list keys, image flicker).
- **`cerviced-security-review`** — reviews a diff against the Security rules
  below (Supabase access boundary, `has_gone_live` gating, private-field
  leakage, payment handling).
- **`cerviced-security-audit`** — comprehensive whole-app security audit
  beyond the rules already documented below: plaintext data exposure
  (on-device storage, logs, transit), RLS coverage across every table (with
  the past `users_public_profile_read` PII leak as the regression to guard
  against), session/token storage, secrets hygiene, payment/PCI scope, edge
  function auth, and mobile-specific hardening. Use for pre-launch or
  periodic audits, not single-diff review.
- **`cerviced-engineering-lead`** — audits organization/architecture health:
  folder placement, competing/duplicate systems (theme, payment), doc sprawl,
  dead code and deprecated aliases, naming hygiene. Use it for a program-
  management-style pass across a change or the whole repo — it's the "does
  this stay manageable at scale" lens, distinct from the security/scalability
  agents' correctness/performance lenses.
- **`cerviced-feature-coherence`** — finds features that don't talk to
  each other: copy that asserts an event nothing actually causes, a setting
  only some of the paths it implies actually read, one concept split across
  two screens as two contradictable settings, or two features each assuming
  the other covers a case. One level up from
  `cerviced-detail-consistency-audit`'s value-level bugs — here every piece
  is individually correct and the wiring between them is what's missing.
  Reach for it when a feature spans two screens or hats, and before adding
  any notification or new user-facing setting.
- **`cerviced-design-review`** — checks a screen/component against
  `DESIGN_SYSTEM.md`'s actual documented conventions (exact palette hex
  values, mandatory `ThemedBackground` wrapper, accent color, typography,
  haptics, `activeOpacity`). The detailed screen-level branding lens,
  distinct from `cerviced-engineering-lead`'s architectural-level flag that
  two theme systems exist at all.
- **`cerviced-migration-drift`** — reconciles `supabase/*.sql` files against
  the actual live schema (via the Supabase MCP tools) to find drift: a file
  that's stale vs. what's live, a fix applied live but never written back,
  or a fix file that exists but isn't wired into `RUN_ALL_MIGRATIONS.sql`.
  Use before trusting any `supabase/*.sql` file as ground truth.

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

- Run **both** `npx tsc --noEmit` and `npm test` before calling anything done.
  `jest-expo` is installed and the suite genuinely passes (20 suites / 44
  tests, a few seconds) — it covers Becca routing and capability contracts,
  booking/cart/date presentation, profile mappers, receipts and the platform
  fee, so it catches real regressions in exactly the areas most likely to
  break. Add a test alongside new logic in those areas rather than leaving
  the suite behind.
- `npm run lint` **is** still broken pre-existing (ESLint 9, no config file
  anywhere in the repo) — that's not something your change broke. Don't try
  to "fix" it as a side effect of an unrelated task without asking.
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

## Organization & architecture health

This is the standing bar for repo hygiene, architectural consistency, and
feature/doc lifecycle — the "does this stay manageable as the codebase grows"
side of the job, on top of whether any single change is secure/fast/correct.
Treat drift here as debt to flag or fix, not as something to quietly work
around. For a structured, on-demand audit, use the `cerviced-engineering-lead`
agent — these are the standing rules of thumb for every session.

- **One system per concern, not two competing ones, left unacknowledged.**
  `src/theme/tokens.ts` + `useEnterpriseTheme()` exists but almost no screen
  uses it — the design system that's actually load-bearing is the duplicated
  per-screen `const L = {...}` / `const D = {...}` palette literals described
  in `DESIGN_SYSTEM.md`. Follow the convention that's actually in use, don't
  invent a third pattern, and don't unilaterally "fix" the split by migrating
  screens onto the enterprise theme without being asked — that's a
  cross-cutting call for the user to make, not a drive-by cleanup.
- **New code goes in the folder that already owns that concern**:
  `src/services/` (Supabase-backed logic — see the Security section above for
  the `databaseService.ts` boundary), `src/screens/` (one screen each, sorted
  by ownership into `src/screens/client/`, `src/screens/provider/`, and
  `src/screens/shared/`, with `src/screens/auth/` kept separate for the auth
  flow only — same split under `src/navigation/`: `src/navigation/client/`
  and `src/navigation/provider/`, each with their own `tabs/` subfolder),
  `src/components/` (shared/reusable UI), `src/contexts/` + `src/stores/`
  (cross-screen state — see the Scalability memoization rule for contexts
  specifically), `src/constants/` + `src/data/` (static config/lookup data),
  `src/utils/` (pure helpers), `src/types/` (shared TS types). If a new file
  doesn't obviously fit one of these, ask where it should live rather than
  guessing.
- **No parallel implementations of the same feature left coexisting
  silently.** The old mock card-entry `PaymentModal` in `CartScreen.tsx`
  alongside the newer real `stripeService.ts` / `create-payment-intent` path
  is a known, deliberate mid-migration state (see auto-memory
  `stripe-payment-intent-integration`), not a pattern to replicate elsewhere.
  When rebuilding a feature, either finish removing the old path in the same
  change or say explicitly that the old path is a deliberate transition
  state — don't leave two versions coexisting silently with no note on why.
- **Deprecated aliases get migrated away from, not left as permanent
  scaffolding.** `<AppBackground>` is flagged in `DESIGN_SYSTEM.md` as
  "deprecated, kept only for legacy reasons." If you touch a screen that
  still imports it, migrate that screen to `<ThemedBackground>` in the same
  pass instead of leaving the shim in place indefinitely.
- **Root-level docs are already sprawled — don't add to it without
  consolidating.** `LOGIC.md`, `APP_OVERVIEW.md`, `APP_PROGRESS.md`, and
  `FINAL_STATUS.md` used to describe overlapping "current app state" ground
  and were consolidated into a single living doc, `APP_STATE.md`, on
  2026-08-08 (the four originals were deleted). `FEATURE_LOGIC.md` (build
  methodology) and `FUTURE_LOGIC.md` (roadmap) are a different genre and
  remain separate on purpose. Before adding a new top-level `*.md`, check
  whether `APP_STATE.md` or an existing doc should be updated instead — and
  if a new one is genuinely warranted, note in it which older doc(s) it
  supersedes so the next person isn't guessing which file is current.
- **`docs/vault/auto/` is an auto-generated pipeline, not a place to
  hand-edit.** Files landing there as untracked `"<Name> 2.md"` duplicates
  (e.g. `BeautyProfileScreen 2.md`, `ExploreScreen 2.md`) are a generator
  collision, not intentional content — if you're touching that pipeline, fix
  the regeneration to overwrite in place instead of forking a numbered copy,
  and remove the stray duplicates rather than checking in both versions.
- **A change isn't done until it's the only version of itself.** This is the
  file/doc-level form of the "don't reintroduce dead code" rule above: an
  abandoned screen, a superseded SQL migration file, or a stale doc left
  behind after a rewrite is exactly what makes a codebase progressively
  harder to onboard into and reason about — that's the actual cost "doesn't
  scale" is pointing at, not just runtime performance.
- **Naming describes the thing, not its history.** Avoid `V2`, `New`, `Old`,
  `Copy`, `Final`, `_deprecated` suffixes on files meant to stay — either
  replace the original outright (git history already keeps the "old"
  version), or, if both must coexist for a migration window, name both for
  what they *are* (`stripeService.ts` vs. the mock flow it's replacing), not
  for their age.
- **Commit intentionally; never `git add -A`.** There is no auto-checkpoint
  hook any more — a `Stop` hook that ran
  `git add -A && git commit -m "checkpoint: WIP <date>"` on every turn was
  removed on 2026-08-20. It produced 24 meaningless commits out of 142 and,
  because this repo is often open in **two Claude sessions at once**, each
  session kept committing the other's half-written files — which is what made
  a constant appear to "revert" mid-session and threw `tsc` errors in files
  nobody was editing. Stage the specific paths you touched, commit when a unit
  of work is actually done, and write a message that says what changed.
  `/rewind` covers mid-turn undo without touching git. The branch is
  squash-merged into `main`, so the existing WIP commits never reach it.
- **Commit your own work only — `git add <paths>` does not scope a commit.**
  `git commit` commits everything **staged**, not the paths you just added, so
  anything the other session left staged rides along under your message. Use
  the pathspec form instead, which commits only the named paths and leaves a
  concurrently-staged file untouched and still staged:

  ```
  git commit -m "..." src/thing.ts src/tests/thing.test.ts
  ```

  Before committing, read `git status --short` and treat any staged entry in
  the **left** column (`M `, `A `, `R `) as someone else's work unless you put
  it there: don't sweep it in. On 2026-08-26 a migration rename another session
  had staged landed inside an unrelated cart fix exactly this way.

  One exception, and it is not a mistake: `.githooks/pre-commit` regenerates
  the Obsidian vault and runs `git add docs/vault/auto` on any commit touching
  `src/` or `supabase/`. Those files appearing in your commit is the hook doing
  its job — leave them alone rather than hunting for who staged them.
  Two caveats: the pathspec form commits the working-tree state of those paths,
  so it ignores a deliberately part-staged hunk; and it only accepts **tracked**
  paths, so a brand-new file still needs `git add` first — then name it in the
  commit's pathspec along with everything else.
- **Don't leave your own work uncommitted "to be safe" either.** The other
  session's next commit picks it up under an unrelated message — that is how
  `getBookableServiceIds`, a cart fix, landed inside a business-type refactor
  on 2026-08-26. Uncommitted is not neutral in a shared tree.
- **When one file genuinely holds both sessions' changes, say so in the
  message.** Git can't split a file at commit time, and a silent mixed commit
  is worse than an acknowledged one. Name the other change and which commit it
  belongs with, rather than rewriting shared history to separate them —
  rewriting unpushed commits while another session is mid-edit is how this
  repo loses work.
- **One session owns migrations at a time — see `supabase/MIGRATION_OWNER.md`,
  and check it before writing or applying one.** The commit rules above stop
  two sessions mixing *files*; they do nothing about two sessions writing
  schema against one live Supabase project, which is the sharper risk because
  git mistakes are recoverable and a migration applied out of order isn't
  always. `CREATE OR REPLACE` succeeds silently against a newer definition, so
  a correct migration numbered below the applied frontier reverts someone
  else's work with no error and no conflict. The consent-gate migration was
  renumbered twice for exactly this before the rule existed. Number above
  `max(version)` in `supabase_migrations.schema_migrations`, never off the wall
  clock, and release the lock when the migration is **applied** rather than
  when the file is written.
- **This repo lives under `~/Desktop`, so iCloud forks conflicting writes**
  into numbered copies (`shuffle 2.ts` beside `shuffle.ts`). They are never
  intentional content, and `.gitignore` now drops them — but only for
  `ts/tsx/js/jsx/json`. Numbered **asset** files are legitimate here
  (`assets/logos/iPhone 14 & 15 Pro Max - 3.png`) and `supabase/migrations/`
  is excluded on purpose, since a real migration must never be silently
  untracked. Never resolve one of these by filename heuristic: diff it against
  its counterpart first. 15 unresolved ones are listed in `PRE-LAUNCH-TODO.md`
  section 8.
- **"Done" is a program-management gate, not just green output.** For
  anything non-trivial: `tsc` clean, `npm test` green, golden path actually run (not just
  typechecked), the relevant specialist review agent(s) invoked (security /
  scalability / legal as applicable), no orphaned files or dead code left
  behind, and — if the change changes a fact worth remembering — the
  auto-memory updated. A senior eng lead doesn't sign off on a PR from green
  tests alone if it leaves dead files or undocumented architectural drift
  behind; hold changes here to the same bar.
