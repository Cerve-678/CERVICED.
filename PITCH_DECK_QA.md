# CERVICED — Pitch Deck Q&A

Standard investor pitch-deck questions and answers for CERVICED. This is
communications/pitch material, not a technical doc — it doesn't describe
current app state (see `APP_STATE.md`) or roadmap (see `FUTURE_LOGIC.md`).
Written to be picked up and continued in a fresh conversation.

Tone: confident, plain, not flashy. The framing throughout is that booking
today is *decent enough to get by* — not broken — and CERVICED's pitch is
making the whole experience dramatically better, not fixing something
dysfunctional.

---

## What is it?

CERVICED is a two-sided marketplace connecting clients with independent
beauty and wellness providers in the UK. It's built as a shopping
experience — browse, add to cart, checkout — rather than a traditional
appointment-booking tool.

## What problem does it solve?

Booking a beauty or wellness provider today is fragmented. Most clients find
a provider through a social media link, then have to manually piece the
rest together themselves — working out what to book, retyping their details
for every new provider, and keeping track of policies on their own. It's
workable, but it's manual and repetitive at every step. CERVICED brings all
of that into one place.

## Why now?

This industry has grown almost entirely through social media discovery, but
the booking side hasn't kept pace — it's still built around basic calendars,
not around how people actually find providers today. That gap is the
opportunity.

## Who is it for?

Independent beauty and wellness providers who want better accessibility and
a stronger, more viable business presence than what they currently have —
and clients who want a simpler, more direct way to find and book them.

## What's the business model?

A commission on bookings made through the platform, standard for this kind
of two-sided marketplace, with room to add provider subscription tiers
later. Not finalized yet — the current focus is proving the core booking
experience works.

## What makes you different from Fresha, Treatwell, or booking via a social media link?

Those are calendars with a directory attached — a client still has to find
the provider, then work out with them what's actually being booked.
CERVICED is different in two concrete ways:

1. **The cart.** A client can add services from several different
   providers — or several services from the same provider — into a single
   cart and check out once. No back-and-forth per provider. Nothing else in
   this space works this way.
2. **Discovery leads to booking, not just browsing.** Clients scroll a
   visual feed of real provider work, and a real, priced service sits
   behind a meaningful portion of what they see — a genuine step past a
   directory or portfolio page. (Not every image in the feed is itself
   bookable yet — most are portfolio/inspiration photos that lead to a
   provider's profile rather than a specific service. The bookable-image
   share of the feed is something to grow, not a claim to overstate.)

## What stops a bigger competitor from just copying this?

Two-sided marketplaces get harder to compete with the more people use
them — once enough clients and providers are booking through CERVICED, both
sides have less reason to go elsewhere. The multi-provider cart is also a
real structural difference, not a surface feature: an existing scheduling
company would have to redesign their whole booking flow to copy it, not
just add a button.

## What stage is this at?

MVP. The core loop — visual discovery, multi-provider/multi-service cart,
checkout, and managing bookings (reschedule, cancel, rebook) in-app — is
built and working. Two things are intentionally still ahead of launch:
moving card payments onto a proper compliant payment processor, and
finishing the legal paperwork (terms, privacy policy, refund terms). Both
are known, scoped tasks, not open questions.

## What does success look like?

CERVICED becomes the first place both clients and providers go — the way
delivery apps replaced calling a restaurant directly.

---

## Open items / things to sharpen further

- The "discovery leads to booking" answer above already corrects an earlier
  overstated claim ("every image is bookable") — verified against
  `ExploreScreen.tsx` / `ImageDetailModal.tsx`: only `kind === 'service'`
  cards go straight to a specific bookable service; `kind === 'portfolio'`
  and `kind === 'provider'` cards route to "View Profile" instead. Worth
  deciding whether to state the actual bookable-image ratio once it's
  measured, or keep it qualitative as above.
- Business model (commission %, subscription tiers) is not finalized —
  flag if an investor conversation needs a specific number.
- No financials/traction numbers included here yet — add when available.
