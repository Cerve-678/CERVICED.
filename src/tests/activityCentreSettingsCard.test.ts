import fs from 'fs';
import path from 'path';
import { en } from '../i18n/catalogs/en';

const read = (file: string) =>
  fs.readFileSync(path.join(__dirname, '..', 'screens', 'client', file), 'utf8');

describe('Activity Centre card in client Settings → For you', () => {
  const settings = read('UserProfileScreen.tsx');
  const bookings = read('BookingsScreen.tsx');

  it('counts from the same hook as Bookings, so the two never disagree', () => {
    expect(settings).toContain('useClientActivity()');
    expect(bookings).toContain('useClientActivity()');
    expect(bookings).not.toContain('getMyActivity(');
  });

  it('opens the Activity Centre as its own page, from Settings and from Bookings', () => {
    expect(settings).toContain("navigation.navigate('ActivityCentre')");
    expect(bookings).toContain("navigation.navigate('ActivityCentre')");
    expect(read('ActivityCentreScreen.tsx')).toContain('useClientActivity()');
  });

  it('is registered in every client stack that has Bookings', () => {
    for (const tab of ['Home', 'Cart', 'Becca', 'Profile']) {
      const nav = fs.readFileSync(path.join(__dirname, '..', 'navigation', 'client', 'tabs', `${tab}Navigator.tsx`), 'utf8');
      expect(nav).toContain('name="Bookings"');
      expect(nav).toContain('name="ActivityCentre"');
    }
  });

  it('sits in the For you section, before Messages', () => {
    const forYou = settings.slice(settings.indexOf("t('profile.section.forYou')"), settings.indexOf("t('profile.section.account')"));
    expect(forYou.indexOf("profile.forYou.activity.title")).toBeGreaterThan(-1);
    expect(forYou.indexOf("profile.forYou.activity.title")).toBeLessThan(forYou.indexOf("profile.forYou.messages.title"));
    expect(en['profile.forYou.activity.title']).toBe('Activity Centre');
  });
});
