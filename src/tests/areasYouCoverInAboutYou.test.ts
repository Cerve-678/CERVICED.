// "Areas you cover" (providers.service_locations) has one editor: About You.
// Edit Profile used to show and save it too, so a save there could undo a
// change made in About You since Edit Profile opened.

import * as fs from 'fs';
import * as path from 'path';

const read = (...parts: string[]) =>
  fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

describe('Areas you cover lives in About You', () => {
  it('is shown in About You, for mobile providers only, and saved from there', () => {
    const src = read('screens', 'provider', 'AboutYouScreen.tsx');
    expect(src).toContain('<AreasYouCoverPicker');
    expect(src).toContain('providerTravelsToClient(providerData.business_type');
    expect(src).toContain('...(travels ? { service_locations: serviceLocations } : {})');
  });

  it('is gone from Edit Profile', () => {
    const src = read('screens', 'provider', 'InfoRegScreen.tsx');
    expect(src).not.toContain('AreasYouCoverPicker');
  });

  it("isn't written by Edit Profile's update, only by the first insert", () => {
    const src = read('services', 'providerRegistrationService.ts');
    expect(src.match(/service_locations: data\.serviceLocations/g)).toHaveLength(1);
    const insertAt = src.indexOf('insertProviderRegistrationRow({');
    expect(insertAt).toBeGreaterThan(-1);
    expect(src.indexOf('service_locations: data.serviceLocations')).toBeGreaterThan(insertAt);
  });
});
