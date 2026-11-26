// Database access: booking status changes and deposit policies.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import { supabase } from "../../lib/supabase";
import type { DbBooking } from "../../types/database";
import { depositNoteForClients, resolveDepositMode } from "../../utils/depositPolicy";

// Client bookings are made only by prepare_checkout + a Stripe payment
// (create-payment-intent, finalize-payment-intent); provider-side manual
// bookings go through provider_create_manual_booking / insertDirectBooking.
// The old hold/claim route, which let the app book without a payment, was
// removed with its RPCs' grants (20261126120000).

/** Update booking status (provider-side confirm/start/complete/no-show — cancel
 *  goes through cancelOwnBooking/providerCancelOwnBooking instead). Routed
 *  through a SECURITY DEFINER RPC that can only touch the status column — see
 *  fix_bookings_provider_update_bypass.sql. */
export async function updateBookingStatus(
  bookingId: string,
  status: DbBooking["status"],
): Promise<void> {
  const { error } = await supabase.rpc("provider_update_booking_status", {
    p_booking_id: bookingId,
    p_status: status,
  });

  if (error) throw error;
}

/** Cancel a booking as its client owner. Routed through cancel_own_booking()
 *  so the provider's cancellation_notice_hours is enforced server-side —
 *  a plain .update({status:'cancelled'}) has no notice-window check at all
 *  (see supabase/booking_rules_server_enforcement.sql). */
export async function cancelOwnBooking(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_own_booking", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
}

/** Reverse of the provider's no_show action: lets a CLIENT mark a booking as
 *  the PROVIDER not having shown up. Routed through client_mark_provider_
 *  no_show() (SECURITY DEFINER RPC) which enforces the same guardrails
 *  philosophy as provider_update_booking_status()'s no_show branch —
 *  same calendar day, appointment start time passed, terminal-state check,
 *  no active reschedule request — server-side. See
 *  supabase/fix_provider_no_show_status.sql. The provider is notified by
 *  handle_booking_status_change() (DB trigger owns this, no app-side
 *  duplicate insert). */
export async function markProviderNoShow(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc("client_mark_provider_no_show", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
}

/**
 * Dispute a no-show recorded against you — in either direction. A client
 * disputes a 'no_show'; a provider disputes a 'provider_no_show'.
 *
 * dispute_no_show() (SECURITY DEFINER, migration 20260827154500) derives WHO
 * is disputing from auth.uid() against the booking and refuses anyone who
 * isn't the accused party, so the hat this is called from is not what makes
 * it safe. It also enforces the dispute window, refuses a second dispute, and
 * notifies the other party — no app-side notification insert.
 *
 * This records a disagreement. It does NOT reverse the status and nothing in
 * the app adjudicates it; what it does change is that the no-show stops on
 * its way to becoming a permanent reliability count (see
 * settle_no_show_reliability). Callers should file the support ticket too —
 * that is the only route by which a human ever sees it.
 */
export async function disputeNoShow(
  bookingId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc("dispute_no_show", {
    p_booking_id: bookingId,
    p_reason: reason,
  });
  if (error) throw error;
}

/** Cancel a booking as its owning provider. Routed through
 *  provider_cancel_own_booking() to verify ownership server-side (no notice
 *  window — providers can cancel any time, same as before). */
export async function providerCancelOwnBooking(
  bookingId: string,
): Promise<void> {
  const { error } = await supabase.rpc("provider_cancel_own_booking", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
}

/** Confirm/start/complete/no-show ALL of the calling provider's own sibling
 *  rows in a group booking at once (see fix_group_booking_atomic_actions.sql)
 *  — a client's group of services from one provider should never show mixed
 *  status. The RPC is all-or-nothing: if even one sibling can't legally make
 *  this transition (wrong current status, or before the appointment start
 *  time for no_show/completed), it throws and NOTHING changes — callers
 *  should show the thrown message directly, it already names which booking
 *  blocked it. Returns every updated booking's id so the caller can update
 *  local state for all of them, not just the one that was open. Never call
 *  this for a booking with no group_booking_id — use updateBookingStatus. */
export async function updateGroupBookingStatus(
  groupBookingId: string,
  status: DbBooking["status"],
): Promise<{ bookingId: string; newStatus: string }[]> {
  const { data, error } = await supabase.rpc(
    "provider_update_group_booking_status",
    {
      p_group_booking_id: groupBookingId,
      p_status: status,
    },
  );
  if (error) throw error;
  return (data ?? []).map(
    (row: { booking_id: string; new_status: string }) => ({
      bookingId: row.booking_id,
      newStatus: row.new_status,
    }),
  );
}

/** Cancel ALL of the calling provider's own sibling rows in a group booking
 *  at once. Same all-or-nothing semantics as updateGroupBookingStatus — see
 *  fix_group_booking_atomic_actions.sql. Never call this for a booking with
 *  no group_booking_id — use providerCancelOwnBooking. */
export async function providerCancelGroupBooking(
  groupBookingId: string,
): Promise<string[]> {
  const { data, error } = await supabase.rpc("provider_cancel_group_booking", {
    p_group_booking_id: groupBookingId,
  });
  if (error) throw error;
  return (data ?? []).map((row: { booking_id: string }) => row.booking_id);
}

// ─────────────────────────────────────────────────────────
// DEPOSIT POLICIES
// ─────────────────────────────────────────────────────────

export interface ProviderDepositPolicy {
  depositType: "percentage" | "fixed";
  depositAmount: number;
  depositAvailable: boolean;
  /** Provider requires the deposit — client has no "pay in full" choice.
   *  Only meaningful when depositAvailable is true. */
  depositOnly: boolean;
  /** The provider's own "Note to clients" about their deposit, shown in the
   *  booking sheet. Only set while they take a deposit. */
  depositNote?: string | null;
}

type ProviderCheckoutMetadata = {
  depositPolicies: Record<string, ProviderDepositPolicy>;
  mobileProviderNames: Set<string>;
};

/** One cart-side provider to resolve: `key` is whatever the caller groups
 *  cart items by (the display name at add-to-cart time) and is also what
 *  the result maps are keyed by — `providerId`, when the item carries one,
 *  is what actually gets looked up. */
export interface ProviderCheckoutMetadataQuery {
  key: string;
  providerId?: string | undefined;
}

/**
 * Cart-facing provider metadata in one query rather than one request per
 * concern. Looks providers up by `providerId` when the caller has one —
 * `display_name` is a mutable field a provider can legitimately rename
 * (see providers_display_name_cooldown), so a cart item added before a
 * rename would exact-match nothing under the new name and read as
 * "no longer available" for a provider who never stopped taking bookings.
 * Falls back to a `display_name` match only for legacy cart items that
 * predate `providerId` being carried on the cart item at all. Either way,
 * a resolved provider is written back under the caller's own `key`, not
 * whatever name is currently live, so callers never need to know which
 * path resolved it.
 */
export async function getProviderCheckoutMetadata(
  queries: ProviderCheckoutMetadataQuery[],
): Promise<ProviderCheckoutMetadata> {
  if (queries.length === 0) {
    return { depositPolicies: {}, mobileProviderNames: new Set() };
  }

  const byId = queries.filter((q): q is ProviderCheckoutMetadataQuery & { providerId: string } => Boolean(q.providerId));
  const byName = queries.filter(q => !q.providerId);

  const idList = [...new Set(byId.map(q => q.providerId))].slice(0, 50);
  const nameList = [...new Set(byName.map(q => q.key))].slice(0, 50);

  const selectCols = "id, display_name, booking_policies, business_type";
  const [idResult, nameResult] = await Promise.all([
    idList.length > 0
      ? supabase.from("providers").select(selectCols).eq("has_gone_live", true).eq("is_active", true).in("id", idList)
      : Promise.resolve({ data: [], error: null }),
    nameList.length > 0
      ? supabase.from("providers").select(selectCols).eq("has_gone_live", true).eq("is_active", true).in("display_name", nameList)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (idResult.error) throw idResult.error;
  if (nameResult.error) throw nameResult.error;

  type ProviderRow = { id: string; display_name: string; booking_policies: unknown; business_type: string | null };
  const rowsById = new Map<string, ProviderRow>((idResult.data ?? []).map((p: ProviderRow) => [p.id, p]));
  const rowsByName = new Map<string, ProviderRow>((nameResult.data ?? []).map((p: ProviderRow) => [p.display_name, p]));

  const depositPolicies: Record<string, ProviderDepositPolicy> = {};
  const mobileProviderNames = new Set<string>();
  for (const q of queries) {
    const provider = q.providerId ? rowsById.get(q.providerId) : rowsByName.get(q.key);
    if (!provider) continue;

    if (provider.business_type === "mobile") {
      mobileProviderNames.add(q.key);
    }
    const policies = provider.booking_policies as {
      depositMode?: string;
      depositRequired?: boolean;
      depositOnly?: boolean;
      depositType?: string;
      depositAmount?: string;
    } | null;
    const mode = resolveDepositMode(policies);
    if (mode === "full_only") {
      depositPolicies[q.key] = {
        depositType: "percentage",
        depositAmount: 0,
        depositAvailable: false,
        depositOnly: false,
      };
    } else if (mode && policies?.depositAmount) {
      const amount = Number(policies.depositAmount);
      depositPolicies[q.key] = {
        depositType: policies.depositType === "fixed" ? "fixed" : "percentage",
        depositAmount: amount > 0 ? amount : 20,
        depositAvailable: true,
        depositOnly: mode === "deposit_required",
      };
    } else {
      depositPolicies[q.key] = {
        depositType: "percentage",
        depositAmount: 0,
        depositAvailable: false,
        depositOnly: false,
      };
    }
  }
  return { depositPolicies, mobileProviderNames };
}

/** Fetch deposit policies for multiple providers by display name (batch). */
export async function getProviderDepositPoliciesByDisplayNames(
  displayNames: string[],
): Promise<Record<string, ProviderDepositPolicy>> {
  if (displayNames.length === 0) return {};

  const { data, error } = await supabase
    .from("providers")
    .select("display_name, booking_policies")
    .in("display_name", displayNames)
    .eq("is_claimed", true); // never an imported directory listing

  if (error) throw error;
  if (!data) return {};

  const defaultPolicy: ProviderDepositPolicy = {
    depositType: "percentage",
    depositAmount: 0,
    depositAvailable: false,
    depositOnly: false,
  };
  const result: Record<string, ProviderDepositPolicy> = {};

  for (const p of data) {
    const policies = p.booking_policies as {
      depositMode?: string;
      depositRequired?: boolean;
      depositOnly?: boolean;
      depositType?: string;
      depositAmount?: string;
      depositNote?: string;
    } | null;

    // Shared with PaymentsScreen so the provider editor and the client
    // booking sheet can never disagree about what a stored blob means.
    const mode = resolveDepositMode(policies);

    // Provider explicitly turned deposits OFF → client pays in full, no
    // deposit option in the cart. (Previously this switch was ignored and
    // any leftover amount kept the deposit option alive.)
    if (mode === "full_only") {
      result[p.display_name] = {
        depositType: "percentage",
        depositAmount: 0,
        depositAvailable: false,
        depositOnly: false,
      };
    } else if (mode && policies?.depositAmount) {
      const depositType: "percentage" | "fixed" =
        policies.depositType === "fixed" ? "fixed" : "percentage";
      const depositAmount = Number(policies.depositAmount);
      result[p.display_name] = {
        depositType,
        depositAmount: depositAmount > 0 ? depositAmount : 20,
        depositAvailable: true,
        // 'client_choice' is the state the booking sheet could always render
        // but no provider control could ever produce: both buttons, shown
        // side by side, because the provider chose to offer both.
        depositOnly: mode === "deposit_required",
        depositNote: depositNoteForClients(policies),
      };
    } else {
      // No deposit policy saved at all: no deposit offered.
      result[p.display_name] = { ...defaultPolicy };
    }
  }
  return result;
}
