import { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'react-native';

// Real aspect ratios for remote images, measured from the files themselves.
//
// Only portfolio cards carry a trustworthy ratio from the database
// (portfolio_items.aspect_ratio, stamped at upload from the picked asset's
// width/height). Service, provider and unclaimed-provider cards are all
// mapped with a hardcoded 0.8 placeholder in ExploreScreen because no
// dimensions are stored for those images — service_images has url and
// sort_order only. Rendering those at 0.8 is what makes a landscape photo
// sit in a portrait box and get cropped by contentFit="cover".
//
// Measuring on the client is the stopgap: Image.getSize hits the same URL
// the card is about to render, so it's served from cache in practice, and
// the result is memoised per-URI for the lifetime of the screen. The real
// fix is storing width/height alongside service_images.url at upload time.
//
// Deliberately module-scoped: the cache survives remounts and is shared by
// every consumer, so switching Explore tabs doesn't re-measure the same
// photos and cause a second round of card-height shifting.
const ratioCache = new Map<string, number>();

// URIs already being measured, so N cards sharing one photo don't each fire
// their own getSize for it.
const inFlight = new Set<string>();

export function getCachedAspectRatio(uri: string | undefined): number | undefined {
  if (!uri) return undefined;
  return ratioCache.get(uri);
}

/**
 * Measures every URI passed in, returning a version counter that changes
 * whenever new measurements land. Consumers read actual values through
 * getCachedAspectRatio (or the returned resolve helper) — the counter exists
 * to re-run their height math once the true ratios are known.
 */
export function useMeasuredAspectRatios(uris: (string | undefined)[]): {
  version: number;
  resolveRatio: (uri: string | undefined, fallback: number) => number;
} {
  const [version, setVersion] = useState(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const pending = uris.filter(
      (u): u is string => !!u && !ratioCache.has(u) && !inFlight.has(u),
    );
    if (pending.length === 0) return;

    let landed = 0;
    // Counted on every settled measurement, success or failure, so one bad
    // photo can't strand the batch below its target and suppress the
    // re-render that applies the ratios that *did* resolve. Coalescing into
    // one re-render per batch rather than one per photo keeps a 40-card feed
    // from re-packing 40 times.
    const settle = () => {
      landed++;
      if (mountedRef.current && landed === pending.length) {
        setVersion(v => v + 1);
      }
    };

    pending.forEach(uri => {
      inFlight.add(uri);
      Image.getSize(
        uri,
        (w, h) => {
          inFlight.delete(uri);
          if (w > 0 && h > 0) ratioCache.set(uri, w / h);
          settle();
        },
        () => {
          // Unreachable URI or decode failure: leave it uncached so the
          // caller keeps using its declared fallback ratio.
          inFlight.delete(uri);
          settle();
        },
      );
    });
  }, [uris]);

  const resolveRatio = useCallback(
    (uri: string | undefined, fallback: number) => {
      const measured = uri ? ratioCache.get(uri) : undefined;
      if (measured && measured > 0) return measured;
      return Number.isFinite(fallback) && fallback > 0 ? fallback : 1;
    },
    // version is a dependency on purpose: the cache is mutable module state,
    // so this callback must get a new identity when new ratios land, or
    // consumers memoising on it keep the stale heights.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  return { version, resolveRatio };
}
