/** Shared vocabulary for client profiles, service suitability and discovery. */
export const SKIN_TONES = ['Fair', 'Light', 'Medium', 'Tan', 'Deep', 'Rich'];

/** Unspecified suitability is unknown, so it must not claim a filter match. */
export function matchesSkinTone(tones: readonly string[] | null | undefined, tone: string): boolean {
  return !!tones?.some(value => value.toLowerCase() === tone.toLowerCase());
}
