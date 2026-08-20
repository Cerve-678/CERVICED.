// Shared by MasonryGrid's packing math (ExploreScreen's getItemHeight) and
// PortfolioCard's actual rendered image box — both must compute the exact
// same pixel height for a given item/columnWidth, or the grid's column
// balancing (based on reserved height) drifts from what's actually on
// screen (based on rendered height), breaking the masonry packing.
//
// Two things decide a card's height, and they do different jobs:
//
//   1. The photo's TRUE aspect ratio. This is what makes the grid honest —
//      a landscape photo gets a landscape card. Where the ratio is measured
//      from the file itself (see useMeasuredAspectRatios) rather than taken
//      from a hardcoded placeholder, this alone produces real variation,
//      because real photos genuinely aren't all the same shape.
//
//   2. A small deterministic jitter on top. A feed that happens to be mostly
//      one aspect ratio (e.g. Makeup close-ups, or any set shot on the same
//      camera in the same orientation) gives the shortest-column packer
//      nothing to stagger on — two even columns is the mathematically
//      correct output for that input, but it doesn't read as Pinterest.
//      Derived from the item's own id (not Math.random) so it's stable
//      across re-renders and identical between this function's two callers.
//
// The tradeoff in (2) is real and deliberate: jitter means the card box is
// up to ±8% off the photo's true shape, and expo-image's contentFit="cover"
// crops that difference away. It's kept small enough that the crop takes
// from the edges rather than visibly zooming the subject. If a feed ever
// needs to be pixel-honest, drop JITTER_RANGE to 0 — the true-ratio sizing
// in (1) keeps working on its own.
//
// Why this can't be dropped to 0, even though MasonryGrid's packer now
// actively avoids placing cards so their bottom edges line up: the live feed
// is heavily clustered on a few exact ratios (14 of 44 photos at ~0.46,
// another 9 at 0.75–0.80). Identical ratios give identical heights, and no
// placement strategy can un-level two cards that are the same height — the
// packer chooses which column a card goes in, not how tall it is. Jitter is
// what breaks those ties; placement is what keeps the rest from converging.
// Simulated on the live feed, the two together leave 2 of 48 cards level
// with a neighbour, versus 10 for plain shortest-column packing.
//
// NOTE: this jitter is GRID-ONLY. ImageDetailModal deliberately does not use
// it — a photo opened full-size is sized from its measured ratio alone, so
// nothing is cropped there. Don't "unify" the two by applying this in the
// modal; the whole point is that the grid trades a little accuracy for
// stagger and the modal trades none.
const JITTER_RANGE = 0.08; // up to ±8% of the true aspect-ratio height

// Guards against a missing/zero/garbage ratio (square fallback) so a bad row
// can't produce a zero-height or NaN card that collapses the column packer.
const MIN_ASPECT_RATIO = 0.4; // taller than 2:5 gets clamped
const MAX_ASPECT_RATIO = 2.5; // wider than 5:2 gets clamped

// FNV-1a plus a final avalanche step, rather than the classic `hash * 31 +
// charCode`.
//
// The *31 version is subtly broken for the id shapes this app actually
// feeds it. Multiplying by 31 pushes each character's contribution upward
// through the bits, so the LAST character only ever moves the bottom few
// bits of the result — and every id here differs only in its trailing
// characters: `service-<uuid>__0` vs `__1` for carousel photos, sequential
// UUIDs from the same insert batch, `provider-<id>`. Those produced hashes
// that differed by ~2e-9 on a 0–1 scale, i.e. visually identical jitter, so
// nine photos sharing one aspect ratio got nine identical card heights and
// the jitter mechanism silently did nothing at all.
//
// FNV-1a XORs the character in BEFORE multiplying, and the xorshift/multiply
// finisher mixes high bits back down into the low ones, so a single
// character change anywhere in the id redistributes the whole output.
function hashToUnit(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    // FNV prime, via shifts+add so it stays in 32-bit int range instead of
    // losing precision through float multiplication.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) | 0;
  }
  // Avalanche finisher — without this, adjacent inputs still land in
  // adjacent output regions.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x21f0aaad);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x735a2d97);
  hash ^= hash >>> 15;
  // Map to [0, 1)
  return (hash >>> 0) / 0x100000000;
}

export function getMasonryItemHeight(
  id: string,
  aspectRatio: number,
  columnWidth: number,
): number {
  const safeRatio =
    Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  // Clamped so one extreme photo can't produce a card taller than the
  // screen (which reads as a broken column, not a tall image).
  const clamped = Math.min(MAX_ASPECT_RATIO, Math.max(MIN_ASPECT_RATIO, safeRatio));
  const baseHeight = columnWidth / clamped;
  const jitter = 1 + (hashToUnit(id) * 2 - 1) * JITTER_RANGE;
  return baseHeight * jitter;
}
