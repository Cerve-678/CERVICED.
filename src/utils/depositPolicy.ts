/**
 * Deposit mode — the single source of truth for reading a provider's deposit
 * choice out of `providers.booking_policies`.
 *
 * There are exactly three client-facing states, and until 2026-08-20 the
 * provider UI could only produce two of them. `booking_policies` stored a
 * boolean pair (`depositRequired` + `depositOnly`) that PoliciesScreen wrote
 * in lockstep, so "deposit optional" — both buttons in the booking sheet —
 * was a state the client could render but no provider could ever choose. It
 * only ever appeared for providers with no saved policy at all, via a
 * fabricated 20% default.
 *
 * `depositMode` replaces that pair. The pair is still written alongside it
 * (see PaymentsScreen) and still read here as a fallback, because rows saved
 * before the change only have the booleans.
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
 * Returns `null` when the provider has never saved a deposit setting at all.
 * Clients are offered no deposit in that case, the same as 'full_only'.
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
 *  Unconfigured starts on 'full_only' because that's what clients get, so
 *  opening Payments and pressing Save doesn't turn a deposit on. */
export function resolveEditorDepositMode(policies: StoredDepositPolicy | null | undefined): DepositMode {
  return resolveDepositMode(policies) ?? 'full_only';
}
