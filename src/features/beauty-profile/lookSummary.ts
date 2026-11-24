// src/features/beauty-profile/lookSummary.ts
//
// The words on the landing's Your look card (owner, 2026-11-17: not one word).
// - title: two of their answers that describe the look, "Natural & dewy",
//   "Soft glam & glossy": their vibe and aesthetic first, then makeup finish,
//   then hair.
// - line: a sentence from the rest of their answers, "4C hair, almond BIAB
//   nails, wispy lashes and a dewy finish, for everyday and weddings."
// Both are null until there's something to say. Skin tone is never used.

import type { BeautyData } from '../../types/beautyProfile';

/** What a nail service is called in a sentence: "almond BIAB nails". */
const NAIL_SERVICE_WORD: Record<string, string> = {
  'Gel polish': 'gel',
  'BIAB / builder gel': 'BIAB',
  Acrylic: 'acrylic',
  'Gel extensions (Gel-X)': 'Gel-X',
  'Hard gel': 'hard gel',
  'Natural manicure': 'natural',
  'Press-ons': 'press-on',
  Polygel: 'polygel',
  'Dip powder': 'dip',
};

/** "4C", "curly", "3B": hair types read as they're said. */
function hairWord(type: string): string {
  return /^\d/.test(type) ? type : type.toLowerCase();
}

/** "a, b and c". */
function listOf(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function lookTitle(d: BeautyData): string | null {
  const candidates = [
    ...d.styleVibe,
    ...d.styleAesthetics,
    ...d.makeupFinish,
    ...d.hairType.map(hairWord),
  ];
  const picked: string[] = [];
  for (const word of candidates) {
    if (!picked.some(p => p.toLowerCase() === word.toLowerCase())) picked.push(word);
    if (picked.length === 2) break;
  }
  return picked.length ? picked.join(' & ') : null;
}

export function lookLine(d: BeautyData): string | null {
  const parts: string[] = [];
  if (d.hairType.length) parts.push(`${d.hairType.map(hairWord).join(' & ')} hair`);
  const shape = d.nailShape[0]?.toLowerCase();
  const service = d.nailService.map(s => NAIL_SERVICE_WORD[s]).find(Boolean);
  if (shape || service) parts.push(`${[shape, service].filter(Boolean).join(' ')} nails`);
  if (d.lashStyle[0]) parts.push(`${d.lashStyle[0].toLowerCase()} lashes`);
  if (d.makeupFinish[0]) parts.push(`a ${d.makeupFinish[0].toLowerCase()} finish`);
  if (parts.length === 0) return null;
  const occasions = d.styleOccasions.slice(0, 2).map(o => o.toLowerCase());
  const sentence = `${listOf(parts)}${occasions.length ? `, for ${listOf(occasions)}` : ''}.`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
