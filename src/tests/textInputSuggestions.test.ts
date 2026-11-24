import { suggestionProps } from '../utils/textInputSuggestions';

// Providers write policies, notes and descriptions in these boxes. With the
// keyboard's suggestions off they came out full of typos.
describe('suggestionProps', () => {
  it('turns suggestions, spell check and sentence capitals on for writing', () => {
    expect(suggestionProps({})).toEqual({ autoCorrect: true, spellCheck: true, autoCapitalize: 'sentences' });
    expect(suggestionProps({ keyboardType: 'default' })).toEqual({ autoCorrect: true, spellCheck: true, autoCapitalize: 'sentences' });
  });

  it('keeps them off for emails and numbers', () => {
    for (const keyboardType of ['email-address', 'phone-pad', 'decimal-pad'] as const) {
      expect(suggestionProps({ keyboardType })).toEqual({ autoCorrect: false, spellCheck: false, autoCapitalize: 'none' });
    }
  });

  it('keeps them off for handles, links and stylised names', () => {
    expect(suggestionProps({ noSuggestions: true })).toEqual({ autoCorrect: false, spellCheck: false, autoCapitalize: 'none' });
  });
});
