// src/utils/beautyProfileTodo.ts
//
// What a client still has to do on their Beauty Profile — the one rule behind
// the red "!" on the Settings row and the "still to fill in" card inside
// Beauty Profile, so the two can never disagree.
//
// "Required" means exactly what email sign-up requires a client to answer
// (SignUpStep4Screen's handleContinue): hair type, skin type, skin concerns,
// style vibe, allergies and treatment history. Medical notes are optional
// there and stay optional here. Apple and Google sign-in skip those questions
// entirely, and skip the date of birth on SignUpStep3 too (the users row they
// get is created by createSocialProfileIfMissing with neither), so the date of
// birth is on the list as well.
//
// It goes by what the saved data is missing, never by how the account signed
// in: an email account that somehow lost an answer is nudged the same way, and
// the mark goes for good once everything is filled in.

import type { CategoryKey } from '../types/beautyProfile';

export type BeautyTodoField =
  | 'hairType' | 'skinType' | 'skinConcerns' | 'styleVibe' | 'allergies' | 'treatmentHistory';

export type BeautyTodoItem = BeautyTodoField | 'dob';

/** In sign-up order, so the list reads the way the questions were asked. */
export const REQUIRED_BEAUTY_FIELDS: readonly BeautyTodoField[] = [
  'hairType', 'skinType', 'skinConcerns', 'styleVibe', 'allergies', 'treatmentHistory',
] as const;

/** The Beauty Profile category whose editor holds each field. */
export const TODO_FIELD_CATEGORY: Record<BeautyTodoField, CategoryKey> = {
  hairType: 'hair',
  skinType: 'skin',
  skinConcerns: 'skin',
  styleVibe: 'general',
  allergies: 'health',
  treatmentHistory: 'hair',
};

/** An answer as stored: a single pick, a multi-pick list, or nothing. Skin
 *  type and style vibe are moving from single to multi pick, so every field
 *  accepts either shape — empty string, null, undefined and [] all mean
 *  unanswered. */
export type TodoAnswer = string | readonly string[] | null | undefined;

function isBlank(value: TodoAnswer): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  return value.every(v => v.trim().length === 0);
}

export interface TodoAccount {
  dob?: string | null | undefined;
  /** Undefined means the users row hasn't been read yet (the session-only
   *  fallback in AuthContext), so a blank dob says nothing about what's saved. */
  hasClientProfile?: boolean | undefined;
}

/**
 * Everything still to do, in display order. Each half only reports what it
 * can vouch for: a profile that hasn't loaded (null) contributes no beauty
 * items, and an account whose users row hasn't been read (hasClientProfile
 * undefined) contributes no date of birth, since the session-only fallback
 * has no saved dob to check — a wrong "!" is worse than a late one. An account
 * without a client hat has no beauty profile to finish.
 */
export function beautyProfileTodo(
  profile: Readonly<Record<BeautyTodoField, TodoAnswer>> | null,
  account: TodoAccount | null,
): BeautyTodoItem[] {
  if (account?.hasClientProfile === false) return [];
  const todo: BeautyTodoItem[] = profile
    ? REQUIRED_BEAUTY_FIELDS.filter(field => isBlank(profile[field]))
    : [];
  if (account && account.hasClientProfile !== undefined && isBlank(account.dob)) {
    todo.push('dob');
  }
  return todo;
}
