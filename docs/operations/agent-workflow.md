# CERVICED autonomous workforce

This is the operating model for having Codex make steady, reviewable progress
without turning the app into a collection of overlapping experiments. The
project-local roles are in `.codex/agents/`; the `cerviced-workforce-director`
is the entry point.

## Department ownership

| Department | Head agent | Owns | Handoff when |
| --- | --- | --- | --- |
| Booking | `cerviced-booking-lead` | Client booking, provider diary, availability contract, booking lifecycle, checkout handoff | A change needs shared data authority, payments, RLS or migration work |
| Discovery | `cerviced-discovery-lead` | Home, Search, Explore, profile discovery, filters, matching, recommendations | A customer picks a time or a provider control changes bookability |
| Provider management | `cerviced-provider-management-lead` | Onboarding, business profile, services, schedule, policies, automation, business controls | A setting changes an appointment's lifecycle or needs backend authority |
| Client experience | `cerviced-client-experience-lead` | Account, messages, notifications, loyalty, saved providers, support, accessibility | An action changes appointment state or needs a data/notification authority change |
| Intelligence | `cerviced-intelligence-lead` | Becca client/provider assistants, capability routing, recommendations and AI safety boundaries | A response needs a booking action, personal data or a platform permission |
| Platform reliability | `cerviced-platform-reliability-lead` | Supabase, Edge Functions, security, migrations, payments, data contracts, errors | Product behaviour or launch sequencing needs a department decision |
| Release | `cerviced-release-lead` | Native builds, CI checks, store readiness, configuration and launch evidence | A build needs submitting, publishing or production configuration change |

Booking has its own worker group because it is the product's core transaction:

| Booking worker | Responsibility |
| --- | --- |
| `cerviced-booking-client-experience` | What a client can discover, select, pay for, change and understand |
| `cerviced-booking-provider-operations` | What a provider can configure, see, accept, decline, move, cancel and manage |
| `cerviced-booking-platform-integrity` | Booking authority, slots, RLS, RPCs, triggers, payments and notifications |
| `cerviced-booking-lifecycle-qa` | The scenario matrix and proof that both sides reach the same result |

## How a task runs

1. The director reads the backlog and takes one **Ready** ticket.
2. The owning head writes a small assignment: user scenario, file or system
   boundary, acceptance criteria, variants and validation.
3. The implementation agent works in its own worktree and branch. Reviewers
   investigate or review; only the implementation owner integrates a change.
4. The owner runs the required checks and follows every cross-hat transition to
   its final state. The booking QA worker is required for booking changes that
   affect status, money, availability, notifications or address release.
5. The director updates the ticket with evidence, the local commit, remaining
   risk and the next owner. It then begins the next Ready ticket.

No two agents edit the same feature or migration. A shared file is a handoff,
not an excuse for simultaneous edits.

## Autonomy limits

The workforce may autonomously inspect, research, edit code, add meaningful
tests, run local verification and make a scoped local commit. It must produce a
reviewable result before asking for an external action.

It must stop and mark a ticket **Needs decision** before it:

- applies a production migration, changes live records or sends user messages;
- submits/publishes a build or changes production configuration;
- spends money, creates a paid account or changes payment settlement;
- makes a product/legal choice about refunds, cancellations, privacy, age,
  health-adjacent data, or terms;
- deletes material data or makes an irreversible history change.

The backlog is allowed to continue while a decision is pending: the director
chooses the next independent Ready ticket. A blocked item never stops the
entire workforce.

## Ticket standard

Each backlog entry has an identifier, priority, owner, state, scenario,
acceptance criteria, validation and dependencies. Use these states:

- **Ready** — safe to start without further product direction.
- **Research** — gather evidence and turn uncertainty into a scoped ticket.
- **Needs decision** — product, legal or external action is required.
- **In progress** — exactly one owner/worktree is acting on it.
- **Review** — implementation complete; evidence is ready for review.
- **Done** — accepted criteria and relevant checks passed.

Do not call a ticket Done just because code compiles. For a cross-hat feature,
the evidence must show what the client sees, what the provider sees and what
the server records.

## Suggested automations

Codex Automations can run work in the background on a schedule and return it
to a review queue. They are suited to audits and triage rather than unattended
production changes. Set them up in the Codex app with the director prompt and
this repository open:

- **Weekdays, 09:00 — Booking health triage:** Run the director, audit the
  first Research booking item and create/refresh evidence-backed tickets. Do
  not apply migrations, submit builds or modify production.
- **Weekdays, 13:00 — Ready-ticket implementation:** Run the director. Take
  one P0/P1 Ready ticket, use its owning department, work in a dedicated
  branch, verify it and leave a local commit plus review note. Stop at every
  autonomy limit.
- **Weekdays, 17:00 — Release evidence:** Run the release lead. Check current
  build/test status and report only changes, failures and launch blockers.
  Never submit or publish.

Automations do not replace review: each run should leave a bounded branch and
a short report, ready for the user to inspect. OpenAI documents that Codex
Automations run scheduled instructions in the background and deliver results
to a review queue; availability depends on the Codex app and account.

## Prompts to use

Start the whole workflow with:

```text
Use cerviced-workforce-director. Work through the highest-priority Ready ticket
in docs/operations/agent-backlog.md. Follow docs/operations/agent-workflow.md.
Do not perform an action listed under Autonomy limits. Leave one reviewable
result and update the backlog with evidence before moving to another ticket.
```

Start only booking work with:

```text
Use cerviced-booking-lead. Audit and progress the highest-priority Ready
booking ticket. Use the client, provider, platform and lifecycle-QA workers as
needed. Prove client/provider/database parity before marking it ready for
review; stop at the autonomy limits.
```
