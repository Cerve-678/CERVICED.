// What live providers' descriptions of similar services tend to mention, so a
// provider writing their own can be told "others often mention: aftercare".
// It learns topics, never wording: another provider's description is their own
// copy, and is never offered to anyone else.
import { normalizeTerm, tokenize } from '../../utils/fuzzyMatch';

export type LiveServiceDescription = { name: string; description: string; providerId: string };

const TOPICS: { label: string; test: RegExp }[] = [
  { label: 'whether hair is included', test: /\bhair (is |are )?(included|provided|supplied)|\bincludes? (the )?hair\b|\bbring (your )?(own )?hair\b/ },
  { label: 'a wash', test: /\bwash(ed|es|ing)?\b/ },
  { label: 'a consultation', test: /\bconsult(ation)?s?\b/ },
  { label: 'a patch test', test: /\bpatch test/ },
  { label: 'aftercare', test: /\baftercare\b|\bafter care\b/ },
  { label: 'removal', test: /\bremoval\b|\bsoak ?off\b|\btake ?down\b/ },
  { label: 'length', test: /\b(length|lengths|mid back|waist|shoulder length|bum length)\b/ },
  { label: 'how long it lasts', test: /\blasts?\b|\blasting\b|\bup to \d+ weeks\b/ },
  { label: 'infills or top-ups', test: /\binfills?\b|\brefills?\b|\btop ?ups?\b/ },
  { label: 'numbing', test: /\bnumb(ing)?\b/ },
  { label: 'what to bring or how to arrive', test: /\bbring\b|\barrive\b|\bcome with\b/ },
  { label: 'the design or style options', test: /\bdesigns?\b|\bnail art\b|\bstyles? (of|you)\b/ },
  { label: 'skin or nail prep', test: /\bprep(ped|aration)?\b|\bcleanse\b/ },
  { label: 'who it suits', test: /\bsuit(s|able)?\b|\bideal for\b|\bperfect for\b/ },
];

// Words too general to say two services are alike.
const GENERIC = new Set([
  'full', 'set', 'service', 'appointment', 'and', 'with', 'the', 'new', 'treatment', 'session',
  'hair', 'nails', 'nail', 'lash', 'lashes', 'brow', 'brows', 'makeup', 'small', 'medium', 'large', 'short', 'long',
]);
const MIN_PROVIDERS = 2;
const MAX_TOPICS = 3;

const meaningful = (text: string) => tokenize(text).filter(w => w.length >= 3 && !GENERIC.has(w) && !/^\d/.test(w));

/** Topics at least two other providers mention for services like this one, that
 *  this description doesn't cover yet, most mentioned first. */
export function learnDescriptionTopics(
  rows: readonly LiveServiceDescription[],
  serviceName: string,
  currentDescription: string,
  ownProviderId?: string | null,
): string[] {
  const nameWords = meaningful(serviceName);
  if (nameWords.length === 0) return [];
  const own = normalizeTerm(currentDescription);
  const providersByTopic = new Map<string, Set<string>>();

  for (const row of rows) {
    if (ownProviderId && row.providerId === ownProviderId) continue;
    const theirs = meaningful(row.name);
    if (!nameWords.some(w => theirs.includes(w))) continue;
    const text = normalizeTerm(row.description);
    for (const topic of TOPICS) {
      if (!topic.test.test(text)) continue;
      const set = providersByTopic.get(topic.label) ?? new Set<string>();
      set.add(row.providerId);
      providersByTopic.set(topic.label, set);
    }
  }

  return TOPICS
    .filter(t => (providersByTopic.get(t.label)?.size ?? 0) >= MIN_PROVIDERS && !t.test.test(own))
    .sort((a, b) => providersByTopic.get(b.label)!.size - providersByTopic.get(a.label)!.size)
    .slice(0, MAX_TOPICS)
    .map(t => t.label);
}
