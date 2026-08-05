// Deterministic intent matching.
//
// Scores every capability against the message and returns a ranked list. This
// is the ONLY part of Becca an LLM replaces — it produces an `Understanding`,
// and the engine consumes nothing else. Everything downstream (entity
// resolution, capabilities, presentation) is model-agnostic.

import type { BeccaHat, EntityBag, Understanding } from "./types";
import { scoreToConfidence } from "./types";
import { capabilitiesFor } from "./registry";
import { containsPhrase } from "./entityResolver";

/**
 * Scores a capability's phrase list against the message.
 *
 * Longer phrase matches score higher than short ones, so "next appointment"
 * beats a bare "appointment". Matching is word-boundary aware (see
 * containsPhrase) — plain substring matching produced false hits like "tint"
 * inside "maintenance".
 */
function scorePhrases(message: string, phrases: string[]): number {
  const lower = message.toLowerCase();
  let best = 0;
  for (const phrase of phrases) {
    if (!containsPhrase(lower, phrase)) continue;
    // Normalise by phrase length: a 20-char match is a much stronger signal
    // than a 4-char one, but cap so one long phrase can't dominate outright.
    const strength = Math.min(0.6, 0.25 + phrase.length / 40);
    if (strength > best) best = strength;
  }
  return best;
}

/**
 * Entities that a capability declares it needs are evidence FOR that
 * capability when present, and evidence against when a required one is
 * missing. This is what makes "find gel nails under £40" outrank the generic
 * browse capability without needing a hand-written rule for that phrasing.
 */
function scoreEntities(
  entities: EntityBag,
  needs: { kind: string; required: boolean }[] | undefined,
): number {
  if (!needs || needs.length === 0) return 0;
  let score = 0;
  for (const need of needs) {
    const present = entities[need.kind as keyof EntityBag] != null;
    if (present) score += need.required ? 0.3 : 0.15;
    else if (need.required) score -= 0.35;
  }
  return score;
}

/** Builds the full Understanding for a message. */
export function understand(
  message: string,
  entities: EntityBag,
  hat: BeccaHat,
): Understanding {
  const ranked = capabilitiesFor(hat)
    // A capability's veto removes it from contention outright — it's for
    // modifiers that flip the intent ("edit my services" is not a request to
    // list them), which a score adjustment would only ever make close.
    .filter((c) => !c.excludeWhen?.test(message))
    .map((c) => ({
      capabilityId: c.id,
      score: scorePhrases(message, c.phrases) + scoreEntities(entities, c.needs),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const score = top?.score ?? 0;

  return {
    capabilityId: top?.capabilityId ?? null,
    entities,
    confidence: scoreToConfidence(score),
    score,
    alternatives: ranked.slice(1, 4),
    rawMessage: message,
  };
}
