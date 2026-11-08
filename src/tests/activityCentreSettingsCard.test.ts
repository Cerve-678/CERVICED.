import fs from 'fs';
import path from 'path';
import { en } from '../i18n/catalogs/en';

const read = (file: string) =>
  fs.readFileSync(path.join(__dirname, '..', 'screens', 'client', file), 'utf8');

describe('Activity Centre card in client Settings → For you', () => {
  const settings = read('UserProfileScreen.tsx');
  const bookings = read('BookingsScreen.tsx');

  it('counts from the same hook as the Bookings sheet, so the two never disagree', () => {
    expect(settings).toContain('useClientActivity()');
    expect(bookings).toContain('useClientActivity()');
    expect(bookings).not.toContain('getMyActivity(');
  });

  it('opens the sheet on Bookings', () => {
    expect(settings).toContain("navigation.navigate('Bookings', { openActivityCentre: true })");
    expect(bookings).toContain('route?.params?.openActivityCentre');
  });

  it('sits in the For you section, before Messages', () => {
    const forYou = settings.slice(settings.indexOf("t('profile.section.forYou')"), settings.indexOf("t('profile.section.account')"));
    expect(forYou.indexOf("profile.forYou.activity.title")).toBeGreaterThan(-1);
    expect(forYou.indexOf("profile.forYou.activity.title")).toBeLessThan(forYou.indexOf("profile.forYou.messages.title"));
    expect(en['profile.forYou.activity.title']).toBe('Activity Centre');
  });
});
