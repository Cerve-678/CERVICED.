import { SERVICE_TYPE_OPTS, SPECIALTIES_MAP } from '../features/business-details/options';

describe('service type options', () => {
  // The invariant that makes the type genuinely changeable. Changing service
  // type re-scopes the specialty pool on ServicesPricingScreen
  // (SPECIALTIES_MAP[serviceCategory]) and the DB cascade deletes the old
  // specialties on the way through — so a type offered here with no pool
  // would drop a provider's specialties and then show them an empty list to
  // re-pick from, with no way back for 90 days.
  it('offers no service type without a specialty pool behind it', () => {
    for (const opt of SERVICE_TYPE_OPTS) {
      expect(SPECIALTIES_MAP[opt.value]).toBeDefined();
      expect(SPECIALTIES_MAP[opt.value]!.length).toBeGreaterThan(0);
    }
  });

  // MALE and KIDS pass the live CHECK constraint on providers.service_category
  // but describe an audience, not a trade. They're set per-service
  // (services.audience) and per-promotion; offering them as a whole-business
  // type would let a provider move their business somewhere Explore's
  // category tabs treat as a different kind of thing entirely.
  it('does not offer the audience pseudo-categories as a business type', () => {
    const values = SERVICE_TYPE_OPTS.map(o => o.value);
    expect(values).not.toContain('MALE');
    expect(values).not.toContain('KIDS');
  });

  it('gives every option a distinct value and a human label', () => {
    const values = SERVICE_TYPE_OPTS.map(o => o.value);
    expect(new Set(values).size).toBe(values.length);
    for (const opt of SERVICE_TYPE_OPTS) {
      expect(opt.label.trim().length).toBeGreaterThan(0);
      expect(opt.label).not.toBe(opt.value);
    }
  });
});
