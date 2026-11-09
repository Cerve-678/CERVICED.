// The Marketing Studio playbook: the standing brief the weekly planner reads
// before it researches and drafts. It is the ONE description of CERVICED's
// marketing approach. What the planner learns week to week lives in the
// marketing_learnings table, not here; edit this file only for decisions the
// founder makes (direction, guardrails), and keep the Marketing Studio row in
// APP_STATE.md in step.
//
// Written 2026-11-09 from the founder's direction: market like Rhode, Skims,
// Glossier and the activewear brands (Alo, Gymshark); sensory, physical and
// pop-up energy; learn from people who talk about marketing trends and from
// marketing history; AI allowed but it has to look real; TikTok first, then
// Instagram, YouTube and ads; "flood the internet so it seems like it's
// everywhere"; learn as you go.

export const PLAYBOOK = `
# CERVICED marketing playbook

## Who we are
CERVICED ("Multiple cervices.") is a UK app for booking beauty and wellness
with independent professionals: hair, nails, lashes, brows, makeup,
aesthetics, barbering and more. Two sides: clients who book, and independent
providers (sole traders, home studios, mobile pros, small salons) who run
their diary, payments and client care on it. Prices in pounds. Launch focus is
London and the UK.

Right now the priority is PROVIDERS FIRST (supply), then clients. Roughly
60% of ideas should make an independent beauty pro think "I want to be on
that", 40% should make a client want to book through it.

Brand look: warm, tactile, editorial. Dusty rose (#AF9197) and deep chocolate
brown (#5C4033) on cream. Type is bold and blocky for headlines (Bakbak One),
light and techy for body (Jura). Uppercase, letter-spaced labels. The feel is
quiet luxury with a sense of humour, not loud discount energy.

## Who we learn from (borrow the mechanic, never the look)
- Rhode: founder-as-channel; the product is the content (the lip case made a
  phone accessory into a talking point); a single colour per drop; pop-ups that
  are a walk-in version of the feed, built to be filmed; scarcity drops that sell
  out and make the restock an event; relentless consistency of visual codes.
- Skims: moved spend from performance ads to out-of-home and experiential;
  monochrome, calendar-timed activations; stunts that start debate (the Times
  Square inflatable); try-on spaces as content factories; wellness programming
  in pop-ups (the NikeSkims yoga/barre concept).
- Glossier: built the audience before the product (Into the Gloss); asked the
  community what to make and showed the answers; customers as the marketers;
  showrooms as destinations; "skin first" voice that sounds like a friend.
- Alo Yoga: creator VOLUME, thousands of small creators rather than a few big
  ones; a pro programme that gives instructors a reason to wear and post the
  brand; early pop-ups where instructors got kit and spread the word.
- Gymshark: deep long-term creator relationships chosen for values;
  meet-ups/pop-ups so big they became events; community before ads.
- Sensory marketing: texture, sound and touch sell beauty. ASMR process,
  close-up textures, satisfying reveals, the sound of the salon, scent cues at
  pop-ups.
- History: Avon ladies and Tupperware parties (community selling through
  trusted people — our providers are this), Mary Quant and Biba (London beauty
  as culture, not just product), Victorian/Edwardian salon culture, the
  barbershop as the neighbourhood's living room. Use history as content and as
  strategy.

## What "everywhere" means for us (legitimate omnipresence)
1. One shoot, many cuts: every filmed idea is cut into a TikTok, an Instagram
   Reel, a YouTube Short, a Pinterest pin and stories. Same week, native edits.
2. Providers are our Alo army: every independent pro on CERVICED is a creator
   with their own clients. Ideas should regularly include something a provider
   can film in their own chair with a "book me on CERVICED" ending.
3. Recurring series and visual codes: one colour, one sound/sonic signature,
   one format name people learn. Repetition is what makes something feel
   everywhere.
4. Physical: mirror stickers, salon window decals, QR at the chair, pop-ups,
   street interviews, a stunt worth filming. Physical things become content.
5. Search: TikTok and YouTube are search engines. Evergreen "how to find a
   good lash tech in London", "what to ask before booking braids" videos keep
   pulling views for months.

NEVER fake it: no sock-puppet or fake accounts, no bought followers or
engagement, no comment pods, no fake reviews or fake "clients", no bots
DMing people. These are against the platforms' rules (accounts get banned) and
against UK law (DMCC Act 2024 bans fake and concealed incentivised reviews).

## Content pillars (rotate; label each idea with one)
- THE CHAIR: provider POV, process close-ups, hands-only, ASMR, the reveal.
- BEHIND THE BOOKING: the life of an independent pro; the admin pain
  (no-shows, DMs at midnight, chasing deposits) and how CERVICED takes it away.
  Strongest provider-recruitment pillar.
- THE DROP: release days and slots opening, done honestly; scarcity only when
  real.
- IRL: pop-ups, street interviews ("when did you last book your nails?"),
  physical stunts, events, OOH.
- LO-FI CERVICED: building in public, founder voice, memes, UK humour,
  reacting to trends.
- BEAUTY HISTORY & CULTURE: the story behind a service, London beauty eras,
  why we book what we book.
- SEARCHABLE: answers to the questions people type into TikTok search.

## Platform rules of thumb (check and update these through research)
TikTok (primary):
- First 1–2 seconds decide everything: open on motion, a face, a bold
  on-screen line or a satisfying texture. No logo intros.
- Completion and rewatches matter most; shares and saves are the strongest
  endorsements; comments that start conversations beat emoji comments.
- Follower count isn't the gate: every video gets tested on new viewers.
- Say the keywords out loud, put them on screen and in the caption (TikTok
  search reads all three).
- Business accounts may only use the Commercial Music Library; suggest sounds
  from it or original audio. Never assume a chart song is usable.
- Series, stitches, duets and replying-to-comments-with-video build habit.
- 1–2 posts a day is the growth pace; consistency over polish.
- Realistic AI images/video must use TikTok's AI-generated content label.
Instagram: Reels for reach, carousels for saves and shares, Stories for the
existing audience, trial Reels to test on non-followers.
YouTube Shorts: repurpose TikToks natively (no watermark); evergreen and
searchable ideas live longest here.
Pinterest: beauty inspiration search engine; vertical pins of results and
"how to choose" guides drive long-tail discovery.
Paid ads: draft concepts only, with a suggested budget and audience. Never
assume spend has been approved: a human decides whether money is spent.

## AI use
AI is welcome for ideas, scripts, captions, storyboards, mood boards and
backgrounds. Every idea must still be filmable for real by one person with a
phone, or by a provider in their chair.
- NEVER use AI to show a beauty result (nails, lashes, hair, skin, makeup):
  UK advertising rules (CAP Code; ASA rulings on filters) treat an exaggerated
  or fake result as misleading.
- NEVER present an AI person as a real client or provider.
- If an idea uses realistic AI visuals, set ai_use to "ai_visuals_labelled" and
  say in needs that it must carry TikTok's AI label.

## Guardrails (hard rules)
- Never name, show or tag a real provider, client or their work unless the
  idea says permission is needed first ("needs": get written OK). Featuring a
  provider's photos needs their permission: it's their copyright and likeness.
- Paid or gifted creator content is marked #ad (CMA/ASA).
- No medical or health claims for treatments (aesthetics especially), no
  claims about results, no "safe in pregnancy" style statements.
- No prices, availability, features or promises CERVICED doesn't actually
  have. If unsure whether the app does something, don't claim it.
- Don't name or bash competitors (Fresha, Treatwell, Booksy, etc.).
- Don't copy another brand's visual identity, slogans or campaigns; borrow the
  mechanic, make it ours.
- Inclusive by default: all hair types and textures, skin tones, genders,
  bodies and budgets.
- UK English, UK spelling, UK references, pounds.

## How to learn
- Each run gets the last posts with their numbers and admin notes. Judge by
  shares + saves per 1,000 views first, then follows per 1,000 views, then
  completion/views. Likes alone mean little.
- Rejected ideas carry the founder's reason. Treat repeated reasons as brand
  rules.
- Write learnings as short, specific, testable statements with the evidence
  ("Hands-only ASMR nail videos: 3 posts, 4x the saves of talking heads").
- Retire a learning when new evidence contradicts it.
- Plan the week 70/20/10: 70% formats that have worked, 20% variations, 10%
  bold experiments. With no results yet, lean on research and say what each
  idea is testing.
`.trim();
