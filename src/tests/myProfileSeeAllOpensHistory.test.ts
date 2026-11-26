// My Profile → Recent activity → See all opens booking history on History,
// whose filter starts on All. There's no separate recent-activity screen and
// no Activity tab in booking history.

import * as fs from 'fs';
import * as path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

describe('Recent activity See all', () => {
  it('opens History → All from My Profile', () => {
    const profile = read('screens', 'provider', 'ProviderMyProfileScreen.tsx');
    expect(profile).toContain("navigation.navigate('BookingHistory', { initialTab: 'history' })");
    expect(profile).not.toContain("navigate('RecentActivity')");

    const history = read('screens', 'provider', 'ProviderBookingHistoryScreen.tsx');
    expect(history).toContain("useState<HistoryFilterKey>('all')");
  });

  it('is registered on the My Profile stack, so back returns to My Profile', () => {
    const nav = read('navigation', 'provider', 'tabs', 'ProviderServicesNavigator.tsx');
    expect(nav).toContain('name="BookingHistory"');
    expect(nav).not.toContain('RecentActivity');
  });

  it('has no Activity tab in booking history and no separate screen', () => {
    const history = read('screens', 'provider', 'ProviderBookingHistoryScreen.tsx');
    expect(history).not.toContain("key: 'activity'");
    expect(fs.existsSync(path.join(__dirname, '..', 'screens', 'provider', 'ProviderRecentActivityScreen.tsx'))).toBe(false);
  });
});
