/**
 * A provider's own profile sections (providers.profile_sections): Key
 * Information, FAQs, Aftercare, a Disclaimer and Custom sections, written on
 * Policies & Info. Each one shows as its own section under Additional
 * Information on the profile, in the fixed order below.
 *
 * The named kinds get a heading in each page style's own voice (see
 * PAGE_SECTION_TITLES and the tables beside it). A Custom section is headed
 * with the name the provider gives it instead, drawn in the same style
 * (owner, 2026-11-18: House Rules removed, Custom added). Everything here is
 * public: it's read by anyone browsing the profile, so it's for the
 * provider's own wording only, never private details.
 *
 * Pure, so the editor, the profile and the save all clean it the same way.
 */

export type TextSectionKind = 'keyInfo' | 'aftercare' | 'disclaimer';
export type OwnSectionKind = TextSectionKind | 'faq' | 'custom';

export interface FaqItem { question: string; answer: string }
/** A section the provider names themselves, e.g. "Parking". */
export interface CustomSection { title: string; body: string }

export interface OwnSections {
  keyInfo?: string;
  faq?: FaqItem[];
  aftercare?: string;
  custom?: CustomSection[];
  disclaimer?: string;
}

/** Profile order, and the order of the "+" chips on Policies & Info. */
export const OWN_SECTION_KINDS: readonly OwnSectionKind[] = ['keyInfo', 'faq', 'aftercare', 'disclaimer', 'custom'];
// Custom last, after the Disclaimer (owner, 2026-11-18).

export const OWN_SECTION_LABELS: Record<OwnSectionKind, string> = {
  keyInfo: 'Key Information',
  faq: 'FAQs',
  aftercare: 'Aftercare',
  custom: 'Custom',
  disclaimer: 'Disclaimer',
};

export const OWN_SECTION_LIMITS = {
  text: 1500,
  question: 150,
  answer: 600,
  faqItems: 10,
  customTitle: 40,
  customItems: 5,
} as const;

/** House Rules was a fixed section until 2026-11-18. Anything already written
 *  there is read as a Custom section of the same name, so nobody's words go
 *  missing, and saved back that way the next time they save. */
const LEGACY_HOUSE_RULES_TITLE = 'House Rules';

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * What's actually shown: unknown keys, wrong types and empty text dropped,
 * lengths capped, FAQs kept only with both a question and an answer.
 * Safe on anything read from the database.
 */
export function normalizeOwnSections(raw: unknown): OwnSections {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const out: OwnSections = {};
  for (const kind of OWN_SECTION_KINDS) {
    if (kind === 'faq') {
      const items = Array.isArray(source['faq']) ? source['faq'] : [];
      const faq = items
        .map((item): FaqItem => {
          const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
          return {
            question: cleanText(row['question'], OWN_SECTION_LIMITS.question),
            answer: cleanText(row['answer'], OWN_SECTION_LIMITS.answer),
          };
        })
        .filter(item => item.question && item.answer)
        .slice(0, OWN_SECTION_LIMITS.faqItems);
      if (faq.length > 0) out.faq = faq;
    } else if (kind === 'custom') {
      const items: unknown[] = Array.isArray(source['custom']) ? [...source['custom']] : [];
      if (typeof source['houseRules'] === 'string' && source['houseRules'].trim()) {
        items.unshift({ title: LEGACY_HOUSE_RULES_TITLE, body: source['houseRules'] });
      }
      const custom = items
        .map((item): CustomSection => {
          const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
          return {
            title: cleanText(row['title'], OWN_SECTION_LIMITS.customTitle),
            body: cleanText(row['body'], OWN_SECTION_LIMITS.text),
          };
        })
        .filter(item => item.title && item.body)
        .slice(0, OWN_SECTION_LIMITS.customItems);
      if (custom.length > 0) out.custom = custom;
    } else {
      const text = cleanText(source[kind], OWN_SECTION_LIMITS.text);
      if (text) out[kind] = text;
    }
  }
  return out;
}

/** The kinds that have something to show, in profile order. */
export function filledOwnSections(sections: OwnSections): OwnSectionKind[] {
  return OWN_SECTION_KINDS.filter(kind =>
    kind === 'faq' ? (sections.faq?.length ?? 0) > 0
      : kind === 'custom' ? (sections.custom?.length ?? 0) > 0
        : !!sections[kind]);
}

/** A question with no answer, or an answer with no question: the editor
 *  stops the save rather than quietly dropping what was typed. */
export function hasHalfFilledFaq(faq: readonly FaqItem[] | undefined): boolean {
  return (faq ?? []).some(item => !item.question.trim() !== !item.answer.trim());
}

/** A Custom section with a name but nothing written, or words but no name. */
export function hasHalfFilledCustom(custom: readonly CustomSection[] | undefined): boolean {
  return (custom ?? []).some(item => !item.title.trim() !== !item.body.trim());
}

/** Sections that carry a "Written by" line on the profile, so clients can see
 *  the wording is the provider's own and not CERVICED's (user decision,
 *  2026-11-18: Aftercare and Disclaimer are the provider's own words). */
export const ATTRIBUTED_SECTION_KINDS: readonly OwnSectionKind[] = ['aftercare', 'disclaimer'];

/** "Written by Glow Studio", or null for sections that don't carry one. */
export function ownSectionByline(kind: OwnSectionKind, providerName: string): string | null {
  const name = providerName.trim();
  if (!ATTRIBUTED_SECTION_KINDS.includes(kind)) return null;
  return name ? `Written by ${name}` : 'Written by the provider';
}

/** True when what would be shown has really changed, not just spacing. The
 *  provider re-agrees at the bottom of Policies & Info only then. */
export function ownSectionsChanged(draft: unknown, loaded: unknown): boolean {
  return JSON.stringify(normalizeOwnSections(draft)) !== JSON.stringify(normalizeOwnSections(loaded));
}
