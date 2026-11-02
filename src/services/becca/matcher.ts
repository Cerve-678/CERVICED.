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
    const gapped = phrase.includes("*");
    if (gapped ? !containsGappedPhrase(lower, phrase) : !containsPhrase(lower, phrase)) continue;
    // Normalise by phrase length: a 20-char match is a much stronger signal
    // than a 4-char one, but cap so one long phrase can't dominate outright.
    // A gap counts for nothing — only the words actually matched do.
    const length = gapped ? phrase.replace(/\s*\*\s*/g, " ").trim().length : phrase.length;
    const strength = Math.min(0.6, 0.25 + length / 40);
    if (strength > best) best = strength;
  }
  return best;
}

/**
 * "tell me about my * appointment": the words either side of each `*`, in
 * order, with up to five words between them. Matching is otherwise
 * contiguous, and the words people put in the middle are exactly the ones
 * that matter — "my GEL MANICURE appointment", "when is LOLA STUDIO free" —
 * so without a gap a phrase misses the very asks that name what they mean.
 */
function containsGappedPhrase(lower: string, phrase: string): boolean {
  const parts = phrase.split("*").map((part) => part.trim()).filter(Boolean);
  const escape = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const pattern = parts.map(escape).join("(?:\\s+\\S+){1,5}\\s+");
  return new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`, "i").test(lower);
}

/** Lower case, curly quotes straightened, trailing punctuation dropped. */
function plainAsk(message: string): string {
  return message.toLowerCase().replace(/[’‘]/g, "'").replace(/[\s.?!]+$/g, "").trim();
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
  // Becca's own words for a capability are its "did you mean" cards (see the
  // engine's fallback): tapping one sends its description, and that must come
  // back to the capability it names however its phrases happen to score.
  const asked = plainAsk(message);
  const named = capabilitiesFor(hat).find((c) => plainAsk(c.describe) === asked);
  if (named) {
    return {
      capabilityId: named.id,
      entities,
      confidence: "high",
      score: 1,
      alternatives: [],
      rawMessage: message,
    };
  }

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
