// src/features/providers/policyImages.ts
//
// A provider's detailed policy can be several pictures (pages of a sheet, a
// consent form). They live in booking_policies.policyImageUrls, in order. The
// older single policyImageUrl is still written as the first page, so an app
// build from before this keeps showing a policy instead of none.

export const MAX_POLICY_IMAGES = 5;

export interface PolicyImageFields {
  policyImageUrl?: unknown;
  policyImageUrls?: unknown;
}

/** Every policy page, in order. Reads the list, else the old single image. */
export function policyImageUrls(policies: PolicyImageFields | null | undefined): string[] {
  const list = Array.isArray(policies?.policyImageUrls)
    ? (policies!.policyImageUrls as unknown[]).filter((u): u is string => typeof u === 'string' && u.trim() !== '')
    : [];
  if (list.length > 0) return [...new Set(list)].slice(0, MAX_POLICY_IMAGES);
  const single = policies?.policyImageUrl;
  return typeof single === 'string' && single.trim() !== '' ? [single] : [];
}

/** The two keys to save for `urls`: the list, and the first page on its own. */
export function policyImageFields(urls: readonly string[]): { policyImageUrls: string[]; policyImageUrl: string } {
  const pages = [...new Set(urls.filter(u => u.trim() !== ''))].slice(0, MAX_POLICY_IMAGES);
  return { policyImageUrls: pages, policyImageUrl: pages[0] ?? '' };
}

// ── Edge colours ─────────────────────────────────────────────────────────────
// The colour along the top and bottom edge of each policy page, so the
// profile can run the page into its surroundings (Branding → Policy Pictures:
// Bleed or Melt in). Worked out on the provider's phone when they upload a
// page, while the photo is still local, and saved in booking_policies as
// policyImageEdges, keyed by the page's URL. Pages uploaded before this have
// none; the profile works theirs out on the viewer's phone instead.

export interface PolicyImageEdge {
  top: string;
  bottom: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** The saved edge colours, keyed by page URL. Anything malformed is dropped. */
export function policyImageEdges(policies: object | null | undefined): Record<string, PolicyImageEdge> {
  const raw = (policies as { policyImageEdges?: unknown } | null | undefined)?.policyImageEdges;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, PolicyImageEdge> = {};
  for (const [url, edge] of Object.entries(raw as Record<string, unknown>)) {
    const top = (edge as { top?: unknown } | null)?.top;
    const bottom = (edge as { bottom?: unknown } | null)?.bottom;
    if (typeof top === 'string' && typeof bottom === 'string' && HEX.test(top) && HEX.test(bottom)) {
      out[url] = { top, bottom };
    }
  }
  return out;
}

/** Only the edges of pages that are still in the list, so a removed page's colours don't linger. */
export function prunePolicyImageEdges(
  edges: Record<string, PolicyImageEdge>,
  urls: readonly string[],
): Record<string, PolicyImageEdge> {
  const keep = new Set(urls);
  return Object.fromEntries(Object.entries(edges).filter(([url]) => keep.has(url)));
}

function channelMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function hex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(c => Math.round(c).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/**
 * The colour along the top and bottom edge of an RGBA image: the median of
 * each channel over the outermost `rows` rows. The median rather than the
 * mean, so a heading or a line of text touching the edge doesn't tint the
 * background colour it sits on.
 */
export function edgeColoursFromPixels(rgba: Uint8Array, width: number, height: number, rows = 2): PolicyImageEdge {
  const band = (fromRow: number) => {
    const r: number[] = [];
    const g: number[] = [];
    const b: number[] = [];
    for (let y = fromRow; y < Math.min(fromRow + rows, height); y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        r.push(rgba[i] ?? 0);
        g.push(rgba[i + 1] ?? 0);
        b.push(rgba[i + 2] ?? 0);
      }
    }
    return hex(channelMedian(r), channelMedian(g), channelMedian(b));
  };
  return { top: band(0), bottom: band(Math.max(height - rows, 0)) };
}
