// Becca's miss log: which questions she didn't understand, and what the
// person meant in the end.
//
// A missed question is held until the person's next move tells us how it
// ended, then recorded ONCE:
//   - they tapped one of her "did you mean" options      → resolvedBy "chip"
//   - they asked again in other words and she got it      → resolvedBy "reworded"
//   - they missed again, started a new chat, switched hat
//     or left Becca                                       → unresolved
// The first two pair the person's own words with the answer they wanted,
// which is what the weekly review (/review-becca-misses) turns into new
// phrases. Storage, the 90-day limit and the rule that a question mentioning
// health is never kept all live server-side in record_becca_miss
// (supabase/migrations/20261110170000_becca_misses.sql), not here.
//
// Pure: no network, no React, so the rules are tested directly.

import type { BeccaHat, ChatMessage } from "./types";

export interface PendingMiss {
  hat: BeccaHat;
  /** What the person typed, verbatim. */
  message: string;
  /** The "did you mean" options Becca offered, as the text each one sends. */
  offered: string[];
}

export interface MissRecord {
  hat: BeccaHat;
  message: string;
  resolvedCapabilityId: string | null;
  resolvedBy: "chip" | "reworded" | null;
}

export interface BeccaTurn {
  hat: BeccaHat;
  /** What was sent to Becca this turn. */
  sent: string;
  /** Sent by tapping one of Becca's chips rather than typed. */
  fromChip: boolean;
  reply: Pick<ChatMessage, "understood" | "suggestions">;
}

/** The fallback's "did you mean" chips are the ones whose ids start "alt-" (engine.ts buildFallback). */
function offeredOptions(reply: BeccaTurn["reply"]): string[] {
  return (reply.suggestions ?? [])
    .filter((s) => s.id.startsWith("alt-") && s.data?.message)
    .map((s) => s.data!.message!);
}

/** Records a held miss as unresolved (new chat, hat switch, leaving Becca). */
export function abandonMiss(pending: PendingMiss | null): MissRecord[] {
  return pending
    ? [{ hat: pending.hat, message: pending.message, resolvedCapabilityId: null, resolvedBy: null }]
    : [];
}

/**
 * Folds one turn into the miss log. Returns the miss now being held (if any)
 * and anything ready to record.
 */
export function trackTurn(
  pending: PendingMiss | null,
  turn: BeccaTurn,
): { pending: PendingMiss | null; records: MissRecord[] } {
  // A miss from the other hat can't be resolved by this one.
  if (pending && pending.hat !== turn.hat) {
    const next = trackTurn(null, turn);
    return { pending: next.pending, records: [...abandonMiss(pending), ...next.records] };
  }

  const understood = turn.reply.understood;
  const sent = turn.sent.trim();

  // Not an attempt to understand (small talk, a confirmation, "which one?"),
  // or nothing was typed: the held miss is still open.
  if (!understood || !sent) return { pending, records: [] };

  if (understood.capabilityId === null) {
    // A chip that itself missed is Becca's own wording, not the person's,
    // so there is nothing new to hold. A typed miss replaces the old one,
    // which ended unanswered.
    if (turn.fromChip) return { pending, records: [] };
    return {
      pending: { hat: turn.hat, message: sent, offered: offeredOptions(turn.reply) },
      records: abandonMiss(pending),
    };
  }

  if (!pending) return { pending: null, records: [] };

  if (turn.fromChip) {
    // Only one of the options offered for THIS miss answers it. Any other
    // chip ("Something else", a starter) is the person still looking.
    if (!pending.offered.includes(sent)) return { pending, records: [] };
    return {
      pending: null,
      records: [{ hat: pending.hat, message: pending.message, resolvedCapabilityId: understood.capabilityId, resolvedBy: "chip" }],
    };
  }

  return {
    pending: null,
    records: [{ hat: pending.hat, message: pending.message, resolvedCapabilityId: understood.capabilityId, resolvedBy: "reworded" }],
  };
}
