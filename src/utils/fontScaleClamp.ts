import React, { useSyncExternalStore } from 'react';
import {
  getTextAppearance,
  subscribeTextAppearance,
  type TextAppearance,
} from './textAppearanceStore';

// Deliberately `require`, not `import * as`: Babel's ESM interop hands an
// `import * as` a COPY of a CommonJS module's exports, and redefining a
// property on a copy changes nothing for anyone else. `require` returns the
// one cached exports object every other file's `import { Text }` reads from.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ReactNative: Record<string, unknown> = require('react-native');

// Pulled off the same cached module object, so this is the real StyleSheet the
// app uses — needed to resolve a call site's `style` (which may be an array, or
// a registered numeric id) before we read/scale its fontSize.
const RNStyleSheet = ReactNative['StyleSheet'] as {
  flatten: (style: unknown) => Record<string, unknown> | undefined;
};

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
 * The same wrapper is also where the user's chosen text SIZE and body FONT
 * (from Settings → Text & Sizing) are applied app-wide — see
 * {@link composeAppearanceStyle}. This is the one interception point, so we
 * don't touch the 2708 individual call sites. The two mechanisms compose: the
 * app-level size multiplier scales the base fontSize, and this accessibility
 * clamp still caps how far the OS setting can enlarge the result on top.
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

    const Wrapped = (props: Record<string, unknown>) => {
      // One subscription per mounted Text/TextInput. The snapshot reference is
      // stable (see textAppearanceStore) so this only re-renders when the user
      // actually changes the setting — not on unrelated renders.
      const appearance = useSyncExternalStore(
        subscribeTextAppearance,
        getTextAppearance,
        getTextAppearance,
      );

      // Default state (no size change, system font): behave EXACTLY as the
      // plain clamp did — inject nothing else, add no `style` prop, do no
      // flatten. Keeps the overwhelmingly common case free of extra work.
      if (appearance.scale === 1 && appearance.fontFamily == null) {
        return React.createElement(original, {
          maxFontSizeMultiplier: MAX_FONT_SCALE,
          ...props,
        });
      }

      const style = composeAppearanceStyle(props['style'], appearance);
      // `maxFontSizeMultiplier` first so a call site's own value still wins via
      // the spread; `style` last so our scaled fontSize / base font wins over
      // props.style where we set it (but only where the call site didn't).
      return React.createElement(original, {
        maxFontSizeMultiplier: MAX_FONT_SCALE,
        ...props,
        style,
      });
    };
    Wrapped.displayName = name;
    // Statics live on these components too (TextInput.State, and anything a
    // screen reaches for off the component itself), so carry them across.
    Object.assign(Wrapped, original);
    // Re-set after Object.assign, which would otherwise copy the original's own
    // displayName back over ours.
    Wrapped.displayName = name;

    Object.defineProperty(ReactNative, name, {
      configurable: true,
      enumerable: descriptor.enumerable ?? true,
      get: () => Wrapped,
    });
  }
}

// The font-only injection ({fontFamily}) is by far the most common non-default
// case (any body text with no explicit size). Cache one object per family so we
// don't allocate a fresh identical object on every such Text render.
let cachedFontOnlyFamily: string | null = null;
let cachedFontOnly: { fontFamily: string } | null = null;

function fontOnlyInjection(family: string): { fontFamily: string } {
  if (cachedFontOnly !== null && cachedFontOnlyFamily === family) return cachedFontOnly;
  cachedFontOnly = { fontFamily: family };
  cachedFontOnlyFamily = family;
  return cachedFontOnly;
}

/**
 * Builds the style to hand the underlying Text/TextInput given a user text
 * appearance. Returns a `[callSiteStyle, injected]` array so the call site's
 * own style still applies, with our injected bits layered on top:
 *
 *  - fontFamily: applied only where the call site set NO family, so explicit
 *    faces (BakbakOne titles, icon fonts) are untouched — body/default text
 *    picks up the chosen font.
 *  - fontSize: scaled only where the call site set an explicit numeric size.
 *    Text with no explicit size inherits from its parent (nested <Text>), so
 *    forcing a size there would break inheritance — we leave it, and it scales
 *    via whichever ancestor did set a size.
 */
export function composeAppearanceStyle(
  callSiteStyle: unknown,
  appearance: TextAppearance,
): unknown {
  const family = appearance.fontFamily;

  // No call-site style to inspect: nothing to scale (no explicit fontSize), so
  // only the base font can apply. Skip the flatten entirely.
  if (callSiteStyle == null) {
    return family != null ? [callSiteStyle, fontOnlyInjection(family)] : callSiteStyle;
  }

  const flat = RNStyleSheet.flatten(callSiteStyle);
  const rawSize = flat != null ? flat['fontSize'] : undefined;
  const applyFont = family != null && (flat == null || flat['fontFamily'] == null);
  const applyScale = appearance.scale !== 1 && typeof rawSize === 'number';

  if (!applyFont && !applyScale) return callSiteStyle;
  // Font-only result: reuse the cached object instead of allocating.
  if (applyFont && !applyScale) return [callSiteStyle, fontOnlyInjection(family as string)];

  const injected: Record<string, unknown> = {};
  if (applyFont) injected['fontFamily'] = family;
  if (applyScale) injected['fontSize'] = (rawSize as number) * appearance.scale;
  return [callSiteStyle, injected];
}
