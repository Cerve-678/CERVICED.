// The Studio hero's headline and wordmark: their name in caps with the
// joining words picked out for the script, and what they do as "lashes.".
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));

import { studioHeadline, studioWordmark } from '../features/providers/heroes/StudioHero';

describe('studioHeadline', () => {
  it('puts their name in caps', () => {
    expect(studioHeadline('Amara Beauty')).toEqual([{ text: 'AMARA BEAUTY', script: false }]);
  });

  it('draws the joining words in their name in script', () => {
    expect(studioHeadline('Hair by Amara')).toEqual([
      { text: 'HAIR', script: false },
      { text: 'by', script: true },
      { text: 'AMARA', script: false },
    ]);
    expect(studioHeadline('Lash & Brow Bar')).toEqual([
      { text: 'LASH', script: false },
      { text: '&', script: true },
      { text: 'BROW BAR', script: false },
    ]);
  });
});

describe('studioWordmark', () => {
  it('lowercases what they do and adds a full stop', () => {
    expect(studioWordmark('Lashes & brows')).toBe('lashes & brows.');
  });

  it('keeps a full stop already there', () => {
    expect(studioWordmark('Hair.')).toBe('hair.');
  });

  it('says welcome when they have not said what they do', () => {
    expect(studioWordmark('')).toBe('welcome.');
  });
});
