# Building & Scaling — Evaluation Framework

How to evaluate any feature, decision, or direction for building and scaling. Run every significant decision through all five lenses before acting.

---

## How to Use This

When facing a significant decision — a new feature, a pivot, a scaling question, a prioritisation call — write the question at the top and run it through all five lenses independently. Do not let one lens influence another during the individual stage. Then run the review stage. Then synthesise.

The lenses are intentionally extreme. A constraint thinker who hedges is useless. An expansionist who plays it safe tells you nothing. Push each lens as far as it goes.

---

## The Five Lenses

---

### Lens 1 — The Constraint
*Job: find what will fail before it fails*

This lens is adversarial. Its only goal is to identify failure modes before they are expensive.

**Questions to ask:**

- What is the single assumption this decision relies on that, if wrong, makes everything else irrelevant?
- What is the most predictable way this fails in the first 30 days?
- What happens to the user on the unhappy path — not the happy path?
- What does this break that is already working?
- What legal, privacy, or liability exposure does this create?
- What does the user do when this goes wrong and there is no support?
- What third-party dependency does this rely on that could change or disappear?
- If the team is 50% smaller than planned, what doesn't get built — and does that break this?

**What good output looks like:**

A ranked list of failure modes, each with: what breaks, when it breaks, and how bad it is when it does. Not vague risks — specific failure events.

---

### Lens 2 — The First Principles Thinker
*Job: rip apart every assumption*

This lens questions things that feel obvious. The most dangerous assumptions are the ones nobody challenges because they seem settled.

**Questions to ask:**

- What are we treating as a given that we have never actually verified?
- Strip the feature back to the core value it delivers. Is there a simpler way to deliver that same value?
- Who said users want this? What evidence exists beyond assumption?
- What would we build if we started from scratch today with everything we know now?
- Is the model we're operating in (marketplace, SaaS, consumer app) actually the right model, or is it just the one we started with?
- What would a competitor who ignored all our assumptions build?
- Are we solving the problem users have, or the problem we think they have?
- What would we have to believe for this decision to be wrong?

**What good output looks like:**

A reframe. Not just "this assumption is wrong" but "if that assumption is wrong, here is the alternative that follows from first principles."

---

### Lens 3 — The Expansionist
*Job: find the upside being missed*

This lens is optimistic and lateral. Its job is to identify value that already exists but hasn't been seen, and opportunities that follow from what is already being built.

**Questions to ask:**

- What does this feature enable that we have not talked about yet?
- What does the data we are collecting become at scale?
- Who else benefits from this that is not the primary user?
- What adjacent market opens up if this works?
- What is the 10× version of this feature — not the 1.1× version?
- What would a much larger company pay for that this creates as a byproduct?
- What is already built that is underutilised or underpositioned?
- Who is the unexpected user of this that we did not design for?

**What good output looks like:**

Two or three specific upsides with a clear reason why they are real and why they are being missed. Not a brainstorm list — prioritised insights with logic behind them.

---

### Lens 4 — The Outsider
*Job: know nothing about the industry, ask obvious questions*

This lens has no domain knowledge. It only knows how humans behave and how products work in general. Its value is in the questions that insiders stop asking because they feel settled.

**Questions to ask:**

- Why would someone use this instead of what they already use?
- What does the user have to give up to adopt this?
- What does the user do if this doesn't exist — and is that actually worse?
- What existing behaviour does this require the user to change?
- Who are the first 100 real users — not personas, actual people? Can you name them?
- What does success look like in a specific number at a specific date?
- What would make a normal person tell a friend about this?
- What is the one sentence that explains what this does and why someone should care?

**What good output looks like:**

Simple questions that have not been answered. The value is not in the outsider's answers — it is in exposing which questions the team has been avoiding.

---

### Lens 5 — The Executor
*Job: care only about what will actually get done*

This lens is impatient with strategy that does not connect to action. It only cares about what ships, when, and who does it.

**Questions to ask:**

- What is the smallest version of this that proves whether it works?
- What is the one thing that, if it worked, would make everything else easier?
- What is the critical path — and what is on it that should not be?
- What are we building that is not on the critical path?
- What does "done" mean for this — specifically, not vaguely?
- What breaks if this takes three times as long as planned?
- What is the one metric that tells us, without ambiguity, whether this is working?
- What decision are we about to make that will be hard to undo?

**What good output looks like:**

An ordered action list. Not a roadmap — a sequence. What comes first, what comes second, and why that order. Plus a single metric that defines success.

---

## Stage 2 — Peer Review

After all five lenses have produced their output independently, each lens reviews the others.

**How to run the review:**

Give each lens the outputs of the other four. The lens must:
1. Identify the single most valuable insight from each other lens
2. Identify the single weakest point in each other lens
3. Rank all four from most to least accurate and insightful

**Rules:**
- Identities are anonymous during review — no favouritism
- A lens cannot simply validate itself by attacking others
- The ranking must be justified, not just asserted

**What good peer review surfaces:**

- Where two lenses agree — that convergence is usually important
- Where two lenses directly contradict — that tension is worth resolving
- Which lens is producing the most novel insight vs. the most obvious

---

## Stage 3 — Chairman's Synthesis

One person (or one prompt) takes all five lens outputs and all peer review rankings and produces the final answer.

**The Chairman's job:**

- Find the convergences — where multiple lenses point to the same thing
- Resolve the contradictions — make a call where lenses disagree
- Produce a risk hierarchy — ranked by severity and timing
- Produce an action sequence — ordered by what must happen first
- Name the one metric — the single number that defines success

**What the Chairman is not:**

- Not a summary of all five lenses
- Not a compromise that satisfies all five
- Not a list of everything everyone said

The Chairman's output should be shorter than any individual lens. It should be decisive. It should make a call.

**Format:**

```
CONVERGENCES
What multiple lenses agreed on — and why it matters.

CONTRADICTIONS RESOLVED
Where lenses disagreed — and which position is correct and why.

RISK HIERARCHY
| Risk | Severity | When it hits |

ACTION SEQUENCE
1. [First thing] — why this comes first
2. [Second thing] — why this follows
3. [Third thing] — why this follows

THE ONE METRIC
[Single measurable outcome that defines success, with a target and a date]
```

---

## When to Use This Framework

**Use it for:**
- Deciding whether to build a new major feature
- Prioritising between two significant directions
- Evaluating a pivot or model change
- Assessing whether something is ready to scale
- Any decision that is hard to reverse

**Do not use it for:**
- Small bug fixes
- UI tweaks
- Routine feature extensions
- Anything that can be undone in a day

---

## Common Mistakes When Running This

**Running lenses sequentially and letting early ones influence later ones.**
Each lens must produce its output before seeing the others. Contamination kills the value of having multiple perspectives.

**Skipping the peer review stage.**
The review is where the most useful signal comes from. Individual lens outputs are starting points. The review is where they become insights.

**Letting the Executor dominate.**
The executor lens is seductive because it feels productive. But an executor without a constraint thinker ships the wrong thing efficiently. All five lenses must have equal standing in the individual stage.

**Treating the Chairman's synthesis as a summary.**
It is a decision. If the Chairman does not make a call, the framework has failed.

**Using this to justify a decision already made.**
If you already know what you want to do, running the framework will produce motivated reasoning. Use it before the decision is made, not after.
