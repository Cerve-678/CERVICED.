import { readFileSync } from 'fs';
import { join } from 'path';

const screen = readFileSync(join(__dirname, '..', 'screens', 'client', 'ProviderProfileScreen.tsx'), 'utf8');

describe("the client's service card", () => {
  it('keeps findability picks for Search, off the card', () => {
    expect(screen).not.toContain('Suitable Skin Tones');
    expect(screen).not.toContain('skinTonesSuitable');
  });

  it('decides See more from the lines the description takes, not its length', () => {
    expect(screen).not.toMatch(/description\?\.length \?\? 0\) > \d+/);
    expect(screen).toContain('e.nativeEvent.lines.length > 2');
  });
});
