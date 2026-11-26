/**
 * Whether a text box offers the keyboard's suggestions. Writing (policies,
 * notes, descriptions) gets suggestions, spell check and a capital at the start
 * of a sentence: without them, providers' copy came out full of typos (owner,
 * 2026-11-24). Emails, numbers, handles, links and stylised business names keep
 * them off, so autocorrect can't change what was meant.
 */
export type SuggestionKeyboard = 'default' | 'email-address' | 'phone-pad' | 'decimal-pad';

export interface SuggestionProps {
  autoCorrect: boolean;
  spellCheck: boolean;
  autoCapitalize: 'sentences' | 'none';
}

export function suggestionProps({ keyboardType, noSuggestions }: {
  keyboardType?: SuggestionKeyboard | undefined;
  noSuggestions?: boolean | undefined;
}): SuggestionProps {
  const on = !noSuggestions && (keyboardType ?? 'default') === 'default';
  return { autoCorrect: on, spellCheck: on, autoCapitalize: on ? 'sentences' : 'none' };
}
