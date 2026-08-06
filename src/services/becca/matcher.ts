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

/**
 * Words that carry no intent on their own — they can surround a bare answer
 * ("actually, make it hair") without making it a real question.
 */
const BARE_FILLER = new Set([
  "a", "an", "the", "some", "any", "my", "i", "id", "ill", "im",
  "actually", "make", "it", "just", "please", "want", "need", "do", "does",
  "and", "or", "but", "then", "instead", "maybe", "ok", "okay", "yeah",
  "under", "over", "around", "about", "between", "less", "more", "than",
  "up", "to", "from", "at", "for", "with", "of", "in", "on",
]);

/**
 * A message that is essentially just an entity, with no verb.
 *
 * "nails", "hair", "under £40" — an answer to a question Becca asked, or a
 * refinement of what's being discussed. There's no phrase to match, so
 * without this they fall through to whatever happens to score first. The
 * natural reading is "search for this", so they're routed there directly.
 */
function bareEntityCapability(
  message: string,
  entities: EntityBag,
  hat: BeccaHat,
): string | null {
  if (hat !== "client") return null;

  // Strip the entity's own words and any filler ("actually make it hair").
  // What's LEFT is the test: a bare answer has nothing meaningful remaining,
  // whereas "who's free this week" still has a real question in it, and must
  // keep matching on its phrases rather than being treated as a bare entity.
  const residue = message
    .toLowerCase()
    .replace(/[£$\d.,?!]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !BARE_FILLER.has(w));

  // Every remaining word must be part of the entity itself (e.g. "gel nails").
  const entityWords = new Set(
    [entities.service?.sourceText, entities.money?.sourceText]
      .filter((t): t is string => !!t)
      .flatMap((t) => t.toLowerCase().split(/\s+/)),
  );
  if (residue.some((w) => !entityWords.has(w))) return null;

  // A service is required, not just any entity. Money alone ("under £40") is
  // only meaningful as a refinement of an existing search — and by the time
  // it reaches here the engine has already carried the previous turn's
  // service in, so a genuine refinement does have one.
  if (!entities.service) return null;

  return "discover.find";
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

  // A bare entity ("nails", "under £40") outranks a weak phrase match: it's
  // an answer or a refinement, and the intent is unambiguous even though
  // nothing in the sentence looks like a request.
  const bare = bareEntityCapability(message, entities, hat);
  const top = bare
    ? { capabilityId: bare, score: 0.6 }
    : ranked[0];
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
