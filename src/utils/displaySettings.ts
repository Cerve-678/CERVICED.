// Display preferences that live on-device (AsyncStorage via DisplaySettingsContext):
// the text-size scale, the body font, and the user's chosen language + region.
//
// This file is the single source of the option lists and the pure helpers that
// operate on them, so the screen, the context, and any future global-apply
// layer all agree on the same values. No React and no I/O here — just data and
// pure functions, so it's trivially testable.

// ── Text size ────────────────────────────────────────────────────────────────

/** Discrete text-size steps. The scale is a plain multiplier on a base size. */
export interface TextScaleStep {
  readonly value: number;
  readonly label: string;
}

export const TEXT_SCALE_STEPS: readonly TextScaleStep[] = [
  { value: 0.85, label: 'Small' },
  { value: 1.0, label: 'Default' },
  { value: 1.15, label: 'Large' },
  { value: 1.3, label: 'Larger' },
] as const;

export const DEFAULT_TEXT_SCALE = 1.0;

const MIN_TEXT_SCALE = TEXT_SCALE_STEPS[0]!.value;
const MAX_TEXT_SCALE = TEXT_SCALE_STEPS[TEXT_SCALE_STEPS.length - 1]!.value;

/**
 * Clamp any incoming number to the supported range. A non-finite input (NaN
 * from a corrupt stored value, undefined coerced to NaN, etc.) falls back to
 * the default rather than propagating a bad multiplier into rendering.
 */
export function clampTextScale(scale: number): number {
  if (!Number.isFinite(scale)) return DEFAULT_TEXT_SCALE;
  if (scale < MIN_TEXT_SCALE) return MIN_TEXT_SCALE;
  if (scale > MAX_TEXT_SCALE) return MAX_TEXT_SCALE;
  return scale;
}

/** Snap an arbitrary scale to the nearest discrete step's value. */
export function snapTextScaleToStep(scale: number): number {
  const clamped = clampTextScale(scale);
  let nearest = TEXT_SCALE_STEPS[0]!;
  for (const step of TEXT_SCALE_STEPS) {
    if (Math.abs(step.value - clamped) < Math.abs(nearest.value - clamped)) {
      nearest = step;
    }
  }
  return nearest.value;
}

/** Human label for a scale value (nearest step). */
export function labelForTextScale(scale: number): string {
  const snapped = snapTextScaleToStep(scale);
  return TEXT_SCALE_STEPS.find((s) => s.value === snapped)?.label ?? 'Default';
}

// ── Body font ──────────────────────────────────────────────────────────────

export type FontChoiceKey = 'system' | 'jura' | 'prata' | 'bakbak';

export interface FontOption {
  readonly key: FontChoiceKey;
  readonly label: string;
  /**
   * The RN fontFamily to apply, or undefined for the platform default.
   * Only fonts actually bundled + loaded in App.tsx appear here.
   */
  readonly family: string | undefined;
  readonly note: string;
}

export const FONT_OPTIONS: readonly FontOption[] = [
  { key: 'system', label: 'Default', family: undefined, note: 'System font' },
  { key: 'jura', label: 'Jura', family: 'Jura-VariableFont_wght', note: 'Clean and geometric' },
  { key: 'prata', label: 'Prata', family: 'Prata-Regular', note: 'Elegant serif' },
  { key: 'bakbak', label: 'Bakbak One', family: 'BakbakOne-Regular', note: 'Bold display' },
] as const;

export const DEFAULT_FONT_CHOICE: FontChoiceKey = 'system';

export function fontFamilyForChoice(key: FontChoiceKey): string | undefined {
  return FONT_OPTIONS.find((f) => f.key === key)?.family;
}

export function isFontChoiceKey(value: string): value is FontChoiceKey {
  return FONT_OPTIONS.some((f) => f.key === value);
}

// ── Language ─────────────────────────────────────────────────────────────────

export interface LanguageOption {
  readonly code: string;
  readonly label: string;
  readonly native: string;
}

// The chosen code drives the app's UI translation via the i18n layer
// (src/i18n/), which reads this same persisted `language`. English is always
// the fallback for any untranslated key, and legal/health copy is held in
// English regardless (see the i18n DO_NOT_TRANSLATE guard).
export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'es', label: 'Spanish', native: 'Español' },
  { code: 'fr', label: 'French', native: 'Français' },
  { code: 'pl', label: 'Polish', native: 'Polski' },
  { code: 'de', label: 'German', native: 'Deutsch' },
] as const;

export const DEFAULT_LANGUAGE = 'en';

export function isLanguageCode(value: string): boolean {
  return LANGUAGE_OPTIONS.some((l) => l.code === value);
}

// ── Region ───────────────────────────────────────────────────────────────────

export interface RegionOption {
  readonly code: string;
  readonly label: string;
  readonly currencySymbol: string;
  readonly dateOrder: 'DMY' | 'MDY';
}

// Region is stored but not yet threaded into currency/date formatting (£ and
// dateUtils are still fixed to UK). The metadata here is what a future wiring
// would read — see the report accompanying this change.
export const REGION_OPTIONS: readonly RegionOption[] = [
  { code: 'GB', label: 'United Kingdom', currencySymbol: '£', dateOrder: 'DMY' },
  { code: 'IE', label: 'Ireland', currencySymbol: '€', dateOrder: 'DMY' },
  { code: 'US', label: 'United States', currencySymbol: '$', dateOrder: 'MDY' },
  { code: 'AU', label: 'Australia', currencySymbol: '$', dateOrder: 'DMY' },
  { code: 'CA', label: 'Canada', currencySymbol: '$', dateOrder: 'DMY' },
] as const;

export const DEFAULT_REGION = 'GB';

export function isRegionCode(value: string): boolean {
  return REGION_OPTIONS.some((r) => r.code === value);
}
