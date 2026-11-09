import fs from 'fs';
import path from 'path';

// App Store Review guards: purpose strings for every permission the app asks
// for (5.1.1 — a missing one crashes on request, a generic one is rejected),
// no "Always" location the app never uses, and a Privacy Policy reachable
// from inside the signed-in app for both hats (5.1.1(i)).
const root = path.resolve(__dirname, '../..');
const read = (p: string): string => fs.readFileSync(path.join(root, p), 'utf8');

type PluginEntry = string | [string, Record<string, unknown>];
const plugins: PluginEntry[] = JSON.parse(read('app.json')).expo.plugins;
const options = (name: string): Record<string, unknown> => {
  const entry = plugins.find((p): p is [string, Record<string, unknown>] => Array.isArray(p) && p[0] === name);
  if (!entry) throw new Error(`${name} plugin is not configured in app.json`);
  return entry[1];
};

describe('App Store review configuration', () => {
  it('explains photo-library access and requests no camera or microphone', () => {
    const picker = options('expo-image-picker');
    expect(String(picker['photosPermission'])).toMatch(/^CERVICED /);
    expect(picker['cameraPermission']).toBe(false);
    expect(picker['microphonePermission']).toBe(false);
  });

  it('asks for when-in-use location only', () => {
    const location = options('expo-location');
    expect(String(location['locationWhenInUsePermission'])).toMatch(/^CERVICED /);
    expect(location['locationAlwaysAndWhenInUsePermission']).toBe(false);
    expect(location['locationAlwaysPermission']).toBe(false);
  });

  it.each([
    'src/screens/client/UserProfileScreen.tsx',
    'src/screens/provider/ProviderAccountScreen.tsx',
    'src/screens/shared/HelpCentreScreen.tsx',
  ])('%s links to the Privacy Policy', file => {
    expect(read(file)).toContain("openLegalPage('privacy')");
  });
});
