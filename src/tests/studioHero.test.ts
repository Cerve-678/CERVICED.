// The Studio hero's headline and wordmark: what they do in caps with the
// joining words picked out for the script, and their name as "name.".
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));

import { studioHeadline, studioWordmark } from '../features/providers/heroes/StudioHero';

describe('studioHeadline', () => {
  it('joins two things they do with a script "&"', () => {
    expect(studioHeadline('LASHES · BROWS', 'Amara')).toEqual([
      { text: 'LASHES', script: false },
      { text: '&', script: true },
      { text: 'BROWS', script: false },
    ]);
  });

  it('lists three with commas and an "&" before the last', () => {
    expect(studioHeadline('Lashes · Brows · Nails', 'Amara')).toEqual([
      { text: 'LASHES, BROWS', script: false },
      { text: '&', script: true },
      { text: 'NAILS', script: false },
    ]);
  });

  it('falls back to their name, with its joining words in script', () => {
    expect(studioHeadline('', 'Hair by Amara')).toEqual([
      { text: 'HAIR', script: false },
      { text: 'by', script: true },
      { text: 'AMARA', script: false },
    ]);
  });
});

describe('studioWordmark', () => {
  it('lowercases the name and adds a full stop', () => {
    expect(studioWordmark('Imani Beauty')).toBe('imani beauty.');
  });

  it('keeps a full stop they already have', () => {
    expect(studioWordmark('Glow.')).toBe('glow.');
  });
});
