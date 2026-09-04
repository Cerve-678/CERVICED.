/**
 * Deposit mode — the single source of truth for reading a provider's deposit
 * choice out of `providers.booking_policies`.
 *
 * There are exactly three client-facing states, and until 2026-08-20 the
 * provider UI could only produce two of them. `booking_policies` stored a
 * boolean pair (`depositRequired` + `depositOnly`) that PoliciesScreen wrote
 * in lockstep, so "deposit optional" — both buttons in the booking sheet —
 * was a state the client could render but no provider could ever choose.
 *
 * `depositMode` replaces that pair. The pair is still written alongside it
 * (see PaymentsScreen) and still read here as a fallback, because rows saved
 * before the change only have the booleans.
 *
 * Until 2026-09-03, a provider with no saved deposit setting at all was
 * quoted to clients as a fabricated 20%-both-options deposit they never
 * chose. Every caller of `resolveDepositMode` now treats `null` as "no
 * deposit offered" (full price only) instead of inventing one.
 */

export type DepositMode = 'full_only' | 'client_choice' | 'deposit_required';

export interface StoredDepositPolicy {
  depositMode?: unknown;
  depositRequired?: unknown;
  depositOnly?: unknown;
}

const MODES: DepositMode[] = ['full_only', 'client_choice', 'deposit_required'];

function isDepositMode(v: unknown): v is DepositMode {
  return typeof v === 'string' && (MODES as string[]).includes(v);
}

/**
 * Resolve the provider's deposit mode.
 *
 * Returns `null` when the provider has never saved a deposit setting at all —
 * deliberately distinct from 'full_only', because callers treat "not
 * configured" differently from "explicitly no deposit". The client mapper
 * keeps its historical 20%-both-options default for the null case rather than
 * silently changing what live profiles offer.
 */
export function resolveDepositMode(policies: StoredDepositPolicy | null | undefined): DepositMode | null {
  if (!policies) return null;
  if (isDepositMode(policies.depositMode)) return policies.depositMode;
  // Legacy boolean pair. depositRequired === false is an explicit "no
  // deposit"; undefined means the provider never answered.
  if (policies.depositRequired === false) return 'full_only';
  if (policies.depositOnly === true || policies.depositRequired === true) return 'deposit_required';
  return null;
}

/** The provider-editor counterpart: what the radio group should start on.
 *  Unconfigured falls back to 'full_only' rather than null, matching what
 *  clients are actually quoted for those rows — so opening Payments and
 *  pressing Save doesn't silently switch on a deposit the provider never
 *  chose. */
export function resolveEditorDepositMode(policies: StoredDepositPolicy | null | undefined): DepositMode {
  return resolveDepositMode(policies) ?? 'full_only';
}
