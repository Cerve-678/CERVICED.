import { slotsPillText } from '../utils/slotsRowText';

describe('slotsPillText', () => {
  it('names the release day for a provider who has one', () => {
    expect(slotsPillText(20)).toBe('New slots drop on the 20th');
  });

  it('says "Stay tuned" for a provider without a release day', () => {
    expect(slotsPillText(null)).toBe('Stay tuned');
  });

  it('ordinalises the awkward days correctly', () => {
    expect(slotsPillText(1)).toBe('New slots drop on the 1st');
    expect(slotsPillText(2)).toBe('New slots drop on the 2nd');
    expect(slotsPillText(3)).toBe('New slots drop on the 3rd');
    expect(slotsPillText(11)).toBe('New slots drop on the 11th');
    expect(slotsPillText(21)).toBe('New slots drop on the 21st');
  });
});
