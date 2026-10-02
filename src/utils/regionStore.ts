// Module-level store for the user's chosen region code. dateUtils.ts is a pure,
// context-free module imported everywhere, so it can't read a React context to
// learn the region — it reads it here instead. DisplaySettingsContext is the
// writer (it owns persistence). Kept dependency-light so there's no import cycle
// (displaySettings holds only static data and no reference back to this store).

import { DEFAULT_REGION } from './displaySettings';

let currentRegion: string = DEFAULT_REGION;

export function getRegion(): string {
  return currentRegion;
}

// No subscribe/listeners: dateUtils reads getRegion() at call time, so a region
// change applies to dates rendered from then on (already-mounted screens update
// on their next render). That's the accepted design.
export function setRegion(region: string): void {
  currentRegion = region;
}
