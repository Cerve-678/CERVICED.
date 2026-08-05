# Becca — Capability Map

**Status:** Steps 0–5 of §4 are **BUILT** (2026-08-04) and live in
`src/services/becca/`. Step 6 (the LLM swap) is not started. Section 2's tables
describe shipped capabilities; §3 is still forward-looking.
**Supersedes:** nothing. This is the first doc scoped specifically to Becca.
Becca is mentioned in passing in `LOGIC.md`, `APP_OVERVIEW.md` and
`FUTURE_LOGIC.md` — treat *this* file as current for Becca specifically, and
those as stale where they disagree.

**Scope:** what Becca can do as the app's central intelligence layer using
**only real app data and deterministic logic** — no LLM. Part 3 covers what an
LLM adds *on top* of that layer later.

---

## 0. Why this doc exists — the state this replaced

> **Resolved 2026-08-04.** Everything in this section describes the *old*
> implementation. Both files named here have been deleted; the architecture in
> §1 is now real. Kept as the rationale for why it was rebuilt this way.

Becca was (`src/services/enhancedAIChatService.ts`, 900 lines) a single
`if/else` chain of regex run over the raw message string. Concretely:

- **No capability model.** Every intent is hardcoded inline. There is no list
  of "things Becca can do" anywhere in the codebase — the answer is "read the
  if/else chain and infer it."
- **No entity resolution.** She can match the *word* "nails" but cannot resolve
  "Lola" → a real provider, "my nail appointment" → a specific booking row, or
  "next Tuesday" → a date.
- **Almost no real data.** Of ~4,500 lines of query surface in
  `databaseService.ts`, Becca calls exactly **two** functions: `getProviders`
  and `getProviderPriceRanges`. She cannot see availability, prices of a
  specific service, reviews, promotions, waitlists, intake forms, or the
  client's own beauty profile.
- **No confidence, no honest fallback.** Unmatched input silently drops to a
  generic greeting that pretends nothing was missed.
- **Currency bug:** price replies are hardcoded `$` (lines 748–752) in a £ app.
- **Dead duplicate:** `src/services/aiChatService.ts` (453 lines) has **zero
  consumers** — a third copy of `dbToProvider` lives there. Delete it.

The important consequence: **there is nothing for an LLM to plug into.** If you
dropped Claude in tomorrow, you would delete all 900 lines, because none of it
is a reusable capability the model could call. Part 1 below is the layer that
makes the LLM a *swap*, not a *rewrite*.

---

## 1. The architecture — BUILT

Three pieces. This is the whole point of doing the non-AI version first.
Shipped layout:

```
src/services/becca/
  types.ts              contracts + ChatMessage/ChatSuggestion + confidence bands
  serviceCatalogue.ts   service keyword table (data, not control flow)
  entityResolver.ts     message fragments → real app objects
  matcher.ts            scores capabilities → an Understanding  ← the LLM swaps THIS
  registry.ts           the capability list + toToolSchema()
  engine.ts             orchestration, ambiguity, honest fallback
  capabilities/
    client.ts           34 client capabilities
    provider.ts         22 provider capabilities
    shared.ts           chip builders, £ formatting, the single dbToProvider
```

### 1.1 A capability registry

One declarative list of everything Becca can do. Each capability names its
required entities, the `databaseService` function it calls, and what it
returns. **This becomes the LLM's tool schema verbatim** — Part 3 is then
"generate a tool call against this registry" rather than a rewrite.

```ts
{
  id: 'booking.next',
  hat: 'client',
  needs: [],                       // no entities to resolve
  run: () => getMyBookings(),      // real data, real service boundary
  describe: 'When is my next appointment'
}
```

### 1.2 An entity resolver

Turns fragments of a message into real app objects, each with a confidence
score. This is what Becca fundamentally lacks today:

| Entity | Resolves from | Backed by |
|---|---|---|
| Provider | name, "my usual", "the one I saw last" | `searchProviders`, `getBookmarkedProviders`, booking history |
| Booking | "my nail appointment", "Friday's", "the one with Lola" | `getMyBookings` |
| Service | "gel mani", "balayage" | existing `serviceDatabase` + `getMyProviderServices` |
| Date/time | "tomorrow", "next Tuesday", "this weekend" | `dateUtils.ts` |
| Money | "under £50", "around 40" | existing `extractPriceFilter` (fix `$`→`£`) |

Ambiguity is a *first-class result*, not a failure: two matching bookings
returns both, and Becca asks which one.

### 1.3 Confidence + honest fallback

Every turn produces a confidence score. Three bands:

- **High** → answer directly with real data.
- **Medium** → answer, but state the assumption ("Assuming you meant your gel
  mani with Lola — …").
- **Low** → **say she didn't catch it**, then offer the 2–3 most likely
  interpretations as tappable chips, ranked by context (upcoming bookings,
  `userLearningService` top categories, time of day).

Becca never invents an answer. Confirmed as the chosen fallback behaviour.
This band is also **the exact seam the LLM replaces** — see 3.1.

---

## 2. What Becca can do with NO AI

Everything below is achievable with the deterministic layer above, against
query functions that **already exist**. Grouped by whether the data is
already reachable.

### 2.1 CLIENT hat

#### Bookings & schedule
| Capability | Backing function | Notes |
|---|---|---|
| "When's my next appointment?" | `getMyBookings` | ✅ data exists, Becca doesn't use it |
| "What have I got this week / on Saturday?" | `getMyBookings` | date-filtered |
| "How much do I owe / what's it costing?" | `getMyBookings` + `getBookingTip` | |
| "Where is it / how do I get there?" | `getProviderLocationsByIds` | ⚠️ **address is masked until released server-side** (`client_bookings` view). Becca must respect that, not leak it |
| "Cancel my Friday booking" | → deep-link `BookingDetail` | read-only: routes, doesn't write |
| "Can I still cancel free?" | `getProviderCancellationPolicyById` | real policy hours, real answer |
| "Reschedule my nail appointment" | → deep-link `RescheduleScreen` preloaded | |
| "Has my reschedule been accepted?" | `getActiveRescheduleRequest` | |
| "Do I need to fill anything in?" | `getPendingIntakeFormsForMe`, `getMyBookingActionItems` | **genuinely useful, entirely unreachable today** |
| "What did they send me to read?" | `getInfoPacksByBooking` | aftercare/prep packs |
| "Remind me what I booked last time" | `getRebookableService` | |
| "Book that again" | `getRebookableService` → deep-link | one-tap rebook |

#### Discovery & booking
| Capability | Backing function |
|---|---|
| "Find me a nail tech" | `getProviders` ✅ (only thing built) |
| "…under £50" | `getProviderPriceRanges` ✅ (fix `$`→`£`) |
| "…near me" | `searchProviders` w/ location |
| "…free this Saturday" | `AvailabilityService.hasNearTermAvailabilityForServices` — **the single biggest unlock; availability-aware search exists and Becca can't touch it** |
| "When's their next free slot?" | `AvailabilityService.resolveNextAvailableSlot` |
| "Anything back-to-back? (hair + nails same day)" | `AvailabilityService.findBackToBackSlots` — a real differentiator, completely unexposed |
| "Who's new / trending / top-rated?" | `getNewProviders`, `getTrendingProviderIds`, `getTopRatedProviders` |
| "Any deals on?" | `getActivePromotions` |
| "Is this promo code valid?" | `validatePromoCode` |
| "Show me their work" | `getProviderPortfolio`, `searchPortfolio` |
| "What do people say about them?" | `getProviderReviews` |
| "Do they do home visits?" | `getMobileProviderDisplayNames` |
| "Do I need a consultation first?" | `getConsultationRequiredProviderIds` |
| "Do they take a deposit?" | `getProviderDepositPoliciesByDisplayNames` |
| "They're fully booked — tell me if something opens" | `joinWaitlist` |
| "Am I on any waitlists?" | `getUserWaitlistEntries` |

#### Personal / memory
| Capability | Backing function |
|---|---|
| "Who are my usual people?" | `getBookmarkedProviders` |
| "What do I normally get?" | `userLearningService.getTopServiceCategory` ✅ built, unused by Becca |
| "Recommend something I'd like" | `userLearningService.getPersonalizedProviders` ✅ built, unused by Becca |
| "What's my style?" | `getPersonalisedTagContext` (style/technique/occasion tags) |
| Proactive: "You usually rebook every 4 weeks — it's been 5" | interaction history + booking cadence |

⚠️ **Health-adjacent — handle with care, do not let Becca freelance:**
`getUserHealthProfile`, `getClientBeautyProfile` hold patch-test requirements,
pregnancy-safety flags and contraindications. Becca may **surface a provider's
stated requirement** ("Lola requires a patch test 48h before") and **flag that
a form is outstanding**. She must **never** give a safety opinion, interpret a
contraindication, or imply clearance. That's a treatment-safety judgement and
it isn't hers to make.

#### Inbox & discovery (built)
| Capability | Backing function |
|---|---|
| "Any updates? / have I missed anything?" | `getMyNotifications('client')` |
| "Any messages? / has anyone replied?" | `getUserConversations` — deep-links into that provider's chat |
| "Show me nail ideas / balayage inspiration" | `searchPortfolio` / `getPortfolioItems` |
| "Who's the best rated? / any new providers?" | `getTopRatedProviders`, `getNewProviders` |

#### Navigation & help
"How do I change my password / see my saved photos / turn off notifications"
→ deep-link. Becca as a **searchable index of the app itself** is the cheapest
high-value capability here and needs no data access at all. **Not yet built.**

### 2.2 PROVIDER hat

Today provider-Becca is **pure navigation** — ten regex branches that each
just say "that's over there." She reads **zero** business data despite it all
existing:

| Capability | Backing function |
|---|---|
| "What's on today?" | `getProviderBookingsByDate` |
| "How busy am I this week?" | `getProviderBookings` |
| "Who's coming in next?" | `getProviderBookingsByDate` + `getUserBasicInfo` |
| "Any gaps I could fill?" | `AvailabilityService.getAvailableSlots` → prompt waitlist invite |
| "Anyone waiting on a cancellation?" | `getProviderWaitlist` → `inviteFromWaitlist` |
| "Any unread messages?" | `getProviderConversations` |
| "Anyone not filled their form in?" | `getMyProviderIntakeForms` |
| "How many clients do I have?" | `getProviderClientele` |
| "Who hasn't been back in a while?" | `getProviderClientele` + history → `sendRebookPrompt` |
| "Am I taking a day off Friday?" | `getProviderBlockedDates` |
| "Block out next Monday" | → deep-link Schedule |
| "How are my promos doing?" | `getMyPromotions` |
| "What's my cancellation policy?" | `getProviderCancellationPolicy` |
| "Send my regulars an offer" | → deep-link Promotions |
| Proactive: "3 clients haven't filled forms for tomorrow" | daily digest |

💰 **Hard boundary:** Becca must never report, total, or attest to money that
didn't move through the app's own processor — no "£X outstanding in cash," no
off-app balance tracking. That's the deliberate liability line in `CLAUDE.md`
and the removed "mark balance collected" feature. Earnings talk is limited to
what the app actually processed.

### 2.3 Cross-cutting

- **Every answer is actionable** — a booking answer carries [View] [Reschedule]
  [Message] chips, not just prose.
- **Ambiguity is asked about, not guessed** — "Which one? [Gel mani, Wed]
  [Lashes, Sat]".
- **Deep links carry parameters** — "reschedule my nail booking" opens
  `RescheduleScreen` with that booking already loaded, not a bare screen.
- **Same brain, two hats** — one capability registry, `hat` field gates it.
  Provider Becca can never reach a client capability.

---

## 3. What an LLM adds on top

The point of Part 1: none of the below is a rewrite. The LLM is dropped in as
a **better understander**, while the capability registry, entity resolver and
`databaseService` boundary stay exactly as they are.

### 3.1 Tier 1 — replace understanding only (highest value, lowest risk)

**Swap the regex intent-matcher for an LLM that emits a capability call.**
Everything downstream is unchanged; the capability registry from 1.1 is passed
as the tool schema.

Unlocks immediately:
- Natural phrasing — "my nails are wrecked, who can sort them before Saturday?"
  currently matches nothing; the capability (`availability` + `category` +
  `date`) already exists.
- Multi-intent — "cancel Friday and find someone for Saturday" = two calls.
- Real follow-ups — "what about Sunday?" against actual conversation state, not
  the current flat `ConversationMemory` bag.
- Typos, slang, mixed phrasing — free.
- The **low-confidence band from 1.3 becomes the LLM's job**: it either fills
  the gap or asks a genuinely good clarifying question.

Non-negotiable: **the LLM chooses capabilities; it never writes SQL and never
sees the Supabase client.** `databaseService.ts` remains the only file allowed
to call `.from()` (`CLAUDE.md`), and `has_gone_live` / address-release gating
stays server-side. The model is an intent parser with a tool list, not a
database client.

### 3.2 Tier 2 — generation

- **Natural phrasing of results** — same real data, human sentences.
- **Summarising** — "your week: 4 bookings, busiest Thursday, one needs a form."
- **Provider copy drafting** — promo text, client messages, service
  descriptions. Provider reviews before sending. Genuinely useful and low-risk
  because a human approves every send.
- **Review summarisation** — "consistently praised for nail art, a few mentions
  of running late."

### 3.3 Tier 3 — vision (the image input already in the UI does nothing today)

`BeccaScreen` already accepts image uploads; `imageAnalysis` exists on
`ChatMessage` and is **never populated**. With vision:
- "Find me someone who does this" → inspo photo → style tags → matching
  providers/portfolio. This is the app's most natural AI feature and the
  plumbing is already there.
- Provider: auto-tag portfolio uploads (fixes the category problem directly —
  see the `portfolio_items.category` NULL bug).

### 3.4 Tier 4 — proactive

Becca initiates: rebook nudges on personal cadence, "gap tomorrow, invite your
waitlist?", "patch test needed 48h before Saturday — book it now." Highest
value, **do last** — proactive messaging that's wrong is far more damaging than
reactive answers that are wrong.

### 3.5 What the LLM must NEVER do

- Touch Supabase directly, or bypass `databaseService.ts`.
- Decide visibility/permission — `has_gone_live`, address release, and RLS are
  **server-side gates**; the model is not an enforcement point.
- Give treatment-safety, medical or contraindication advice (§2.1).
- Assert anything about money outside the app's own processor (§2.2).
- Free-type Terms/Privacy/refund/age-policy wording — flag to a human
  (`LEGAL-COMPLIANCE-NOTES.md`).
- Invent a provider, price, slot, or policy. Every factual claim traces to a
  real query result or Becca says she doesn't know.

⚖️ **Before any LLM ships:** an AI assistant giving beauty/health-adjacent
guidance and handling personal data needs a legal look — disclosure that
you're talking to an AI, what conversation data is retained, and liability for
what she says. Not lawyer-reviewed. Run `cerviced-legal-flagger`.

---

## 4. Suggested build order

| # | Step | Status |
|---|---|---|
| 0 | Delete `aiChatService.ts` + `enhancedAIChatService.ts`; fix `$`→`£` | ✅ done |
| 1 | Capability registry (1.1) | ✅ `registry.ts` |
| 2 | Entity resolver (1.2) | ✅ `entityResolver.ts` |
| 3 | Confidence + honest fallback (1.3) | ✅ `engine.ts` |
| 4 | Client bookings + availability capabilities (2.1) | ✅ `capabilities/client.ts` |
| 5 | Provider business-data capabilities (2.2) | ✅ `capabilities/provider.ts` |
| 6 | LLM Tier 1 (3.1) | not started |
| 7 | Tiers 2–4 | not started |

Steps 0–5 are a genuinely useful Becca with **no AI at all** — and step 6 is a
swap, not a rewrite. That's the whole argument for doing it in this order.

### What step 6 actually involves

Small, and deliberately so:

1. Call `toToolSchema(hat)` in `registry.ts` — the tool list is already
   generated from the live registry, so it can't drift from the code.
2. Replace `understand()` in `matcher.ts` with a model call returning the same
   `Understanding` shape.
3. Keep `engine.ts`, every capability, and the `databaseService` boundary
   exactly as they are.

Nothing else changes. If a step-6 patch starts touching `capabilities/`, the
model is being given too much responsibility — see §3.5.

---

## 5. Known gaps (as built)

**Coverage today: 56 capabilities (34 client, 22 provider), 569 trigger
phrases, reaching ~55 of
`databaseService.ts`'s 193 exported functions.** Most of the remaining are
provider-settings mutations or internals Becca correctly shouldn't touch —
the list below is the genuinely useful, still-missing surface.

### Two axes: capabilities vs. phrases

**Capability count is not the goal, and pushing it up past what the data
supports actively makes Becca worse.** The matcher scores every capability
against every message, so near-identical entries compete with each other —
splitting `booking.next` into `booking.next.nails` / `.hair` / `.lashes`
wouldn't add an answer, it would add six ways to mis-route the same question.
Every routing bug fixed on the way here (`show me` vs `show me ideas`,
`waitlist` status vs join, `my services` vs `edit my services`) was exactly
this: two entries fighting over shared vocabulary.

The real ceiling is the app's own surface. `databaseService.ts` exports 193
functions, but 73 are writes and many reads are internal plumbing
(`getBookingUserId`, `getProviderUserIdById`). The distinct *user-facing
questions* the data can answer number in the low hundreds at most, and Becca
now covers a large share of them.

Hit rate comes from the **second** axis: how many ways of asking each
capability recognises. That's phrases, not capabilities — currently **569
across 56 capabilities (avg 10.2)**, up from 350. Prefer expanding a phrase
list over adding a capability whenever the underlying answer is the same.

### The write boundary (moved 2026-08-04)

Becca now performs a small set of writes herself, but **never as a side effect
of understanding a message**. A capability returns a `pendingAction`; the
engine renders exactly two chips (confirm / "Not now") and holds the action in
memory; only an explicit tap runs it. A misread intent therefore costs a tap,
not a mutation — which matters most precisely where the parser is weakest.

Properties verified end-to-end against a stubbed DB:
- Asking performs **zero** writes.
- Confirming writes **exactly once**, with the correct id.
- Double-tapping the confirm chip does **not** write twice (the action is
  removed from the map before it runs).
- The confirm token (`__becca_confirm__:<id>`) short-circuits the parser
  entirely, so it can never be re-read as natural language.
- Pending confirmations opt out of suggestion top-up, so no unrelated third
  chip can sit beside a destructive one.
- **Bound to hat AND signed-in user.** The confirm token is a plain string on
  an ordinary chat message, with a guessable `bookmark-<uuid>` shape, so a
  user can type one by hand. The engine is a module singleton shared across
  both hats and surviving a sign-out/sign-in within one JS process — without
  both checks, a hand-typed token could trigger a write offered to a
  different session. Verified: a different `userId`, a different hat, and a
  hand-typed token with nothing pending all perform **zero** writes.
- **5-minute TTL**: a confirmation is only valid for the exchange it was
  offered in. Running a write the user asked about ten minutes and six
  questions ago is not what they meant.
- **Only one pending write at a time** — offering a new one supersedes the
  old, matching what the UI already implies (previous chips have scrolled away
  and are no longer the live question).
- **Dismissal clears it**: "never mind" / "no thanks" drops the pending write
  and is treated as a real answer, not a failure to understand.

Live writes: `action.bookmark` (save a provider), `action.waitlist` (join a
waitlist). `action.review` deliberately **routes instead of writing** — a
review needs a star rating and free text, neither reliably parseable from one
chat message.

### `excludeWhen` — the intent-flipping modifier

Capabilities may declare a regex veto checked before scoring. It exists for
one narrow case: two capabilities sharing vocabulary that a *modifier* tells
apart. "my services" lists them; "**edit** my services" opens the editor.
Scoring alone can only ever make that close, so `pv.myservices` vetoes itself
on `/\b(edit|add|change|update|remove|delete|new)\b/`. Phrasing remains the
primary mechanism — reach for this only when a modifier genuinely inverts the
intent.

### Not built yet — client

| Missing | Why it matters | Backing function (exists) |
|---|---|---|
| "How do I change my password / turn off notifications?" | Becca as a searchable index of the app — needs no data at all, pure deep-link | n/a |
| "What's my event plan / group booking?" | Entire event-plan feature unreachable | `getMyEventPlans`, `getEventPlanDetails` |
| "How do I contact them?" | Provider phone/email not surfaced | `getProviderContactByDisplayName` |
| "Do they need a consultation first?" | Named in §2.1 but never wired | `getConsultationRequiredProviderIds` |
| "Add a tip to my booking" | Tip read/write both exist | `getBookingTip`, `setBookingTip` |

### Not built yet — provider

| Missing | Why it matters | Backing function (exists) |
|---|---|---|
| "Invite my waitlist to this gap" | Becca now **names who's waiting and for what**, then routes to booking history to pick a slot. Inviting needs a specific date+time, which is a picker job — a slot can't be read reliably out of chat. Fully automating it would need the `invite_next_waitlist_entry` RPC (in `waitlist_holds.sql`) rather than the app-side `inviteFromWaitlist`, which sets status to `'booked'` and tells the client it's "booked for you" **without creating a booking** — the calling screen has to insert one first. | `inviteFromWaitlist` (+ RPC) |
| "Nudge my regulars to rebook" | Retention tool, fully built, unreachable | `sendRebookPrompt` |
| "Send my clients an offer / announcement" | Routes to Promotions instead of doing it | `sendPromoToClient`, `sendAnnouncement` |
| "What did this client have last time?" | Per-client history unreachable | `getClientBookingHistory` |
| "Block out next Monday" | Reads blocked dates now, but can't set one | `addProviderBlockedDate` |

### Behavioural gaps

- **No conversational memory across turns.** Each message resolves
  independently, so "what about Sunday?" doesn't inherit the previous turn's
  service. Deliberate — multi-turn state is what an LLM does far better than a
  hand-rolled slot-filler, and a half-built version gets thrown away at step 6.
- **Image uploads still do nothing.** `ChatMessage.imageAnalysis` exists and is
  never populated (§3.3). The picker accepts a photo and the message reads
  "Sent an image."
- **Personalisation is wired in** (`PersonalContext` on every client-hat
  capability, resolved once per turn in `engine.ts`). `discover.forme`
  ("recommend something") uses it. It is deliberately honest about thin
  history: `hasUsefulHistory()` gates it, and below the threshold Becca says
  she doesn't know your taste yet rather than dressing a generic list up as a
  personal recommendation.
- **Booking mutations still never happen in chat.** Cancel and reschedule
  deep-link into the screen that owns the write, with the record preloaded.
  The `pendingAction` mechanism exists and could carry them, but a
  cancellation has fee consequences that belong on a screen showing the
  policy — that's a product call, not a technical limit.

### Smaller, as-built limitations

- **`discover.available` caps its fan-out at 8 providers**, so it answers
  "here are ones I checked that are free", not an exhaustive list. Each check
  is ~6 queries, so lifting the cap is a real cost decision, not a one-liner.
- **Provider name resolution is best-effort** — an unrecognised name falls
  through to no provider entity rather than a "did you mean" list.
- **Chat history is per-hat** (`becca_chat_sessions.hat`, added 2026-08-04).
  Client and provider Becca keep entirely separate histories; clearing one
  never touches the other.
