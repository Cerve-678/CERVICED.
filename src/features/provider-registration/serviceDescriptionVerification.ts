export interface ExpectedServiceDescription {
  id: string | null;
  category_name: string;
  sort_order: number;
  description: string | null;
}

export interface StoredServiceDescription extends Omit<ExpectedServiceDescription, 'id'> {
  id: string;
}

/** Existing services match by stable database id; newly added services match
 * the category and position used by replace_provider_services(). */
export function serviceDescriptionsMatch(
  expected: ExpectedServiceDescription[],
  stored: StoredServiceDescription[],
): boolean {
  if (expected.length !== stored.length) return false;

  const byId = new Map(stored.map(service => [service.id, service]));
  const byPosition = new Map(stored.map(service => [
    `${service.category_name}\u0000${service.sort_order}`, service,
  ]));
  const matchedIds = new Set<string>();

  for (const service of expected) {
    const saved = service.id
      ? byId.get(service.id)
      : byPosition.get(`${service.category_name}\u0000${service.sort_order}`);
    if (!saved || matchedIds.has(saved.id)) return false;
    if (saved.category_name !== service.category_name || saved.sort_order !== service.sort_order) return false;
    if ((saved.description ?? '') !== (service.description ?? '')) return false;
    matchedIds.add(saved.id);
  }
  return true;
}
