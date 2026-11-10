// src/features/home/useRevealTogether.ts
//
// Holds a screen's first paint until every named part has loaded, then shows
// them all in one go. Built for Home, which fills from six reads that land at
// different moments: shown as each arrived, sections appeared one above
// another and pushed the page down five or six times in the first second or
// two, which read as Home reloading over and over.
//
// Never waits longer than `maxWaitMs` from mount: past that it shows what it
// has, and anything later still arrives on its own. A part that fails should
// still be marked done, so one bad read can't hold the rest back.

import { useCallback, useEffect, useRef, useState } from 'react';

/** True once every part has been marked done. */
export function allPartsDone<K extends string>(parts: readonly K[], done: ReadonlySet<K>): boolean {
  return parts.every(part => done.has(part));
}

export function useRevealTogether<K extends string>(
  parts: readonly K[],
  maxWaitMs: number,
): { ready: boolean; markDone: (part: K) => void } {
  const [ready, setReady] = useState(parts.length === 0);
  const done = useRef(new Set<K>());
  // Read inside markDone without making it change when `parts` is a new
  // array each render.
  const partsRef = useRef(parts);
  partsRef.current = parts;

  useEffect(() => {
    if (ready) return undefined;
    const timer = setTimeout(() => setReady(true), maxWaitMs);
    return () => clearTimeout(timer);
  }, [ready, maxWaitMs]);

  const markDone = useCallback((part: K) => {
    if (done.current.has(part)) return;
    done.current.add(part);
    if (allPartsDone(partsRef.current, done.current)) setReady(true);
  }, []);

  return { ready, markDone };
}
