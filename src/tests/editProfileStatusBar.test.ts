// Edit Profile paints the provider's own theme behind the clock and battery,
// so their colour has to follow it. Pinned dark, they vanished on a dark
// theme; the preview's pinned white vanished on a pale hero.

import * as fs from 'fs';
import * as path from 'path';

const src = fs.readFileSync(
  path.join(__dirname, '..', 'screens', 'provider', 'InfoRegScreen.tsx'),
  'utf8',
);

describe('Edit Profile status bar colour', () => {
  it('follows the editor theme', () => {
    expect(src).toContain("const statusBarStyle = chromeTheme.isDark ? 'light-content' : 'dark-content';");
    expect(src).toContain('<FocusAwareStatusBar barStyle={statusBarStyle} />');
  });

  it('follows the hero in the preview', () => {
    expect(src).toContain("<FocusAwareStatusBar barStyle={heroIsDark ? 'light-content' : 'dark-content'} />");
  });

  it('is never pinned to one colour', () => {
    expect(src).not.toMatch(/FocusAwareStatusBar barStyle="(light|dark)-content"/);
  });
});
