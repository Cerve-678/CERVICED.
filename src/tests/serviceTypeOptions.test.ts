import {
  ALL_SERVICE_TYPE_OPTS,
  SERVICE_CATEGORY_OPTS,
  SERVICE_TYPE_OPTS,
  SPECIALTIES_MAP,
} from '../features/business-details/options';

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

describe('retired service types', () => {
  // OTHER is retired: it can't be picked again, but rows already stamped with
  // it are live and must still render a proper label rather than the raw DB
  // code. That's the whole reason the two lists exist separately — collapse
  // them back into one and either new providers can pick OTHER again, or
  // existing OTHER providers start seeing "OTHER" in their own profile.
  it('does not offer OTHER as a pickable type', () => {
    expect(SERVICE_TYPE_OPTS.map(o => o.value)).not.toContain('OTHER');
    expect(SERVICE_CATEGORY_OPTS).not.toContain('OTHER');
  });

  it('still renders a label for a provider already stamped OTHER', () => {
    const legacy = ALL_SERVICE_TYPE_OPTS.find(o => o.value === 'OTHER');
    expect(legacy).toBeDefined();
    expect(legacy!.label).toBe('Other');
  });

  // The sign-up picker (SERVICE_CATEGORY_OPTS) and Business Info's picker
  // (SERVICE_TYPE_OPTS) must offer the same set in the same order, or a
  // provider picks a type at sign-up they can never get back to later.
  it('offers the same types at sign-up as in Business Info', () => {
    expect([...SERVICE_CATEGORY_OPTS]).toEqual(SERVICE_TYPE_OPTS.map(o => o.value));
  });

  it('keeps every pickable type inside the full list', () => {
    const all = ALL_SERVICE_TYPE_OPTS.map(o => o.value);
    for (const opt of SERVICE_TYPE_OPTS) expect(all).toContain(opt.value);
  });

  // Retiring a type must not strip the pool a legacy provider's specialty
  // list is still read from.
  it('keeps a specialty pool for retired types too', () => {
    for (const opt of ALL_SERVICE_TYPE_OPTS) {
      expect(SPECIALTIES_MAP[opt.value]?.length).toBeGreaterThan(0);
    }
  });
});
