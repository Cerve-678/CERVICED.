import fs from 'fs';
import path from 'path';

/**
 * Tapping the logo on My Profile (user, 2026-11-18): the profile appears in
 * place, not sliding in from the side, with no buttons in the header, and a
 * swipe closes it.
 */
const root = path.join(__dirname, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8');
const navigator = read('src', 'navigation', 'provider', 'tabs', 'ProviderServicesNavigator.tsx');
const myProfile = read('src', 'screens', 'provider', 'ProviderMyProfileScreen.tsx');
const profile = read('src', 'screens', 'client', 'ProviderProfileScreen.tsx');

describe('My Profile logo opens the profile as a plain preview', () => {
  it('opens without a sideways slide, and a swipe anywhere closes it', () => {
    const screen = navigator.slice(navigator.indexOf('name="MyPublicProfile"'));
    const options = screen.slice(0, screen.indexOf('/>'));
    expect(options).toContain("animation: 'fade'");
    expect(options).toContain('gestureEnabled: true');
    expect(options).toContain('fullScreenGestureEnabled: true');
  });

  it('marks the logo tap as the owner preview', () => {
    expect(myProfile).toContain("navigation.navigate('MyPublicProfile', { providerId: providerSlug, asPreview: true });");
  });

  it('hides the header, and so every header button, for that preview', () => {
    expect(profile).toMatch(/if \(asOwnPreview\) \{\s+navigation\.setOptions\(\{ headerShown: false \}\);\s+return;/);
  });
});
