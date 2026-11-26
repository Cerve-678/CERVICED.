import { slotsPillText } from '../utils/slotsRowText';

describe('slotsPillText', () => {
  it('names the release day for a provider who has one', () => {
    expect(slotsPillText(20)).toBe('New slots drop on the 20th at 9am');
    expect(slotsPillText(20, '19:00')).toBe('New slots drop on the 20th at 7pm');
    expect(slotsPillText(1, '00:00')).toBe('New slots drop on the 1st at midnight');
  });

  it('says "Stay updated" for a provider without a release day', () => {
    expect(slotsPillText(null)).toBe('Stay updated');
  });

  it('ordinalises the awkward days correctly', () => {
    expect(slotsPillText(1)).toBe('New slots drop on the 1st at 9am');
    expect(slotsPillText(2)).toBe('New slots drop on the 2nd at 9am');
    expect(slotsPillText(3)).toBe('New slots drop on the 3rd at 9am');
    expect(slotsPillText(11)).toBe('New slots drop on the 11th at 9am');
    expect(slotsPillText(21)).toBe('New slots drop on the 21st at 9am');
  });
});
