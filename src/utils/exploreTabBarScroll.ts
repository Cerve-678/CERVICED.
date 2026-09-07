// Shared scroll signal between ExploreScreen's masonry grid and the floating
// IslandPillTabBar. A module-level singleton (not component state) so the
// scroll offset can drive the tab bar's hide/show animation entirely on the
// native thread (useNativeDriver) without round-tripping through JS on every
// scroll frame.
import { Animated, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

export const exploreScrollY = new Animated.Value(0);

// Binary shown/hidden state (1 = shown, 0 = hidden), animated with a spring
// so the pill snaps into place rather than continuously tracking every pixel
// of scroll — the previous version derived translateY/opacity directly from
// Animated.diffClamp(exploreScrollY, ...), which read as a slide instead of
// a snap, and (being a continuous native-graph node fed by an event-driven
// value) could end up silently out of sync after a tab switch reset
// exploreScrollY without also resetting the diffClamp node's internal
// tracking — the reported "sometimes doesn't disappear" bug.
export const explorePillVisible = new Animated.Value(1);

let lastOffsetY = 0;
// Small dead zone so tiny/noisy scroll deltas (a stray pixel, momentum
// settling) don't flip the pill back and forth — low enough to feel
// responsive rather than delayed.
const DIRECTION_THRESHOLD = 18;

// On a slow/jittery drag, consecutive raw scroll events can each cross
// DIRECTION_THRESHOLD in alternating directions (finger micro-adjustments),
// which used to flip animateTo(0)/animateTo(1) back and forth every event —
// each call stops the in-flight 120ms timing and restarts it the other way,
// which reads as a visible flicker/stutter. Require a second consecutive
// same-direction event before actually animating: the first crossing just
// records a pending direction, and only a confirming follow-up commits it.
let pendingDirection: 0 | 1 | null = null;

// A short, plain timing (no spring physics) — pop out, pop back. Springs
// (even fairly stiff ones) still have a settle curve that read as "laggy"
// here; a flat 120ms covers the whole transition with nothing left to
// perceive as slow, and no bounce/overshoot to read as imprecise.
const POP = { duration: 120, useNativeDriver: true } as const;

// Tracks the animation this module last started so a new target can stop it
// first instead of retargeting a still-running Animated.timing. Without this,
// a slow/jittery scroll that hovers right around DIRECTION_THRESHOLD fires
// alternating toValue: 0 / toValue: 1 timings that interrupt each other
// mid-flight, leaving explorePillVisible stalled at some in-between value
// with nothing to resolve it once the gesture ends.
let currentAnim: Animated.CompositeAnimation | null = null;
let targetValue: 0 | 1 = 1;

function animateTo(toValue: 0 | 1) {
  if (targetValue === toValue && currentAnim) return;
  currentAnim?.stop();
  targetValue = toValue;
  currentAnim = Animated.timing(explorePillVisible, { toValue, ...POP });
  currentAnim.start(() => {
    currentAnim = null;
  });
}

// Attaching a `listener` to a native-driven Animated.event means RN has to
// deliver EVERY scroll frame to JS to run it, which is most of the native
// driver's benefit given back — and on Android, where scrollEventThrottle is
// effectively ignored and events arrive at native cadence, that is enough
// per-frame JS to make a heavy grid feel stiff. Direction tracking doesn't
// need frame resolution: it decides between two states, and the pill's own
// transition is 120ms. Sampling at 100ms costs nothing perceptible and cuts
// the JS work by roughly a factor of six.
const DIRECTION_SAMPLE_MS = 100;
let lastSampleAt = 0;

function trackScrollDirection(e: NativeSyntheticEvent<NativeScrollEvent>) {
  const y = e.nativeEvent.contentOffset.y;
  const now = Date.now();
  // Reaching the top must always resolve immediately — that one is a state
  // the user can see is wrong, not a sampled direction.
  if (y > 0 && now - lastSampleAt < DIRECTION_SAMPLE_MS) return;
  lastSampleAt = now;
  const delta = y - lastOffsetY;
  if (y <= 0) {
    lastOffsetY = y;
    pendingDirection = null;
    animateTo(1);
    return;
  }
  if (delta > DIRECTION_THRESHOLD) {
    lastOffsetY = y;
    if (pendingDirection === 0) {
      animateTo(0);
      pendingDirection = null;
    } else {
      pendingDirection = 0;
    }
  } else if (delta < -DIRECTION_THRESHOLD) {
    lastOffsetY = y;
    if (pendingDirection === 1) {
      animateTo(1);
      pendingDirection = null;
    } else {
      pendingDirection = 1;
    }
  } else {
    // Delta dropped back under the threshold before a second confirming
    // event arrived — don't carry a stale pending direction into whatever
    // comes next.
    pendingDirection = null;
  }
}

export const exploreScrollHandler = Animated.event(
  [{ nativeEvent: { contentOffset: { y: exploreScrollY } } }],
  { useNativeDriver: true, listener: trackScrollDirection }
);

// A slow/small drag can end with net movement under DIRECTION_THRESHOLD —
// nothing crossed the dead zone, so the pill is left wherever the last
// committed event left it, which can look "stuck" relative to where the
// gesture actually ended up. Call this from onScrollEndDrag (finger lifted,
// no momentum) and onMomentumScrollEnd (momentum scroll settled) so every
// gesture resolves to a definitive shown/hidden state instead of trailing
// off ambiguously.
export function settleExplorePillTracking(e: NativeSyntheticEvent<NativeScrollEvent>) {
  const y = e.nativeEvent.contentOffset.y;
  lastOffsetY = y;
  animateTo(y <= 0 ? 1 : targetValue);
}

// Called on Explore screen focus and on internal Discover/Favourites tab
// switches — both swap in a fresh ScrollView at offset 0, so the pill should
// always come back fully shown and the direction tracker's baseline reset,
// rather than carrying over state from whichever grid was scrolled before.
export function resetExplorePillTracking() {
  currentAnim?.stop();
  currentAnim = null;
  targetValue = 1;
  exploreScrollY.setValue(0);
  lastOffsetY = 0;
  explorePillVisible.setValue(1);
}
