// src/features/beauty-profile/pickList.ts
//
// Multi-pick Beauty Profile answers. Skin type and style vibe became lists on
// 2026-11-08 (20261108240000_beauty_profile_skin_type_and_style_vibe_multi_pick.sql);
// hair type, scalp, nail length and shape, lash style, brow style and
// condition, and the four makeup answers followed on 2026-11-09
// (20261110120000_beauty_profile_more_multi_pick.sql). Skin tone and lash
// status stay single. The app treats every one of these as string[]. A value
// can still arrive in the old one-answer shape: a row read before a migration
// is applied, or sign-up metadata saved by an older build and turned into a
// row at email verification. Every reader goes through toPickList so the rest
// of the app only ever sees a list.

/**
 * One answer list from whatever the database or sign-up metadata holds:
 * a text[] (current), a single string (old rows), a JSON array written as text,
 * or nothing. Blank entries and repeats are dropped; order is kept.
 */
export function toPickList(value: unknown): string[] {
  let items: unknown[];
  if (Array.isArray(value)) {
    items = value;
  } else if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return [];
    items = s.startsWith('[') ? parseJsonArray(s) ?? [s] : [s];
  } else {
    return [];
  }
  const out: string[] = [];
  for (const item of items) {
    if (typeof item !== 'string') continue;
    const v = item.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/**
 * What to write to the text[] column: the list, or NULL when nothing is
 * picked, so NULL keeps meaning "not answered" as it did for the old text
 * column (and for scripts/audit-live-account-hats.mjs's IS NOT NULL check).
 */
export function toPickColumn(values: unknown): string[] | null {
  const list = toPickList(values);
  return list.length ? list : null;
}

/** "Oily, Sensitive" — how a list reads on one line (provider view, Becca). */
export function formatPickList(values: readonly string[]): string {
  return values.join(', ');
}

function parseJsonArray(s: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
