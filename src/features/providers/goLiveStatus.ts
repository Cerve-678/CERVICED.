/**
 * Go-live status — the single source of truth for "can clients find this
 * provider yet, and if not, what's left to do".
 *
 * This exists because the answer used to be written twice. ProviderHomeScreen
 * had the real one (schedule + at least one service + a *geocoded* address,
 * mirroring check_and_set_provider_live() exactly), while
 * ProviderMyProfileScreen had a softer "Profile Health 5/7" list that counted
 * a logo and an intro but had no schedule item at all. Two cards, two scores,
 * neither agreeing with the database — so a provider could be told they were
 * 5/7 "ready for clients" while the server still refused to publish them.
 *
 * The gate is THREE things, not four: check_and_set_provider_live() never
 * looks at logo_url, so `brandingSet` is reported as a recommendation and
 * never counted as a blocker. See auto-memory go-live-gate-is-three-things.
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
import type { DbProvider } from '../../types/database';

export interface GoLiveStatus {
  scheduleSet: boolean;
  servicesSet: boolean;
  /** A saved address that actually geocoded. A street address with no
   *  latitude/longitude does NOT satisfy the server, so it must not tick
   *  here either. */
  addressSet: boolean;
  /** Recommended only — never gates go-live. */
  brandingSet: boolean;
  /** providers.has_gone_live, straight from the database. The authority on
   *  whether clients can actually find this provider — never re-derive it
   *  from the steps below. */
  isLive: boolean;
}

export type GoLiveStepKey = 'schedule' | 'services' | 'address' | 'logo';

export interface GoLiveStep {
  key: GoLiveStepKey;
  label: string;
  done: boolean;
  /** False for the logo, which is a recommendation rather than a blocker. */
  required: boolean;
}

export function buildGoLiveSteps(status: GoLiveStatus): GoLiveStep[] {
  return [
    {
      key: 'schedule',
      label: 'Set your weekly schedule',
      done: status.scheduleSet,
      required: true,
    },
    {
      key: 'services',
      label: 'Add at least one service',
      done: status.servicesSet,
      required: true,
    },
    {
      key: 'address',
      label: 'Add your business address',
      done: status.addressSet,
      required: true,
    },
    {
      key: 'logo',
      label: 'Add your logo (optional)',
      done: status.brandingSet,
      required: false,
    },
  ];
}

export type GoLiveTone =
  /** Published — clients can find and book them. */
  | 'live'
  /** Real steps still outstanding. */
  | 'blocked'
  /** Every gated step is ticked but the database still hasn't published
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
  if (status.isLive) {
    return {
      tone: 'live',
      title: 'Live — clients can find you',
      detail: null,
    };
  }

  const outstanding = buildGoLiveSteps(status).filter(
    step => step.required && !step.done,
  );

  if (outstanding.length === 0) {
    return {
      tone: 'stalled',
      title: 'Almost live',
      detail:
        "Everything's filled in, but we couldn't confirm your address on the map yet. " +
        "Re-save it in Business Details and we'll publish you.",
    };
  }

  return {
    tone: 'blocked',
    title: `Not live yet — ${outstanding.length} step${outstanding.length === 1 ? '' : 's'} left`,
    // The schedule is the hard blocker and the least obvious one, so it gets
    // said out loud rather than left to a tick box.
    detail: status.scheduleSet
      ? null
      : "Clients can't see any time slots or book you until your schedule is set.",
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
    brandingSet: !!profile.logo_url,
    isLive: !!profile.has_gone_live,
  };
}
