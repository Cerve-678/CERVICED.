/**
 * A provider's own profile sections (providers.profile_sections): Key
 * Information, FAQs, Aftercare, House Rules and a Disclaimer, written on
 * Policies & Info. Each one shows as its own section under Additional
 * Information on the profile, in the fixed order below.
 *
 * A fixed set rather than free-titled sections, so every page style can give
 * each one a heading in its own voice (see PAGE_SECTION_TITLES and the tables
 * beside it). Everything here is public: it's read by anyone browsing the
 * profile, so it's for the provider's own wording only, never private details.
 *
 * Pure, so the editor, the profile and the save all clean it the same way.
 */

export type TextSectionKind = 'keyInfo' | 'aftercare' | 'houseRules' | 'disclaimer';
export type OwnSectionKind = TextSectionKind | 'faq';

export interface FaqItem { question: string; answer: string }

export interface OwnSections {
  keyInfo?: string;
  faq?: FaqItem[];
  aftercare?: string;
  houseRules?: string;
  disclaimer?: string;
}

/** Profile order, and the order of the "+" chips on Policies & Info. */
export const OWN_SECTION_KINDS: readonly OwnSectionKind[] = ['keyInfo', 'faq', 'aftercare', 'houseRules', 'disclaimer'];

export const OWN_SECTION_LABELS: Record<OwnSectionKind, string> = {
  keyInfo: 'Key Information',
  faq: 'FAQs',
  aftercare: 'Aftercare',
  houseRules: 'House Rules',
  disclaimer: 'Disclaimer',
};

export const OWN_SECTION_LIMITS = {
  text: 1500,
  question: 150,
  answer: 600,
  faqItems: 10,
} as const;

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
    } else {
      const text = cleanText(source[kind], OWN_SECTION_LIMITS.text);
      if (text) out[kind] = text;
    }
  }
  return out;
}

/** The kinds that have something to show, in profile order. */
export function filledOwnSections(sections: OwnSections): OwnSectionKind[] {
  return OWN_SECTION_KINDS.filter(kind => kind === 'faq' ? (sections.faq?.length ?? 0) > 0 : !!sections[kind]);
}

/** A question with no answer, or an answer with no question: the editor
 *  stops the save rather than quietly dropping what was typed. */
export function hasHalfFilledFaq(faq: readonly FaqItem[] | undefined): boolean {
  return (faq ?? []).some(item => !item.question.trim() !== !item.answer.trim());
}
