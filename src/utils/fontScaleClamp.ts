import React from 'react';

// Deliberately `require`, not `import * as`: Babel's ESM interop hands an
// `import * as` a COPY of a CommonJS module's exports, and redefining a
// property on a copy changes nothing for anyone else. `require` returns the
// one cached exports object every other file's `import { Text }` reads from.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ReactNative: Record<string, unknown> = require('react-native');

/**
 * Ceiling on how far the OS font-size setting is allowed to enlarge text.
 *
 * Text still scales — someone who set a larger system font still gets larger
 * text here — but it stops at 1.3×, past which fixed-height rows, tab labels
 * and the two-column tile grids start clipping. Disabling scaling outright was
 * the alternative and is worse: it silently ignores an accessibility setting
 * the user deliberately turned on.
 *
 * This is a cap on the FONT setting only. Android's separate "Display size"
 * setting changes system density, and no app can override that one — the
 * defence there is layout that measures the window it is actually given
 * (`useWindowDimensions`), not a fixed size.
 */
export const MAX_FONT_SCALE = 1.3;

const CLAMPED: ReadonlyArray<'Text' | 'TextInput'> = ['Text', 'TextInput'];

let applied = false;

/**
 * Applies {@link MAX_FONT_SCALE} to every `<Text>` and `<TextInput>` in the app.
 *
 * React Native has no supported global setting for this, and the two obvious
 * routes are both closed here: `Text.defaultProps` stopped working in React 19,
 * which dropped defaultProps for function components, and passing the prop by
 * hand would mean touching 2708 call sites across 119 files and remembering it
 * forever after.
 *
 * So the module export itself is swapped for a wrapper that fills the prop in.
 * `react-native` declares these as configurable getters, and Babel compiles
 * `import { Text } from 'react-native'` to a property read at each use rather
 * than a binding captured at import — so existing call sites pick the wrapper
 * up without changing a line.
 *
 * A call site that passes its own `maxFontSizeMultiplier` still wins, and
 * `ref` passes straight through (React 19 hands it to function components as
 * an ordinary prop), so `TextInput` refs keep working.
 *
 * Call once, before the first render (see App.tsx).
 */
export function applyFontScaleClamp(): void {
  if (applied) return;
  applied = true;

  for (const name of CLAMPED) {
    const original = ReactNative[name] as React.ComponentType<Record<string, unknown>>;
    if (typeof original !== 'function') continue;

    const descriptor = Object.getOwnPropertyDescriptor(ReactNative, name);
    // Only a configurable property can be swapped. If a future version of
    // React Native locks these down, text scales unclamped rather than the app
    // failing to launch.
    if (!descriptor?.configurable) continue;

    const Clamped = (props: Record<string, unknown>) =>
      React.createElement(original, {
        maxFontSizeMultiplier: MAX_FONT_SCALE,
        ...props,
      });
    Clamped.displayName = name;
    // Statics live on these components too (TextInput.State, and anything a
    // screen reaches for off the component itself), so carry them across.
    Object.assign(Clamped, original);

    Object.defineProperty(ReactNative, name, {
      configurable: true,
      enumerable: descriptor.enumerable ?? true,
      get: () => Clamped,
    });
  }
}
