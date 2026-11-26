// The client's area, as AreaPicker composes it ("Camden, London"), and the
// town it sits in.
//
// Sign-up used to ask a client which towns they'd travel to (a multi-select
// written to users.service_locations). It now asks where they're based, once,
// with the same AreaPicker as Account > Your area, and saves to the same
// column (users.client_area). service_locations is still filled with the
// town, because InfoReg's first save copies it onto a provider profile when
// a client later adds the provider hat (fillProfileFromSignup), and that copy
// shouldn't quietly go empty.

/**
 * The town of a picked area: the part after the last comma ("Camden, London"
 * -> "London"), or the whole answer when it names no town of its own (a place
 * typed under "Other city…", like "Dartford"). Null for a blank answer.
 */
export function townOfArea(area: string): string | null {
  const parts = area.split(',').map(part => part.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1]! : null;
}

/** users.service_locations for a client who picked `area` at sign-up. */
export function serviceLocationsFromArea(area: string): string[] {
  const town = townOfArea(area);
  return town ? [town] : [];
}
