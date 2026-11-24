// Deterministic intent matching.
//
// Scores every capability against the message and returns a ranked list. This
// is the ONLY part of Becca an LLM replaces — it produces an `Understanding`,
// and the engine consumes nothing else. Everything downstream (entity
// resolution, capabilities, presentation) is model-agnostic.

import type { BeccaHat, EntityBag, Understanding } from "./types";
import { CONFIDENCE_THRESHOLDS, scoreToConfidence } from "./types";
import { ALL_CAPABILITIES, capabilitiesFor } from "./registry";
import { containsPhrase } from "./entityResolver";
import { isProviderNavigationAsk } from "./providerNavigation";
import { CATEGORY_LABELS, SERVICE_CATALOGUE } from "./serviceCatalogue";
import { isTypoOf } from "../../utils/fuzzyMatch";

/**
 * Real words that sit one slip away from a word Becca's phrases use. Typed
 * on their own they mean what they say, so they are never "corrected".
 * Becca's own vocabulary (every phrase word, every service word) is already
 * protected the same way; this list is for ordinary English around it.
 * Add to it whenever a test or a real ask shows a word being misread.
 */
const NOT_TYPOS: readonly string[] = [
  // Health-adjacent first: misreading these would answer the wrong question
  // about something that matters to the person asking.
  "cancer", "poignancy", "patient", "pain", "sick", "skin", "scar", "rash",
  // Services and beauty words one slip from an app word.
  "massage", "salmon", "saloon", "waxing", "tinting",
  // Everyday English one slip from a word in Becca's phrases. Found by
  // scanning the system dictionary against her vocabulary, then keeping the
  // words people actually type in a chat.
  "ably", "axle", "abort", "accent", "alter", "amply", "apple", "aptly",
  "approve", "approval", "arena", "aria", "abound", "aground",
  "bank", "bark", "black", "buck", "balanced", "bake", "bare", "bash",
  "baked", "bean", "beef", "beer", "bees", "beet", "beast", "beat", "belt",
  "bent", "bust", "boom", "boot", "booted", "being", "brink", "bury", "bush",
  "calf", "calm", "cell", "chancel", "cage", "cake", "came", "cane", "cape",
  "case", "cave", "core", "cure", "carve", "cord", "carat", "chart",
  "chance", "charger", "cheat", "cheep", "cheek", "chick", "chuck", "cite",
  "chose", "clone", "closer", "closet", "clove", "coma", "comb", "comet",
  "cone", "cope", "cove", "cast", "coast", "coat", "colt", "cosy", "cold",
  "county", "court", "connection", "correction", "companion", "compassion",
  "dare", "data", "daze", "dairy", "daisy", "dose", "dogs", "ding", "dying",
  "dawn", "drown", "drip", "emit", "exit", "even", "expansive", "excessive",
  "extensive", "fall", "fell", "file", "film", "fend", "fine", "fond", "fund",
  "fist", "fallow", "fellow", "farm", "firm", "foam", "ford", "fork", "fort",
  "forum", "flee", "fret", "frog", "font", "frost", "fuel", "folly",
  "gave", "given", "glad", "gleam", "glum", "gold", "goods", "goof", "grout",
  "hail", "hairy", "heir", "hard", "head", "hear", "heart", "herd", "hell",
  "heap", "helm", "hemp", "hole", "hone", "hope", "hose", "hour", "joint",
  "jest", "keen", "knew", "knob", "knot", "known", "lash", "least", "lest",
  "lost", "lust", "lace", "lake", "lame", "lane", "later", "lathe", "lease",
  "lent", "lift", "loft", "life", "lime", "line", "live", "lint", "lisp",
  "loyal", "lone", "lung", "lock", "loom", "loop", "loot", "made", "male",
  "mate", "maze", "mane", "mend", "mass", "mess", "mist", "moss", "misled",
  "misted", "monkey", "moth", "mouth", "mare", "mere", "mire", "mode", "mole",
  "mope", "mast", "moist", "must", "movie", "mulch", "munch", "mush", "neat",
  "needy", "newt", "nest", "noted", "novice", "olden", "order", "omen",
  "oven", "pail", "pain", "pair", "plaid", "parity", "parry", "part",
  "pasty", "patty", "pace", "pact", "park", "peck", "pick", "pant", "pass",
  "paste", "pest", "post", "parch", "path", "pitch", "paving", "praying",
  "police", "poplar", "peep", "prey", "prop", "pride", "prime", "prince",
  "prize", "prick", "pricks", "posh", "plush", "proportion", "quack",
  "quirk", "quilt", "quit", "quite", "rage", "rang", "ranger", "race",
  "rake", "rare", "rave", "raze", "react", "roach", "ready", "real", "ream",
  "reap", "rear", "reed", "road", "rely", "replay", "resort", "retort",
  "remainder", "rent", "rust", "rouge", "sage", "sake", "sane", "salt",
  "scale", "sole", "stale", "shame", "salve", "shave", "slave", "saving",
  "slaying", "swaying", "seed", "seek", "seem", "seep", "seer", "seven",
  "sewn", "sheen", "sand", "spend", "scent", "seat", "spent", "serve",
  "shaft", "shirt", "swift", "sift", "shoe", "shop", "shot", "shown", "snow",
  "stow", "shin", "skid", "skim", "skip", "skit", "spin", "slat", "slit",
  "slop", "spot", "slaw", "slew", "sofa", "sore", "spoon", "swoon", "short",
  "sport", "spade", "spare", "spice", "serial", "social", "spatial",
  "species", "stare", "start", "state", "statue", "step", "stomp", "stoop",
  "slap", "snap", "soap", "swab", "swamp", "swan", "sway", "taken", "tale",
  "tame", "tape", "tall", "teal", "till", "toll", "text", "tent", "than",
  "thaw", "theirs", "then", "theme", "thee", "these", "three", "thin",
  "thine", "thong", "thank", "thick", "thus", "tide", "tile", "tire", "tome",
  "toddy", "tonal", "torch", "tough", "tern", "torn", "turf", "typo", "tyre",
  "wait", "wand", "wane", "wart", "went", "weak", "weed", "weep", "wall",
  "weld", "welt", "wheat", "whet", "whey", "wren", "were", "wild", "wile",
  "wilt", "widow", "wish", "witch", "width", "ward", "wood", "wore", "world",
  "worm", "worn", "wound", "white", "wrote", "yeah", "yearn",
];

/** Lower case, curly apostrophes straightened, split into words. */
function wordsOf(text: string): string[] {
  return text.toLowerCase().replace(/[’‘]/g, "'").match(/[a-z0-9']+/g) ?? [];
}

let knownWords: Set<string> | null = null;

/**
 * Every word Becca already knows, across both hats. A typed word in this set
 * is that word, not a typo of another one: "brows" (the service) must never
 * read as "browse", and "refunds" never as "refund" reached through a slip.
 * Search follows the same rule server-side (known words are never corrected).
 */
function isKnownWord(word: string): boolean {
  if (!knownWords) {
    const known = new Set<string>(NOT_TYPOS);
    for (const capability of ALL_CAPABILITIES) {
      for (const phrase of capability.phrases) for (const w of wordsOf(phrase)) known.add(w);
    }
    for (const entries of Object.values(SERVICE_CATALOGUE)) {
      for (const entry of entries) {
        for (const text of [entry.specific ?? "", ...entry.keywords]) {
          for (const w of wordsOf(text)) known.add(w);
        }
      }
    }
    for (const label of Object.values(CATEGORY_LABELS)) for (const w of wordsOf(label)) known.add(w);
    knownWords = known;
  }
  return knownWords.has(word);
}

const phraseWordCache = new Map<string, string[]>();

function phraseWords(phrase: string): string[] {
  let words = phraseWordCache.get(phrase);
  if (!words) {
    words = wordsOf(phrase);
    phraseWordCache.set(phrase, words);
  }
  return words;
}

/**
 * Does the phrase appear in the message, allowing keyboard slips? Same words,
 * same order, side by side, as the exact match. The only difference is that
 * a typed word may be a typo of the phrase's word, provided it isn't a real
 * word in its own right. Gapped phrases ("my * appointment") stay exact.
 */
function containsPhraseWithTypos(messageWords: string[], phrase: string): boolean {
  const words = phraseWords(phrase);
  if (words.length === 0 || words.length > messageWords.length) return false;
  if (!words.some((w) => w.length > 3)) return false; // nothing long enough to slip
  for (let start = 0; start + words.length <= messageWords.length; start++) {
    let slipped = false;
    let fits = true;
    for (let k = 0; k < words.length; k++) {
      const typed = messageWords[start + k]!;
      const wanted = words[k]!;
      if (typed === wanted) continue;
      if (isKnownWord(typed) || !isTypoOf(typed, wanted)) {
        fits = false;
        break;
      }
      slipped = true;
    }
    if (fits && slipped) return true;
  }
  return false;
}

/**
 * A phrase matched through a typo counts for less than the same phrase typed
 * right, and never reaches "high" on its own: Becca reads the slip, but an
 * exact match elsewhere still wins, and the reading isn't treated as certain.
 */
const TYPO_DISCOUNT = 0.8;
const TYPO_CEILING = CONFIDENCE_THRESHOLDS.high - 0.01;

/**
 * Scores a capability's phrase list against the message.
 *
 * Longer phrase matches score higher than short ones, so "next appointment"
 * beats a bare "appointment". Matching is word-boundary aware (see
 * containsPhrase) — plain substring matching produced false hits like "tint"
 * inside "maintenance".
 */
function scorePhrases(message: string, messageWords: string[], phrases: string[]): number {
  const lower = message.toLowerCase();
  let best = 0;
  for (const phrase of phrases) {
    const gapped = phrase.includes("*");
    const exact = gapped ? containsGappedPhrase(lower, phrase) : containsPhrase(lower, phrase);
    const slipped = !exact && !gapped && containsPhraseWithTypos(messageWords, phrase);
    if (!exact && !slipped) continue;
    // Normalise by phrase length: a 20-char match is a much stronger signal
    // than a 4-char one, but cap so one long phrase can't dominate outright.
    // A gap counts for nothing — only the words actually matched do.
    const length = gapped ? phrase.replace(/\s*\*\s*/g, " ").trim().length : phrase.length;
    const full = Math.min(0.6, 0.25 + length / 40);
    const strength = exact ? full : Math.min(TYPO_CEILING, full * TYPO_DISCOUNT);
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

  // An explicit request to FIND or CHANGE a provider control is different
  // from a question about its current value ("what are my hours?").
  if (hat === "provider" && isProviderNavigationAsk(message)) {
    return {
      capabilityId: "pv.app_navigation",
      entities,
      confidence: "high",
      score: 1,
      alternatives: [],
      rawMessage: message,
    };
  }

  const messageWords = wordsOf(message);
  const ranked = capabilitiesFor(hat)
    // A capability's veto removes it from contention outright — it's for
    // modifiers that flip the intent ("edit my services" is not a request to
    // list them), which a score adjustment would only ever make close.
    .filter((c) => !c.excludeWhen?.test(message))
    .map((c) => ({
      capabilityId: c.id,
      score: scorePhrases(message, messageWords, c.phrases) + scoreEntities(entities, c.needs),
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
