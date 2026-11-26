import { mapProviderProfileData } from '../features/providers/profileMapper';
import { additionalInfoGroups, goodToKnowText, howToGetThere } from '../features/providers/additionalInfo';

// The profile and the provider's own Policies & Info preview both read these,
// so what a provider sees there is what clients see.
const classic = { key: 'classic', hero: 'stacked' } as const;

function provider(row: Record<string, unknown>) {
  return mapProviderProfileData({ slug: 's', display_name: 'S', service_category: 'Nails', services: [], ...row } as any);
}

describe('additionalInfoGroups', () => {
  it('groups each kind of fact under its own heading, self-declared credentials marked as such', () => {
    const groups = additionalInfoGroups(provider({
      specialties: [{ specialty: 'BIAB' }],
      languages_spoken: ['English', 'Polish'],
      team_size: 'solo',
      is_insured_self_declared: true,
      dbs_checked_self_declared: true,
      preferred_payment_methods: ['cash'],
    }), classic);
    expect(groups.map(g => g.label)).toEqual(['Specialities', 'Languages', 'Team', 'Credentials', 'Payment methods']);
    expect(groups.find(g => g.label === 'Credentials')!.chips).toEqual(['Insured (self-declared)', 'DBS checked (self-declared)']);
    expect(groups.find(g => g.label === 'Team')!.chips).toEqual(['Solo practitioner']);
  });

  it('names the business type only on page styles whose hero leaves it out', () => {
    const p = provider({ business_type: 'studio' });
    expect(additionalInfoGroups(p, classic).some(g => g.label === 'Business type')).toBe(false);
    expect(additionalInfoGroups(p, { key: 'hush', hero: 'cover' } as any).some(g => g.label === 'Business type')).toBe(true);
  });

  it('is empty when nothing is filled in', () => {
    expect(additionalInfoGroups(provider({}), classic)).toEqual([]);
  });
});

describe('goodToKnowText / howToGetThere', () => {
  it('reads walk-ins and group bookings as one sentence', () => {
    expect(goodToKnowText(provider({ walk_ins_welcome: true, group_bookings_available: true })))
      .toBe('Walk-ins are welcome. Group bookings are available.');
    expect(goodToKnowText(provider({}))).toBe('');
  });

  it('hides directions for a mobile provider', () => {
    expect(howToGetThere(provider({ business_type: 'studio', public_directions: 'Side door' }))).toBe('Side door');
    expect(howToGetThere(provider({ business_type: 'mobile', public_directions: 'Side door' }))).toBe('');
  });
});
