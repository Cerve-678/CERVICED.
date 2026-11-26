/**
 * The hour range ProviderHomeScreen's day timeline draws.
 *
 * The timeline used to be fixed at 7am–9pm. That silently cut the top off any
 * provider who starts earlier. The range is now derived from what the day
 * actually holds.
 *
 * Takes minutes-since-midnight rather than time strings so it stays pure and
 * has no opinion on parsing — the screen already owns that.
 */

export const TL_DEFAULT_START_HOUR = 7;
export const TL_DEFAULT_END_HOUR = 21;

export interface TimelineSpan {
  startMins: number;
  durationMins: number;
}

/**
 * Whole hours spanning the provider's working hours and every booking on the
 * day. The range is never narrower than 7am–9pm and never leaves the day.
 */
export function resolveTimelineRange(
  hours: { openMins: number; closeMins: number } | null,
  spans: readonly TimelineSpan[],
): { startHour: number; endHour: number } {
  let earliest = TL_DEFAULT_START_HOUR * 60;
  let latest = TL_DEFAULT_END_HOUR * 60;

  if (hours) {
    earliest = Math.min(earliest, hours.openMins);
    latest = Math.max(latest, hours.closeMins);
  }
  for (const span of spans) {
    earliest = Math.min(earliest, span.startMins);
    latest = Math.max(latest, span.startMins + span.durationMins);
  }

  return {
    startHour: Math.max(0, Math.floor(earliest / 60)),
    endHour: Math.min(24, Math.ceil(latest / 60)),
  };
}

export interface TimelineBlock {
  /** Pixels from the top of the timeline. */
  top: number;
  /** Pixels tall, after any minimum height has been applied. */
  height: number;
}

/**
 * Side-by-side columns for blocks drawn on a timeline, so overlapping ones
 * don't sit on top of each other.
 *
 * `col` is the block's column and `cols` how many columns its group of
 * overlapping blocks needs. `cols` is per group, not per day: one clash at
 * 11am used to give every block that day the clash's column count, so a
 * 9am booking with nothing beside it drew at half width.
 *
 * Works on drawn pixels, not minutes, so two blocks that only touch because
 * of a minimum height still sit side by side instead of overlapping.
 */
export function assignOverlapColumns(
  blocks: readonly TimelineBlock[],
): { col: number; cols: number }[] {
  const out = blocks.map(() => ({ col: 0, cols: 1 }));

  // Column: the lowest one no earlier overlapping block already holds.
  for (let i = 0; i < blocks.length; i++) {
    const a = blocks[i]!;
    const used = new Set<number>();
    for (let j = 0; j < i; j++) {
      const b = blocks[j]!;
      if (a.top < b.top + b.height && a.top + a.height > b.top) used.add(out[j]!.col);
    }
    let col = 0;
    while (used.has(col)) col++;
    out[i]!.col = col;
  }

  // Group blocks that overlap, directly or through each other, and give
  // every block in a group that group's column count.
  const order = blocks.map((_, i) => i).sort((x, y) => blocks[x]!.top - blocks[y]!.top);
  let group: number[] = [];
  let groupEnd = -Infinity;
  const closeGroup = () => {
    const cols = Math.max(1, ...group.map(i => out[i]!.col + 1));
    group.forEach(i => { out[i]!.cols = cols; });
    group = [];
  };
  for (const i of order) {
    const b = blocks[i]!;
    if (group.length && b.top >= groupEnd) closeGroup();
    group.push(i);
    groupEnd = Math.max(groupEnd, b.top + b.height);
  }
  if (group.length) closeGroup();

  return out;
}
