import { mapProviderProfileData } from '../features/providers/profileMapper';

/** One service row, trimmed to what the mapper actually reads. */
const service = (
  overrides: Partial<Record<string, unknown>> & { name: string; category_name: string },
) => ({
  id: `svc-${overrides.name}`,
  service_category: null,
  category_description: null,
  price: '40',
  duration_minutes: 60,
  description: null,
  images: [],
  add_ons: [],
  ...overrides,
});

const provider = (overrides: Record<string, unknown>) =>
  ({
    slug: 'nias-lash-brow-bar',
    display_name: "Nia's Lash & Brow Bar",
    service_category: 'LASHES',
    rating: '4.9',
    ...overrides,
  }) as any;

describe('mapProviderProfileData — service types', () => {
  it('groups a multi-type menu by type, then by the provider\'s own category', () => {
    const result = mapProviderProfileData(
      provider({
        service_categories: ['LASHES', 'BROWS'],
        services: [
          service({ name: 'Classic Full Set', category_name: 'Classic Set', service_category: 'LASHES' }),
          service({ name: 'Brow Lamination', category_name: 'Lamination', service_category: 'BROWS' }),
          service({ name: 'Volume Full Set', category_name: 'Volume', service_category: 'LASHES' }),
        ],
      }),
    );

    expect(result.serviceTypes).toEqual(['LASHES', 'BROWS']);
    expect(Object.keys(result.categoriesByType['LASHES']!)).toEqual(['Classic Set', 'Volume']);
    expect(Object.keys(result.categoriesByType['BROWS']!)).toEqual(['Lamination']);
    // The flat all-types view still holds everything, so callers that don't
    // care about types (promo eligibility, the Show All sheet) need no change.
    expect(Object.keys(result.categories).sort()).toEqual(['Classic Set', 'Lamination', 'Volume']);
  });

  it('keeps two types that share a category name apart', () => {
    // The exact case the flat `categories` map cannot represent: both a lash
    // tint and a brow tint, each legitimately called "Tint".
    const result = mapProviderProfileData(
      provider({
        service_categories: ['LASHES', 'BROWS'],
        services: [
          service({ name: 'Lash Tint', category_name: 'Tint', service_category: 'LASHES' }),
          service({ name: 'Brow Tint', category_name: 'Tint', service_category: 'BROWS' }),
        ],
      }),
    );

    expect(result.categoriesByType['LASHES']!['Tint']!.map(s => s.name)).toEqual(['Lash Tint']);
    expect(result.categoriesByType['BROWS']!['Tint']!.map(s => s.name)).toEqual(['Brow Tint']);
  });

  it('hides a declared type that has no services in it', () => {
    // Declared at sign-up, nothing added yet. A client must never be offered
    // a type with nothing bookable under it.
    const result = mapProviderProfileData(
      provider({
        service_categories: ['LASHES', 'BROWS', 'NAILS'],
        services: [
          service({ name: 'Classic Full Set', category_name: 'Classic Set', service_category: 'LASHES' }),
          service({ name: 'Brow Lamination', category_name: 'Lamination', service_category: 'BROWS' }),
        ],
      }),
    );

    expect(result.serviceTypes).toEqual(['LASHES', 'BROWS']);
    expect(result.serviceTypes).not.toContain('NAILS');
  });

  it('orders types by the declared set, not by the order services arrive in', () => {
    const result = mapProviderProfileData(
      provider({
        service_categories: ['LASHES', 'BROWS'],
        services: [
          service({ name: 'Brow Lamination', category_name: 'Lamination', service_category: 'BROWS' }),
          service({ name: 'Classic Full Set', category_name: 'Classic Set', service_category: 'LASHES' }),
        ],
      }),
    );

    expect(result.serviceTypes).toEqual(['LASHES', 'BROWS']);
  });

  it('reads an untyped service as the headline type, so existing providers are unchanged', () => {
    // Every service written before services.service_category existed. The
    // switch must not appear, and the menu must look exactly as it always has.
    const result = mapProviderProfileData(
      provider({
        service_categories: ['LASHES'],
        services: [
          service({ name: 'Classic Full Set', category_name: 'Classic Set' }),
          service({ name: 'Volume Full Set', category_name: 'Volume' }),
        ],
      }),
    );

    expect(result.serviceTypes).toEqual(['LASHES']);
    expect(Object.keys(result.categoriesByType['LASHES']!)).toEqual(['Classic Set', 'Volume']);
  });

  it('falls back to service_category when the set is missing entirely', () => {
    // A provider row read before the migration backfilled it.
    const result = mapProviderProfileData(
      provider({
        services: [service({ name: 'Classic Full Set', category_name: 'Classic Set' })],
      }),
    );

    expect(result.serviceTypes).toEqual(['LASHES']);
  });

  it('still surfaces a service stamped with a type the declared set omits', () => {
    // A set edited after the fact would otherwise leave these unreachable —
    // invisible in the switch AND absent from every category tab.
    const result = mapProviderProfileData(
      provider({
        service_categories: ['LASHES'],
        services: [
          service({ name: 'Classic Full Set', category_name: 'Classic Set', service_category: 'LASHES' }),
          service({ name: 'BIAB Overlay', category_name: 'BIAB', service_category: 'NAILS' }),
        ],
      }),
    );

    expect(result.serviceTypes).toEqual(['LASHES', 'NAILS']);
    expect(result.categoriesByType['NAILS']!['BIAB']!.map(s => s.name)).toEqual(['BIAB Overlay']);
  });
});
