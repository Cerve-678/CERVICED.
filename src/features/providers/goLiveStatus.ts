/**
 * Go-live status — the single source of truth for "can clients find this
 * provider yet, and what's worth finishing before they do".
 *
 * This exists because the answer used to be written twice. ProviderHomeScreen
 * had the real one (schedule + at least one service + a *geocoded* address,
 * mirroring check_and_set_provider_live() exactly), while
 * ProviderMyProfileScreen had a softer "Profile Health 5/7" list that counted
 * a logo and an intro but had no schedule item at all. Two cards, two scores,
 * neither agreeing with the database — so a provider could be told they were
 * 5/7 "ready for clients" while the server still refused to publish them.
 *
 * As of 2026-09-03 the steps are two tiers, not one flat list:
 *  - BLOCKING (`schedule`, `services`, `address`, `policies`, `payment`,
 *    `logo`) mirror check_and_set_provider_live() exactly — until all six
 *    are true (and the DB's own `has_gone_live` agrees) clients genuinely
 *    cannot find or book this provider. `policies`/`payment`/`logo` moved
 *    into this tier the same day, at the user's explicit direction — they
 *    used to be recommended-only, falling back to sensible defaults, but
 *    the server itself was changed to require them too (see
 *    supabase/MIGRATION_OWNER.md, "go-live now requires policies + payment"
 *    / "go-live now also requires a logo"). Never add anything here that
 *    the server doesn't also gate on, or the checklist starts lying again.
 *  - RECOMMENDED (`profile`, plus `portfolio`/`terms` for callers that
 *    supply them) is real setup worth finishing but that the server does
 *    not require to publish — writing an About/intro text, adding
 *    portfolio photos, or writing Terms & Conditions doesn't affect
 *    whether clients can find or book this provider (T&Cs blocks Add to
 *    Cart client-side, a different gate entirely — see
 *    provider-terms-are-a-form-not-a-column in auto-memory).
 * Copy must never claim a recommended step blocks visibility — every
 * blocking step (not just schedule/services/address any more) gets "until
 * these are completed" language now. See buildGoLiveHeadline.
 *
 * The steps deliberately carry a `key` rather than a navigation target: the
 * two screens live on different stacks and each has to push within its own
 * (a cross-tab navigate lands the destination at a bare tab root, whose back
 * button then fires an unhandled GO_BACK). Labels and done-ness are shared;
 * where each tap goes is the caller's business.
 */
import {
  countProviderServices,
  getMyProviderProfile,
  getProviderAvailability,
  hasMyProviderGoLiveAddress,
} from '../../services/databaseService';
import { resolveDepositMode } from '../../utils/depositPolicy';
import type { DbProvider } from '../../types/database';

export interface GoLiveStatus {
  /** Blocking — mirrors check_and_set_provider_live() exactly. */
  scheduleSet: boolean;
  servicesSet: boolean;
  /** A saved address that actually geocoded. A street address with no
   *  latitude/longitude does NOT satisfy the server, so it must not tick
   *  here either. */
  addressSet: boolean;
  /** Recommended — the server never gates go-live on this one. Don't imply
   *  otherwise in copy. */
  profileCompleteSet: boolean;
  /** Blocking as of 2026-09-03 — the server now requires both before
   *  has_gone_live can be true. */
  policiesSet: boolean;
  paymentSet: boolean;
  /** Blocking as of 2026-09-03 — same change, same day. */
  brandingSet: boolean;
  /** providers.has_gone_live, straight from the database. The authority on
   *  whether clients can actually find this provider — never re-derive it
   *  from the steps below. */
  isLive: boolean;
  /** Recommended, Profile-Health-only. Optional and left `undefined` by
   *  ProviderHomeScreen's fetch (it never renders them — its checklist
   *  filters on `blocking`, which these never are — so there's no reason to
   *  make its per-focus fetch do the extra reads). buildGoLiveSteps only
   *  emits a step for these when the field is actually present. */
  portfolioSet?: boolean;
  termsSet?: boolean;
}

export type GoLiveStepKey =
  | 'profile' | 'schedule' | 'services' | 'address'
  | 'policies' | 'payment' | 'logo' | 'portfolio' | 'terms';

export interface GoLiveStep {
  key: GoLiveStepKey;
  label: string;
  done: boolean;
  /** True for every step — `profile` is `required: true` in the "the
   *  checklist won't consider itself finished without this" sense, not in
   *  the "clients can't book you" sense — use `blocking`, not `required`,
   *  to tell those apart. */
  required: boolean;
  /** True for every step except `profile` — the six the server itself
   *  gates has_gone_live on, as of 2026-09-03. Copy may only claim "clients
   *  can't find/book you" for steps where this is true. */
  blocking: boolean;
}

export function buildGoLiveSteps(status: GoLiveStatus): GoLiveStep[] {
  const steps: GoLiveStep[] = [
    {
      key: 'profile',
      // Was "Complete your profile" — genuinely misleading, since
      // profileCompleteSet only checks the About/intro text (see
      // deriveRecommendedGoLiveFields below), not anything else about the
      // profile. A provider who'd just saved that one field read this as the
      // WHOLE profile being done while services/address/schedule were still
      // outstanding.
      label: 'Write your business introduction',
      done: status.profileCompleteSet,
      required: true,
      blocking: false,
    },
    {
      key: 'schedule',
      label: 'Set your weekly schedule',
      done: status.scheduleSet,
      required: true,
      blocking: true,
    },
    {
      key: 'services',
      label: 'Add at least one service',
      done: status.servicesSet,
      required: true,
      blocking: true,
    },
    {
      key: 'address',
      label: 'Add your business address',
      done: status.addressSet,
      required: true,
      blocking: true,
    },
    {
      key: 'policies',
      label: 'Set your booking policies',
      done: status.policiesSet,
      required: true,
      blocking: true,
    },
    {
      key: 'payment',
      label: 'Set your deposit & payment options',
      done: status.paymentSet,
      required: true,
      blocking: true,
    },
    {
      key: 'logo',
      label: 'Add your logo',
      done: status.brandingSet,
      required: true,
      blocking: true,
    },
  ];
  // Recommended, Profile-Health-only — see the `portfolioSet`/`termsSet`
  // doc comment on GoLiveStatus for why these are conditional rather than
  // always present.
  if (status.portfolioSet !== undefined) {
    steps.push({
      key: 'portfolio',
      label: 'Add portfolio photos',
      done: status.portfolioSet,
      required: true,
      blocking: false,
    });
  }
  if (status.termsSet !== undefined) {
    steps.push({
      key: 'terms',
      label: 'Set your Terms & Conditions',
      done: status.termsSet,
      required: true,
      blocking: false,
    });
  }
  return steps;
}

export type GoLiveTone =
  /** Published and fully set up — nothing recommended is outstanding either. */
  | 'live'
  /** Published, but a recommended (non-blocking) step is still outstanding. */
  | 'liveWithExtras'
  /** A blocking step still outstanding. */
  | 'blocked'
  /** Every blocking step is ticked but the database still hasn't published
   *  them. In practice that always means the address never geocoded. */
  | 'stalled';

export interface GoLiveHeadline {
  tone: GoLiveTone;
  title: string;
  /** The one thing worth saying under the title, or null when the step list
   *  already says it. */
  detail: string | null;
}

export function buildGoLiveHeadline(status: GoLiveStatus): GoLiveHeadline {
  const steps = buildGoLiveSteps(status);
  const blockingOutstanding = steps.filter(step => step.blocking && !step.done);
  // Required-but-not-blocking: profile only, as of 2026-09-03. The server
  // doesn't gate on this one, so copy must never claim it affects
  // visibility.
  const recommendedOutstanding = steps.filter(
    step => step.required && !step.blocking && !step.done,
  );

  if (status.isLive) {
    if (recommendedOutstanding.length === 0) {
      return { tone: 'live', title: 'Live — clients can find you', detail: null };
    }
    return {
      tone: 'liveWithExtras',
      title: 'Live — a few things left to finish',
      detail: `Clients can already find and book you. ${recommendedOutstanding.length} more recommended step${recommendedOutstanding.length === 1 ? '' : 's'} below.`,
    };
  }

  if (blockingOutstanding.length === 0) {
    return {
      tone: 'stalled',
      title: 'Almost live',
      // Used to name the address specifically ("couldn't confirm your
      // address on the map") — accurate back when address was the only
      // step prone to this client/server drift. Now six steps are blocking,
      // any of them could be the one that hasn't re-synced yet, so the copy
      // stays generic rather than pointing at a field that usually isn't
      // the actual cause any more.
      detail:
        "Everything looks filled in, but we haven't confirmed it with the server yet. " +
        "Try re-saving in Business Details and we'll publish you.",
    };
  }

  return {
    tone: 'blocked',
    title: `Not live yet — ${blockingOutstanding.length} step${blockingOutstanding.length === 1 ? '' : 's'} left`,
    // The schedule is the hard blocker and the least obvious one, so it gets
    // said out loud rather than left to a tick box.
    detail: status.scheduleSet
      ? "You won't appear to clients or be bookable until these are completed."
      : "Clients can't see any time slots or book you until your schedule is set.",
  };
}

/** Three fields derived straight off a provider row — no extra reads
 *  needed, so every caller that already has the row (fetchGoLiveStatus,
 *  ProviderHomeScreen's own focus fetch) can compute these for free instead
 *  of duplicating the definitions. Despite the name, only
 *  `profileCompleteSet` is actually recommended (non-blocking) any more —
 *  `policiesSet`/`paymentSet` moved to the blocking tier 2026-09-03; kept
 *  here regardless since they're still cheap to derive from the same row. */
export function deriveRecommendedGoLiveFields(profile: DbProvider): {
  profileCompleteSet: boolean;
  policiesSet: boolean;
  paymentSet: boolean;
} {
  return {
    profileCompleteSet: !!profile.about_text?.trim(),
    // Presence of a saved cancellation-notice key is what distinguishes
    // "provider opened Policies and saved" from "never touched" — the RPCs
    // that read booking_policies fall back to a default either way, but the
    // checklist should only tick once the provider has actually chosen.
    policiesSet: profile.booking_policies?.cancelNotice != null,
    paymentSet: resolveDepositMode(profile.booking_policies) !== null,
  };
}

/**
 * Read the calling provider's live status in one pass.
 *
 * Pass `knownProfile` when the caller already holds their own provider row —
 * it saves an auth lookup plus a second read of the row they just fetched.
 * Omit it and this resolves the caller's own row itself. There is no
 * "someone else's provider" form on purpose: this reads an owner-only
 * private-details table, so the only id it should ever run against is the
 * caller's own.
 *
 * Returns null when the caller has no provider row at all (a client-only
 * account, or a provider profile that was never created) — callers show their
 * own empty state rather than an all-false checklist that would read as
 * "you've done nothing" to someone who has no profile to have done it in.
 *
 * Throws if any underlying read fails, per the databaseService contract —
 * a failed read must not be presented as "not live".
 */
export async function fetchGoLiveStatus(
  knownProfile?: DbProvider | null,
): Promise<GoLiveStatus | null> {
  const profile = knownProfile ?? (await getMyProviderProfile());
  if (!profile) return null;

  // Three independent reads — one round trip, not three in sequence. The
  // address check takes the id we already have so it doesn't re-resolve the
  // same provider row from the auth session a second time.
  const [availability, serviceCount, addressSet] = await Promise.all([
    getProviderAvailability(profile.id),
    countProviderServices(profile.id),
    hasMyProviderGoLiveAddress(profile.id),
  ]);

  return {
    scheduleSet: availability.some(day => !day.is_closed),
    servicesSet: serviceCount > 0,
    addressSet,
    ...deriveRecommendedGoLiveFields(profile),
    brandingSet: !!profile.logo_url,
    isLive: !!profile.has_gone_live,
  };
}
