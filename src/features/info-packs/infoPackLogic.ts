// Pure rules behind Info Packs: which bookings a pack is for, what it has
// reached, and what a booking is still missing. Kept out of the screens so the
// list, the send sheet and the booking detail all agree, and so it can be
// tested without rendering anything.

/** A pack attaches to the services it names; an empty list means every
 *  service. Same rule the DB triggers use (handle_new_info_pack /
 *  handle_attach_info_packs): `service_name_snapshot = ANY(service_names)
 *  OR cardinality(service_names) = 0`. */
export function packCoversService(
  serviceNames: readonly string[],
  serviceName: string | null | undefined,
): boolean {
  if (serviceNames.length === 0) return true;
  return !!serviceName && serviceNames.includes(serviceName);
}

export interface UpcomingBookingLike {
  id: string;
  status: string;
  booking_date: string;
  service_name_snapshot: string | null;
  user_id?: string | null;
  customer_name?: string | null;
}

/** Still ahead and still happening — the only bookings worth sending a pack
 *  to from the list. Past and cancelled ones used to show in the send sheet
 *  because it filtered on status alone. */
export function isUpcomingOpenBooking(b: UpcomingBookingLike, todayYmd: string): boolean {
  return (b.status === 'pending' || b.status === 'confirmed') && b.booking_date >= todayYmd;
}

export function splitUpcomingForPack<B extends UpcomingBookingLike>(
  bookings: readonly B[],
  serviceNames: readonly string[],
  todayYmd: string,
): { matching: B[]; other: B[] } {
  const matching: B[] = [];
  const other: B[] = [];
  for (const b of bookings) {
    if (!isUpcomingOpenBooking(b, todayYmd)) continue;
    (packCoversService(serviceNames, b.service_name_snapshot) ? matching : other).push(b);
  }
  return { matching, other };
}

/** Distinct clients across a set of bookings. A client with two upcoming
 *  bookings is one person to tell, so the toggle says "4 upcoming clients",
 *  not "5 bookings". Falls back to the booking id when there is no account
 *  (a provider-added walk-in). */
export function countClients(bookings: readonly UpcomingBookingLike[]): number {
  return new Set(bookings.map(b => b.user_id || `booking:${b.id}`)).size;
}

/** First names of the first few clients, for the quiet line under the toggle. */
export function clientPreviewNames(bookings: readonly UpcomingBookingLike[], max = 3): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const b of bookings) {
    const key = b.user_id || `booking:${b.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    names.push((b.customer_name || 'Client').trim().split(/\s+/)[0] || 'Client');
  }
  const shown = names.slice(0, max).join(', ');
  return names.length > max ? `${shown} +${names.length - max}` : shown;
}

export interface PackDelivery {
  infoPackId: string;
  bookingId: string;
  viewedAt: string | null;
}

export interface PackReach {
  sent: number;
  opened: number;
  bookingIds: Set<string>;
}

export const EMPTY_REACH: PackReach = { sent: 0, opened: 0, bookingIds: new Set() };

/** booking_info_packs rows → per-pack "Sent to N · N opened". */
export function summarizeDeliveries(rows: readonly PackDelivery[]): Record<string, PackReach> {
  const out: Record<string, PackReach> = {};
  for (const r of rows) {
    const reach = out[r.infoPackId] ?? (out[r.infoPackId] = { sent: 0, opened: 0, bookingIds: new Set() });
    if (reach.bookingIds.has(r.bookingId)) continue;
    reach.bookingIds.add(r.bookingId);
    reach.sent += 1;
    if (r.viewedAt) reach.opened += 1;
  }
  return out;
}

/** What the pill on a pack card says. */
export function packServiceLabel(serviceNames: readonly string[]): string {
  if (serviceNames.length === 0) return 'All services';
  if (serviceNames.length === 1) return serviceNames[0]!;
  return `${serviceNames[0]} +${serviceNames.length - 1}`;
}

// ── Sections inside a pack ───────────────────────────────────────────────────
// Stored as plain text in info_packs.content: a heading line in capitals, then
// its lines. Nothing new to store, and the client's booking page already shows
// the text as written.

export const PACK_SECTIONS = [
  { key: 'before', heading: 'BEFORE YOUR APPOINTMENT', label: 'Before' },
  { key: 'after', heading: 'AFTERCARE', label: 'Aftercare' },
  { key: 'bring', heading: 'WHAT TO BRING', label: 'What to bring' },
] as const;

export type PackSectionKey = (typeof PACK_SECTIONS)[number]['key'];

export function hasSection(content: string, heading: string): boolean {
  return content.split('\n').some(line => line.trim().toUpperCase() === heading);
}

/** Adds a section heading at the end of the content, leaving a blank line
 *  before it when there's already text. No-op if the heading is there. */
export function insertSection(content: string, heading: string): string {
  if (hasSection(content, heading)) return content;
  const trimmed = content.replace(/\s+$/, '');
  return trimmed.length === 0 ? `${heading}\n` : `${trimmed}\n\n${heading}\n`;
}

/** A heading line, for styling the preview: all capitals, no sentence end. */
export function isHeadingLine(line: string): boolean {
  const t = line.trim();
  return t.length >= 3 && t.length <= 40 && t === t.toUpperCase() && /[A-Z]/.test(t) && !/[.!?]$/.test(t);
}

/** True while the provider still has an example's [placeholder] left in. */
export function hasPlaceholder(text: string): boolean {
  return /\[[^\]]+\]/.test(text);
}

// ── What a booking is missing (provider booking detail) ──────────────────────

export interface LibraryFormLike {
  id: string;
  title: string;
  serviceNames: string[];
}

export interface SentFormLike {
  libraryFormId: string | null;
  title: string;
}

/** Library forms that cover this booking's service but haven't been sent to
 *  it. Matched by library id, falling back to the title for forms sent before
 *  library ids were recorded. */
export function formsNotYetSent<F extends LibraryFormLike>(
  library: readonly F[],
  sent: readonly SentFormLike[],
  serviceName: string | null | undefined,
): F[] {
  const sentIds = new Set(sent.map(s => s.libraryFormId).filter((id): id is string => !!id));
  const sentTitles = new Set(sent.map(s => s.title.trim().toLowerCase()));
  return library.filter(f =>
    packCoversService(f.serviceNames, serviceName)
    && !sentIds.has(f.id)
    && !sentTitles.has(f.title.trim().toLowerCase()),
  );
}

export interface ProviderPackLike {
  id: string;
  title: string;
  service_names: string[];
}

/** The provider's packs that cover this booking's service but aren't on it. */
export function packsNotYetSent<P extends ProviderPackLike>(
  packs: readonly P[],
  sentPackIds: readonly string[],
  serviceName: string | null | undefined,
): P[] {
  const sent = new Set(sentPackIds);
  return packs.filter(p => packCoversService(p.service_names, serviceName) && !sent.has(p.id));
}
