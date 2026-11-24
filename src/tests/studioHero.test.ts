// The Studio hero's bar line and wordmark: what they do in caps with the
// joining words picked out for the script, and their name as "amara.".
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));

import { studioHeadline, studioWordmark } from '../features/providers/heroes/StudioHero';

describe('studioHeadline', () => {
  it('puts what they do in caps with a script "&"', () => {
    expect(studioHeadline('Lashes & brows')).toEqual([
      { text: 'LASHES', script: false },
      { text: '&', script: true },
      { text: 'BROWS', script: false },
    ]);
  });

  it('keeps a list together in caps', () => {
    expect(studioHeadline('Lashes, brows & nails')).toEqual([
      { text: 'LASHES, BROWS', script: false },
      { text: '&', script: true },
      { text: 'NAILS', script: false },
    ]);
  });

  it('says welcome when they have not said what they do', () => {
    expect(studioHeadline('')).toEqual([{ text: 'WELCOME', script: false }]);
  });
});

describe('studioWordmark', () => {
  it('lowercases their name and adds a full stop', () => {
    expect(studioWordmark('Imani Beauty')).toBe('imani beauty.');
  });

  it('keeps a full stop they already have', () => {
    expect(studioWordmark('Glow.')).toBe('glow.');
  });
});
