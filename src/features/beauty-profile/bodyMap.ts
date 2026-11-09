// src/features/beauty-profile/bodyMap.ts
//
// Pure rules behind the "Map of you" landing (approved 2026-11-08): which
// pins the figure has, which profile category each opens, what the panel
// under the map lists for the picked pin, and which pins carry a due dot.
// No React, so it's tested once.
//
// Skin tone is never listed (product decision, see highlights.ts). The panel
// only reads answers; editing happens in the category editor, so the single
// SAVE PROFILE transaction is unchanged.

import type { BeautyData, CategoryKey } from '../../types/beautyProfile';
import type { MaintenanceItem } from '../../types/maintenance';
import {
  categoryOf,
  groupMaintenanceItems,
  type MaintenanceGroups,
  type UpcomingCoverage,
} from '../maintenance/presentation';

export type MapArea = 'hair' | 'eyes' | 'skin' | 'makeup' | 'nails' | 'general';

/** Pin order: top of the figure down, then the hands, then style. */
export const MAP_AREAS: readonly MapArea[] = ['hair', 'eyes', 'skin', 'makeup', 'nails', 'general'];

export const AREA_CATEGORY: Record<MapArea, CategoryKey> = {
  hair: 'hair',
  eyes: 'lashesBrows',
  skin: 'skin',
  makeup: 'makeup',
  nails: 'nails',
  general: 'general',
};

/** The words on the pin itself. */
export const AREA_PIN_LABEL: Record<MapArea, string> = {
  hair: 'HAIR',
  eyes: 'LASHES & BROWS',
  skin: 'SKIN',
  makeup: 'MAKEUP',
  nails: 'NAILS',
  general: 'STYLE',
};

/** The heading on the panel under the map (the category's own name). */
export const AREA_PANEL_LABEL: Record<MapArea, string> = {
  hair: 'HAIR',
  eyes: 'LASHES & BROWS',
  skin: 'SKIN',
  makeup: 'MAKEUP',
  nails: 'NAILS',
  general: 'GENERAL',
};

export interface AreaRow {
  /** Short label, matching the category editor's section. */
  label: string;
  /** The client's answer(s), or null when not answered yet. */
  value: string | null;
}

const join = (v: string | string[]): string | null => {
  const list = (Array.isArray(v) ? v : [v]).map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? list.join(', ') : null;
};

/** What the panel lists for one pin, in the editor's order. Never skin tone. */
export function areaRows(area: MapArea, d: BeautyData): AreaRow[] {
  switch (area) {
    case 'hair':
      return [
        { label: 'Hair type', value: join(d.hairType) },
        { label: 'Scalp', value: join(d.scalpCondition) },
        { label: 'History', value: join(d.treatmentHistory) },
        { label: 'Goals', value: join(d.hairGoals) },
      ];
    case 'skin':
      return [
        { label: 'Skin type', value: join(d.skinType) },
        { label: 'Concerns', value: join(d.skinConcerns) },
        { label: 'Sensitive', value: join(d.sensitiveAreas) },
      ];
    case 'eyes':
      return [
        { label: 'Lashes', value: join(d.lashStyle) },
        { label: 'Lash status', value: join(d.lashStatus) },
        { label: 'Brows', value: join(d.browStyle) },
        { label: 'Brow condition', value: join(d.browCondition) },
      ];
    case 'nails':
      return [
        { label: 'Length', value: join(d.nailLength) },
        { label: 'Shape', value: join(d.nailShape) },
      ];
    case 'makeup':
      return [
        { label: 'Coverage', value: join(d.makeupCoverage) },
        { label: 'Finish', value: join(d.makeupFinish) },
        { label: 'Eyes', value: join(d.makeupEyes) },
        { label: 'Lips', value: join(d.makeupLips) },
      ];
    case 'general': {
      const rows: AreaRow[] = [{ label: 'Style vibe', value: join(d.styleVibe) }];
      // Interests come from sign-up and have no editor of their own, so the
      // row only appears when there's something to show.
      const interests = join(d.serviceInterests);
      if (interests) rows.push({ label: 'Interests', value: interests });
      return rows;
    }
  }
}

/** Which pin a maintenance item belongs to. Events and untyped reminders have none. */
export function areaForMaintenanceItem(item: MaintenanceItem): MapArea | null {
  switch (categoryOf(item)) {
    case 'HAIR': return 'hair';
    case 'NAILS': return 'nails';
    case 'LASHES':
    case 'BROWS': return 'eyes';
    case 'AESTHETICS': return 'skin';
    default: return null;
  }
}

export type DueDot = 'bad' | 'warn';

/**
 * The dot on each pin (only drawn when the client turns due dots on): red if
 * anything there is overdue, amber if something is due within the week.
 * Booked and paused items never count, the same rule as the "N due" badge.
 */
export function dueDotsByArea(groups: Pick<MaintenanceGroups, 'needsAttention'>): Partial<Record<MapArea, DueDot>> {
  const out: Partial<Record<MapArea, DueDot>> = {};
  for (const { item, view } of groups.needsAttention) {
    const area = areaForMaintenanceItem(item);
    if (!area) continue;
    if (view.state === 'overdue') out[area] = 'bad';
    else if (!out[area]) out[area] = 'warn';
  }
  return out;
}

/** Convenience for the landing: the groups and dots from one pass. */
export function maintenanceForMap(
  items: readonly MaintenanceItem[],
  todayYMD: string,
  coverage: UpcomingCoverage,
): { groups: MaintenanceGroups; dots: Partial<Record<MapArea, DueDot>> } {
  const groups = groupMaintenanceItems(items, todayYMD, coverage);
  return { groups, dots: dueDotsByArea(groups) };
}

// ── The figure the client picked ──────────────────────────────────────────

export type FigureKey = 'line' | 'portrait' | 'zones' | 'segments';

export const FIGURE_KEYS: readonly FigureKey[] = ['portrait', 'line', 'zones', 'segments'];
export const DEFAULT_FIGURE: FigureKey = 'portrait';

export const FIGURE_NAMES: Record<FigureKey, string> = {
  portrait: 'Portrait + hands',
  line: 'Single line',
  zones: 'Soft zones',
  segments: 'Segments',
};

export interface FigurePrefs {
  figure: FigureKey;
  /** A dot on any pin with something due. Off by default. */
  dueDots: boolean;
}

export const DEFAULT_FIGURE_PREFS: FigurePrefs = { figure: DEFAULT_FIGURE, dueDots: false };

/** Reads stored prefs, falling back to the defaults for anything missing or unknown. */
export function parseFigurePrefs(raw: unknown): FigurePrefs {
  if (!raw || typeof raw !== 'object') return DEFAULT_FIGURE_PREFS;
  const r = raw as { figure?: unknown; dueDots?: unknown };
  const figure = FIGURE_KEYS.includes(r.figure as FigureKey) ? (r.figure as FigureKey) : DEFAULT_FIGURE;
  return { figure, dueDots: r.dueDots === true };
}

export const figurePrefsStorageKey = (userId: string): string => `beautyProfile.figure.${userId}`;
