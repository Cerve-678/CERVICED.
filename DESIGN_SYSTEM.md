# CERVICED Design System

The real design reference based on what's actually used across all screens.

---

## Important Note on the Theme System

The app has an enterprise theme system (`src/theme/tokens.ts` + `useEnterpriseTheme()`) but **it is not what most screens use**. Almost every screen defines its own local palette directly — `const L = {...}` for light mode and `const D = {...}` for dark mode. These local palettes are identical across every screen, forming the actual design system.

When building a new screen, follow the pattern every other screen uses.

**There are two separate palettes, not one** — `src/constants/theme.ts` exports
`lightTheme`/`darkTheme` (provider hat) **and** `clientLightTheme`/
`clientDarkTheme` (client hat). They are different colour systems, not the
same values reformatted. `useTheme()`'s `palette` field already resolves to
the correct one for the active hat (`activeMode` from `AuthContext`) — always
read colour through `palette` (commonly destructured as `P` or `C`) rather
than importing `lightTheme`/`darkTheme` directly, or a client screen will
render provider branding (this exact bug shipped in `AppDialog.tsx`'s
`useAppDialog()`, which read the always-provider `theme` field instead of the
hat-aware `palette` — see Dialogs below). The rest of this doc's "Actual
Colour Palette" section (`L`/`D`) is the **provider-hat** palette; see
"Client-Hat Palette" further down for the client one.

---

## The Actual Colour Palette

Every screen uses these exact values. Copy them as-is.

### Light mode — `L` or `LIGHT`

```ts
const L = {
  bg:      '#F5F1EC',                    // warm cream — main screen background
  surface: '#EDE8E2',                    // slightly darker cream — inputs, list rows
  card:    '#FFFFFF',                    // pure white — cards
  accent:  '#5C4033',                    // dark chocolate brown — buttons, active states, icons (light mode ONLY — see Accent Colour below)
  ice:     '#FFFFFF',                    // pure white (alias)
  text:    '#000000',                    // black — primary text
  sub:     '#7E6667',                    // muted rose-brown — secondary text, labels
  border:  'rgba(126,102,103,0.14)',     // very subtle warm border
  sep:     'rgba(126,102,103,0.08)',     // even subtler — dividers/separators
  iconBg:  'rgba(92,64,51,0.12)',        // icon background tint (chocolate-tinted in light mode)
};
```

### Dark mode — `D` or `DARK`

```ts
const D = {
  bg:      '#1A1815',                    // very dark warm brown-black
  surface: '#201D1A',                    // slightly lighter dark
  card:    '#252220',                    // card background
  accent:  '#AF9197',                    // muted dusty rose — dark mode ONLY (light mode uses #5C4033 — see Accent Colour below)
  ice:     '#FFFFFF',
  text:    '#F0ECE7',                    // warm white — primary text
  sub:     '#7E6667',                    // same rose-brown — identical in both modes
  border:  'rgba(126,102,103,0.18)',
  sep:     'rgba(126,102,103,0.10)',
  iconBg:  'rgba(175,145,151,0.10)',
};
```

### How to use it in a screen

```tsx
const { isDarkMode } = useTheme();
const P = isDarkMode ? D : L;

// Then reference as:
<View style={{ backgroundColor: P.bg }}>
  <Text style={{ color: P.text }}>Hello</Text>
  <Text style={{ color: P.sub }}>Subtitle</Text>
</View>
```

This `L`/`D` pattern above is a **provider-hat** convention some older
screens hand-roll locally instead of reading `useTheme().palette`. Prefer
`palette` (see the note above) — it already resolves the right hat and mode,
so a screen never has to redeclare `L`/`D` itself.

---

## Client-Hat Palette

`clientLightTheme` / `clientDarkTheme` in `src/constants/theme.ts` — used
whenever `activeMode === 'client'` (`useTheme().palette` resolves to these
automatically; every client screen under `src/screens/client/` should be
reading colour through `palette`, not the provider `L`/`D` above).

```ts
const clientLightTheme = {
  bg:            '#FBF7F8',                    // soft warm pink-tinted off-white
  surface:       '#F3EEF0',
  surfaceRaised: '#FFFFFF',
  card:          '#FFFFFF',
  accent:        '#4A2340',                    // plum — primary accent, light mode
  accentText:    '#4A2340',                    // plum reads fine as TEXT on light bg
  accentDim:     'rgba(74,35,64,0.12)',         // translucent accent — badge/pill fills, disabled states
  onAccent:      '#FFFFFF',                     // text/icon drawn ON TOP of a solid accent fill
  secondary:     '#E5ECF4',                     // blue-grey — secondary fill (heart button, category tags)
  secondaryText: '#4A6B8F',                     // readable blue for TEXT/ICON — #E5ECF4 itself is too pale to read as text
  ice:           '#FFFFFF',
  text:          '#000000',
  sub:           'rgba(74,35,64,0.62)',
  border:        'rgba(74,35,64,0.14)',
  sep:           'rgba(74,35,64,0.08)',
  iconBg:        'rgba(74,35,64,0.12)',
};

const clientDarkTheme = {
  bg:            '#17151A',                    // neutral near-black
  surface:       '#1E1B21',
  surfaceRaised: '#26222A',
  card:          '#26222A',
  accent:        '#E5ECF4',                     // blue-grey — primary accent, dark mode (plum drops out)
  accentText:    '#E5ECF4',                     // 13–15:1 against the dark bg/card — fine as TEXT
  accentDim:     'rgba(229,236,244,0.14)',
  onAccent:      '#1B2740',                     // dark navy — accent itself is PALE, so text/icons drawn on top of a solid accent fill need a dark colour, not white
  secondary:     '#E5ECF4',                     // same blue-grey — secondary and accent converge in dark mode
  secondaryText: '#E5ECF4',
  ice:           '#FFFFFF',
  text:          '#F0ECE7',
  sub:           'rgba(240,236,231,0.65)',
  border:        'rgba(240,236,231,0.16)',
  sep:           'rgba(240,236,231,0.10)',
  iconBg:        'rgba(229,236,244,0.14)',
};
```

### The rule that actually matters: `accent` vs `accentText`/`onAccent`

`accent` is not one colour with one job — it has two completely different
jobs depending on *how* it's applied, and dark mode's pale blue-grey
(`#E5ECF4`) makes the two jobs genuinely incompatible:

- **`accent` as a *background fill*** (a solid button, a filled badge) →
  whatever sits on top of it must be **`onAccent`**, never a hardcoded
  `'#fff'`/`P.ice`/white. In light mode `onAccent` is white (accent is dark
  plum, white reads fine). In dark mode `onAccent` is `#1B2740` (dark navy) —
  **white text on `#E5ECF4` is ~1.1:1 contrast, effectively invisible.** This
  exact bug shipped repeatedly in August 2026 (`SearchScreen`, `BookingsScreen`,
  `BookingDetailScreen`, `CartScreen`, `RescheduleScreen`, `SlidingTabs`'
  active-tab pill, `AppDialog`'s confirm button) before `onAccent` existed as
  a token — always use it now instead of re-deriving a fix per screen.
- **`accent` (or `secondary`) as a *foreground* colour** (icon fill, text
  color, an icon drawn directly over a photo) → in dark mode this is fine as
  **text** (13–15:1 against the dark bg, see `accentText`), but a *pale fill
  colour used as a small icon over a busy background* (a heart over a photo,
  a checkmark over an image) can still read as washed-out even at "legal"
  contrast, because it's competing with photo content, not a flat backdrop.
  `PortfolioCard`'s saved-heart and `ImageDetailModal`'s saved-heart both hit
  this — fixed with a **fixed bright pink (`#FF2D78`)**, the conventional
  "favourited" colour, instead of the theme's pale `secondary` token
  directly; deliberately theme-independent (not `accent`, not `secondary`,
  not a light/dark split) since a saved-heart should read as the same
  colour everywhere regardless of hat or mode. When a token is described as
  "pale, both modes" (see `secondary`'s own comment in `theme.ts`), don't use
  it directly as an icon/text colour without checking it actually reads
  against what it's drawn over — reach for a fixed counterpart instead, the
  same way `secondaryText` (`#4A6B8F`) already exists as the fixed
  text-legible counterpart to `secondary` for exactly this reason.

**When adding a new colour token or changing an existing one:** grep for
every place the old value is used as both a background AND a foreground
before assuming one fix covers all of them — the two uses need different
replacement colours, not the same one.

---

## Background

**`<ThemedBackground>` is the mandatory root wrapper for every screen.** Never use a plain `<View>` or `<SafeAreaView>` as the outermost element — always wrap with `<ThemedBackground>` first.

### Light mode
Solid flat `#F5F1EC` — a warm cream fill. (Note: this doc previously described this as an `<ImageBackground>` rendering `assets/images/background.png` as a linen texture — that's not what `ThemedBackground.tsx` actually does. It's a plain `<View>` with a flat background color, same mechanism as dark mode, just a different hex. `background.png` exists as an asset but isn't wired into this component.)

### Dark mode
Solid `#1A1815` — a very dark warm brown-black.

```tsx
import { ThemedBackground } from '../components/ThemedBackground';

// Screens that use SafeAreaView:
export default function MyScreen() {
  return (
    <ThemedBackground style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* content */}
      </SafeAreaView>
    </ThemedBackground>
  );
}

// Screens that manage insets manually:
export default function MyScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ThemedBackground style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* content */}
      </ScrollView>
    </ThemedBackground>
  );
}
```

### Do not use
- `<AppBackground>` — deprecated alias for `<ThemedBackground>`, kept only for legacy reasons
- `backgroundColor: isDarkMode ? '#1A1815' : '#F5F1EC'` on a root View — this applies the solid colour but misses the light-mode background image
- `backgroundColor: P.bg` on a root View — same issue as above

---

## Accent Colour (Provider Hat)

This section is the **provider-hat** accent. The client hat has its own,
different accent — see "Client-Hat Palette" above, including the
`accent`-as-fill-vs-foreground contrast rule that applies to both hats.

The accent is **mode-specific**, per the app's real shared theme
(`src/constants/theme.ts`), confirmed against how `BookingsScreen.tsx` and
other recently-built screens actually render:

- **Light mode: `#5C4033`** — dark chocolate brown.
- **Dark mode: `#AF9197`** — muted dusty rose/mauve.

Unlike the client hat's dark-mode accent, `#AF9197` is dark enough that plain
white text/icons on top of a solid fill are fine here — the provider hat has
never needed an `onAccent`-style split. If you're porting a provider-hat
pattern to a client screen, don't assume white-on-accent carries over.

(This doc previously stated `#AF9197` for both modes — that was inaccurate;
`#AF9197` is dark-mode-only in the app as it actually ships. If you're
updating an older screen that still uses `#AF9197` in light mode, treat that
as drift to reconcile, not as a second valid convention.)

It is used for:
- Active buttons
- Selected states
- Icons
- Step indicators
- Underlines and highlights

It is **not** a bright purple. The app's aesthetic is warm and muted, not vibrant.

### Chip/selection accent (signup screens + form screens)

When a chip or toggle is selected, a translucent purple-pink is used instead:

```ts
// Selected chip — light mode
backgroundColor: 'rgba(218,112,214,0.2)'

// Selected chip — dark mode
backgroundColor: 'rgba(218,112,214,0.35)'
```

---

## Status / Semantic Colours

Used for booking status badges, alerts, and indicators.

| Meaning | Colour | Used for |
|---|---|---|
| Confirmed / Upcoming | `#4CAF50` | Confirmed bookings, success states |
| In Progress / Info | `#2196F3` | Active/in-progress, info banners |
| Cancelled / Error | `#F44336` | Cancelled, errors |
| No Show / Warning | `#FF9800` | No show, warnings |
| Pending | `#9C27B0` | Pending approval |
| Danger / Destructive | `#FF6868` | Delete buttons, destructive actions |
| Positive / Revenue | `#30D158` | Money amounts, growth, positive stats |

---

## Analytics Chart Colours

Used in `ProviderAnalyticsScreen` for multi-series chart data (bars, per-
service lines, status dots) — a single accent color can't visually separate
5+ simultaneous series, so this screen keeps a distinct qualitative set
alongside (not instead of) the real theme accent. Chrome — backgrounds,
headers, the completion ring — uses `theme.accent` (`#5C4033` light /
`#AF9197` dark) like every other provider screen; it previously used this
same violet/purple set standalone, which was off-brand and has been fixed.

```ts
const CHART = {
  pink:  '#FF375F',
  teal:  '#5AC8FA',
  green: '#30D158',
  amber: '#FF9F0A',
  blue:  '#0A84FF',
  plum:  '#9B59D0',
};
```

---

## Avatar Colours

Used in `ProviderClienteleScreen` for generated client avatars when no photo exists.

```ts
const AVATAR_COLORS = [
  '#DA70D6', '#BF5AF2', '#0A84FF', '#30D158',
  '#FF9F0A', '#FF453A', '#64D2FF', '#FFD60A'
];
```

Colour is picked deterministically by hashing the client's name.

---

## Typography

Two fonts only. No others are used anywhere in the app.

### Fonts

| Font | File | Used for |
|---|---|---|
| `BakbakOne-Regular` | `BakbakOne-Regular.ttf` | ALL headings, buttons, labels, section titles, caps text |
| `Jura-VariableFont_wght` | `Jura-VariableFont_wght.ttf` | ALL body text, descriptions, subtitles, form input text |

**The rule is simple:** uppercase/display → BakbakOne. Sentences/descriptions → Jura.

### Common sizes used in screens

| Usage | Size | Font |
|---|---|---|
| Large screen title | 32 | BakbakOne |
| Section heading | 20–24 | BakbakOne |
| Button text | 13–15 | BakbakOne |
| Section label (caps) | 11–13 | BakbakOne |
| Body / description | 14–16 | Jura |
| Subtitle | 13–14 | Jura |
| Fine print | 11–12 | Jura |
| Input text | 15 | Jura |

### Letter spacing

BakbakOne headings almost always have `letterSpacing: 1` or higher. Labels in all-caps use `letterSpacing: 1.5` to `2`.

---

## Spacing

No formal token system is used in screens — spacing is hardcoded but follows a consistent pattern:

| Usage | Value |
|---|---|
| Screen horizontal padding | 16 |
| Card internal padding | 16–20 |
| Gap between sections | 24–32 |
| Gap between related elements | 8–12 |
| Small icon gap | 6–8 |
| Tiny gap | 4 |

---

## Border Radius

| Usage | Value |
|---|---|
| Pill buttons / chips | 100 (fully round) |
| Cards / modals | 16–20 |
| Input fields | 12–14 |
| Icon circles | half of width (e.g. width 40 → radius 20) |
| Small tags | 8 |

---

## Components

### Screen skeleton (use this as a starting point)

```tsx
import { ThemedBackground } from '../components/ThemedBackground';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const L = {
  bg: '#F5F1EC', surface: '#EDE8E2', card: '#FFFFFF',
  accent: '#5C4033', ice: '#FFFFFF', text: '#000000',
  sub: '#7E6667', border: 'rgba(126,102,103,0.14)',
  sep: 'rgba(126,102,103,0.08)', iconBg: 'rgba(92,64,51,0.12)',
};
const D = {
  bg: '#1A1815', surface: '#201D1A', card: '#252220',
  accent: '#AF9197', ice: '#FFFFFF', text: '#F0ECE7',
  sub: '#7E6667', border: 'rgba(126,102,103,0.18)',
  sep: 'rgba(126,102,103,0.10)', iconBg: 'rgba(175,145,151,0.10)',
};

export default function MyScreen({ navigation }: Props) {
  const { isDarkMode } = useTheme();
  const P = isDarkMode ? D : L;
  const insets = useSafeAreaInsets();

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <TouchableOpacity
          style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: P.border, backgroundColor: P.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
          activeOpacity={0.5}
        >
          <Text style={{ fontFamily: 'BakbakOne-Regular', fontSize: 18, color: P.text }}>{'<'}</Text>
        </TouchableOpacity>

        {/* Title */}
        <Text style={{ fontFamily: 'BakbakOne-Regular', fontSize: 32, color: P.text, letterSpacing: 1, marginBottom: 8 }}>
          SCREEN TITLE
        </Text>

        {/* Subtitle */}
        <Text style={{ fontFamily: 'Jura-VariableFont_wght', fontSize: 14, color: P.sub, lineHeight: 20, marginBottom: 32 }}>
          Description text here.
        </Text>

      </ScrollView>
    </ThemedBackground>
  );
}
```

### Cards

```tsx
<View style={{
  backgroundColor: P.card,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: P.border,
  padding: 16,
  marginBottom: 12,
}}>
```

### Section label (caps)

```tsx
<Text style={{
  fontFamily: 'BakbakOne-Regular',
  fontSize: 11,
  letterSpacing: 2,
  color: P.sub,
  marginBottom: 8,
}}>
  SECTION LABEL
</Text>
```

### Primary button

```tsx
<TouchableOpacity
  style={{
    backgroundColor: P.accent,
    borderRadius: 100,
    paddingVertical: 15,
    alignItems: 'center',
  }}
  activeOpacity={0.75}
>
  <Text style={{ fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 1, color: '#FFFFFF' }}>
    BUTTON TEXT
  </Text>
</TouchableOpacity>
```

### Ghost button (outlined)

```tsx
<TouchableOpacity
  style={{
    borderRadius: 100,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: P.border,
    backgroundColor: P.surface,
  }}
  activeOpacity={0.55}
>
  <Text style={{ fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 1, color: P.text }}>
    BUTTON TEXT
  </Text>
</TouchableOpacity>
```

### Input field

```tsx
<View style={{
  backgroundColor: P.surface,
  borderRadius: 14,
  borderWidth: 1.5,
  borderColor: P.border,
  paddingHorizontal: 16,
  paddingVertical: 12,
}}>
  <TextInput
    style={{ fontFamily: 'Jura-VariableFont_wght', fontSize: 15, color: P.text }}
    placeholderTextColor={P.sub}
  />
</View>
```

### Row separator

```tsx
<View style={{ height: 1, backgroundColor: P.sep, marginVertical: 8 }} />
```

### Icon background circle

```tsx
<View style={{
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: P.iconBg,
  alignItems: 'center',
  justifyContent: 'center',
}}>
  <Icon ... />
</View>
```

### Emissive glow (the Becca hero mark)

`AmbientMark` in `src/components/ChatComponents.tsx` — the glowing rounded
square on the Becca hero screen. This is the **only** glowing element in the
app; the plain `Mark` used in the header and per-reply avatars is static and
must stay that way.

The goal is light that looks *emitted* — radiating and blooming into the space
around it — rather than a bright shape with a soft edge painted on. React
Native has no real light transport, so this is an approximation, but the
technique matters and is easy to undo by accident.

**The technique: stack three shadow casters instead of one.**

A single shadow at a single `shadowRadius` falls off roughly linearly, which
is exactly what reads as a painted halo. Real emissive falloff is steep near
the source with a long faint tail. Three concentric casters at increasing
radii and decreasing opacity sum into that non-linear curve:

| Layer | `scale` | `shadowRadius` (breathes) | Opacity (breathes) |
|---|---|---|---|
| Hot core | 1.06× | 0.40× → 0.60× size | 0.58 → 0.92 |
| Mid bloom | 1.10× | 1.10× → 1.68× size | 0.28 → 0.62 |
| Outer haze | 1.14× | 2.30× → 3.70× size | 0.10 → 0.34 |

Cycle is 1150ms each way, `Easing.inOut(Easing.sin)`.

**Light mode multiplies every opacity by 1.45** (clamped to 1). This is not a
tweak — it's correcting for the palette. The light accent is a dark chocolate
brown cast against a pale background, so its shadow has very little tonal
distance to work with, while dark mode's dusty rose against near-black has
plenty. Identical numbers in both modes look right in dark and washed-out in
light.

**Both radius and opacity animate.** Opacity-only breathing reads as a dimmer
switch being turned up and down; animating `shadowRadius` alongside it makes
the light physically *swell*, which is what sells it as emission rather than a
brightness change. Don't drop the radius travel to simplify.

**The square itself breathes too** — a 1 → 1.02 scale pulse on the same driver,
so mark and light stay in sync. A mark sitting perfectly still while its glow
pulsed read as a static shape with an effect behind it, rather than one object
emitting. Deliberately tiny: it should be felt, not watched. Scale only — the
fill colour never animates, or it reads as a flashing element.

**Three dials, easy to confuse:**

- **`rMin`/`rMax` midpoint** — how far the light reaches. The *size* of the glow.
- **the `rMin`→`rMax` gap** — how much it visibly swells.
- **the `min`→`max` opacity gap** — how hard it pulses. Perceived depth comes
  from the **width** of that gap, not from either endpoint. Raising both
  numbers together makes it brighter without breathing any harder.

The outer haze carries the widest gaps deliberately: the tail moving more than
the core is what reads as light swelling into the surrounding space, instead
of the square itself blinking on and off.

**Hard constraints — all of these were learned the hard way:**

- **Never use `BlurView` for this.** It does a real *backdrop* blur: it samples
  and darkens whatever is actually behind it on screen. Animating one in a
  loop cyclically dimmed the entire screen. A plain shadow only ever paints —
  it can't darken siblings.
- **The caster needs an opaque `backgroundColor`.** iOS derives a shadow's
  silhouette from the view's actual opaque content, not its bounding box. A
  `transparent` fill casts nothing at all, no matter how high `shadowOpacity`
  goes. Each caster is filled with the accent colour and sits fully behind the
  opaque `Mark`, so only its shadow is ever visible.
- **Rounded square, never a circle.** A circular caster larger than the square
  mark lets its round edge peek past the corners, reading as unwanted curvature.
- **Keep the whole node off the native driver.** `shadowOpacity` and
  `shadowRadius` have no native-driver support; `useNativeDriver: false`.
- **Android gets a different implementation.** `elevation` casts a fixed grey,
  not a coloured bloom, so Android falls back to stacked low-opacity fills.

```tsx
// Hero screen only — never in a header or an avatar.
<AmbientMark size={80} />
```

**Nothing between the mark and the screen root may clip.** The outer haze
spans ~3.7× the mark's size, so any ancestor with default `overflow` cuts the
glow off mid-falloff — which reads as a hard edge rather than light fading
out. `AmbientMark`'s own container, `heroMarkWrap`, and `heroScrollContainer`
all set `overflow: 'visible'` for this reason. ScrollViews clip by default and
are the usual culprit.

**Not achievable natively:** true volumetric scattering, HDR, and spill light
landing on nearby text/surfaces. Spill in particular would mean hand-tinting
sibling elements toward the accent, which breaks the exact-hex palette rules
above — don't add it without an explicit decision to do so.

### Hero ⇄ chat transition (Becca)

`BeccaScreen` swaps between the hero greeting and the chat thread on
`showHero`. The two trees still hard mount/unmount — they have different
layouts and rendering both at once would double the ScrollViews — but each
side animates its **entrance** so the change reads as Becca settling into
conversation rather than a hard cut.

The two directions are deliberately asymmetric, because they mean different
things:

| Direction | Motion | Reads as |
|---|---|---|
| → chat | rises up from +14px, fades in | moving forward into the conversation |
| → hero | settles down from −10px, fades in, 0.985→1 scale | coming back to rest |

Same duration both ways (340ms transform / 420ms fade, `Easing.out(Easing.cubic)`)
so neither direction feels laggier than the other. The driver value is reset to
0 on every switch, so the incoming side always animates — not just on first
mount.

### Tap activation — never fire from `onPressOut`

Any pressable **inside a ScrollView** must activate on `onPress`, not
`onPressOut`. `onPressOut` fires on any finger-lift that began on the target —
including one that was really the start of a scroll, or a drag released
somewhere else entirely. This caused Becca's hero quick actions to launch a
chat the user never asked for.

`onPress` only fires when the touch stays on the target *and* the parent
ScrollView hasn't claimed the gesture as a scroll. Use `onPressIn`/`onPressOut`
for the visual press animation only.

```tsx
<TouchableOpacity
  onPressIn={handlePressIn}     // animation only
  onPressOut={handlePressOut}   // animation only
  onPress={handlePress}         // ← activation + haptic lives here
  activeOpacity={1}
  delayPressIn={80}
  pressRetentionOffset={{ top: 6, bottom: 6, left: 6, right: 6 }}
>
```

`delayPressIn={80}` makes the finger settle before it counts as intent, and a
tight `pressRetentionOffset` cancels on a few px of travel. These are tuned
against accidental launches, **not** for snappiness — don't lower them to make
a list feel more responsive without checking scroll behaviour first.

### Dialogs — never use the OS `Alert`

Use `useAppDialog()` (`src/components/AppDialog.tsx`), not `Alert.alert`. A
system popup can't be themed and breaks the screen's visual language.

- `showAlert(title, message?)` — drop-in for a single-button `Alert.alert`.
- `showConfirm(title, message, buttons)` — same `{ text, style, onPress }`
  button shape as `Alert.alert`, so conversions are mechanical.
- Render `<DialogHost />` **last** in the screen's tree so dialogs and toasts
  layer above any bottom sheet.

The provider side has its own `useProviderDialog()` (`src/components/
ProviderDialog.tsx`) with a fixed provider palette. `useAppDialog()` is the
client-hat equivalent and must read colour through `useTheme().palette`
(hat-aware), never the raw `theme` field (always provider) — it did the
latter until August 2026, which made every client-side confirm dialog
("Are you sure you want to discard?" etc.) render in provider-brown
regardless of hat or dark mode. Same rule as the palette note at the top of
this doc: read `palette`, not `theme`.

### Bottom sheets

- **Snap points are `"50%"`, never `"%50"`.** `@gorhom/bottom-sheet` silently
  fails to parse the reversed form, and the sheet then behaves like a
  full-height modal. This exact typo shipped in Becca's history sheet.
- **`snapToIndex(0)` to open, not `expand()`.** `expand()` jumps to the
  *largest* snap point, which is the full-screen feel a partial sheet exists
  to avoid.
- **Unmount the backdrop when the sheet closes** (`onChange` → gate on
  `index < 0`). Leaving it mounted is what strands a dim layer over the
  screen: if the close is interrupted — drag-to-dismiss released mid-flight,
  or `close()` racing the backdrop's own fade — the backdrop can settle at a
  non-zero opacity with nothing left to drive it back down.
- Mount the sheet itself at all times with `index={-1}`; its open/close is a
  driven animation on an always-present component, not a `visible` prop.

### Date & time picker — the plain, "regular" pattern

The default pattern for picking a date or time — used by the Announcements
scheduler's "Schedule Send" toggle (`AnnouncementSheet` in
`ProviderClienteleScreen.tsx`) — is deliberately plain: two small pill
buttons that open the bare OS-native `@react-native-community/datetimepicker`
with `display="default"`, no custom modal/sheet wrapper around it.

- One pill per field: a calendar-icon pill showing the formatted date, a
  clock-icon pill showing the formatted time (`formatTime12` from
  `src/utils/dateUtils.ts` — see the date/time formatting convention, never
  hand-roll a formatter). Each pill's `onPress` just flips a
  `showDatePicker`/`showTimePicker` boolean.
- The picker itself is conditionally rendered (`{showDatePicker && <DateTimePicker .../>}`)
  and unmounts itself in `onChange` after picking — no `Modal` wrapper, no
  spinner `display`, no "Done" header. On iOS this renders as the system's
  own compact popover; on Android as the system dialog. Follow the platform's
  native chrome instead of re-skinning it.
- `minimumDate={new Date()}` on the date picker prevents picking the past.
  Picking a new date preserves the existing time-of-day (and vice versa) by
  cloning the current `Date` and only overwriting the changed field —
  never construct a fresh `Date` from scratch in `onChange`, or you silently
  reset the other field to its default.
- This is distinct, on purpose, from the heavier picker in the provider
  booking detail screen's "Propose New Times" reschedule flow
  (`ProviderBookingDetailScreen.tsx`), which wraps the same
  `DateTimePicker` in a custom bottom-sheet-style `Modal` with a
  "Select Date"/"Done" header and `display="spinner"` on iOS, plus a
  separate "+ Add custom time" escape hatch and an orange (`#FF9500`)
  accent tying it to that screen's reschedule affordances. That flow needs
  the heavier chrome because it's building up a *list* of proposed
  date+time slots (chips accumulate below it) rather than picking one
  value — don't use the plain pill pattern there, and don't pull the
  spinner/modal chrome into the plain pattern elsewhere. Two genuinely
  different jobs, kept visually distinct.

### Navigation back button — two valid patterns, pick by header background

Two genuinely different implementations coexist in this app on purpose —
which one to use is decided by whether the header has a solid background or
sits transparently over content, not by preference.

**Plain native (use when `headerStyle.backgroundColor` is solid/opaque)** —
no custom component at all. Set these in `navigation.setOptions()` and let
React Navigation draw the platform's own back button:

```ts
headerBackButtonDisplayMode: 'minimal',
headerTintColor: P.text, // or P.accentText
```

This is the real OS-native back affordance (the same system-drawn chevron
every native app uses on iOS, just recoloured via tint) — zero custom code,
automatically correct edge-swipe-back behaviour, and it always matches
platform conventions. It has no background of its own, only an icon colour.
`RescheduleScreen.tsx` and `SearchScreen.tsx` are the reference examples.

**Custom glass-pill (use when the header is `headerTransparent: true`,
floating over a photo or arbitrary content)** — a hand-built circular
button via `headerLeft`, not a native element:

```tsx
headerLeft: () => (
  <TouchableOpacity
    style={styles.navBackButton} // ~40x40, borderRadius 20,
                                  // backgroundColor 'rgba(255,255,255,0.25)',
                                  // drop shadow
    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
    accessibilityLabel="Go back"
    accessibilityRole="button"
  >
    <Ionicons name="chevron-back" size={22} color="#000" />
  </TouchableOpacity>
),
```

The translucent white circle plus shadow is **not** iOS's real blur material
(no `UIVisualEffectView`/frosted glass) — it's a flat semi-transparent fill
that reads as "glassy" sitting on top of a photo, fully app-drawn and
app-owned. This exists specifically because a plain tinted chevron with no
backing shape can visually disappear against light image content once the
header has nothing solid behind it. `ProviderProfileScreen.tsx` is the
reference example; its icon colour is a **fixed** `#000` (not theme-aware —
matches "always a dark icon on a light glass circle" regardless of dark
mode), so copy that exact choice rather than swapping in a theme token,
unless asked to make the pill itself theme-aware as a deliberate change.

Don't mix the two on the same screen, and don't invent a third variant —
if a screen's header background changes (e.g. transparent → solid), migrate
its back button to the pattern that now matches, rather than leaving a glass
pill on an opaque header or a bare chevron floating over a photo.

---

## Haptics

Every touchable element uses haptics. Always call `.catch(() => {})` — never let it block.

```tsx
import * as Haptics from 'expo-haptics';

// Light tap — back buttons, chips, toggles
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

// Medium tap — standard buttons, selections
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

// Heavy tap — submit, confirm, primary action
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});

// Selection — pickers, toggles changing value
Haptics.selectionAsync().catch(() => {});

// Success — saved, verified, completed
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

// Error — validation failed, something went wrong
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
```

---

## activeOpacity values

| Context | Value |
|---|---|
| Primary buttons | `0.75` |
| Ghost / secondary buttons | `0.55` |
| Chips, toggles, rows | `0.5` |
| Back buttons, links | `0.5` |
| Social/icon buttons | `0.6`–`0.7` |

---

## Dark vs Light at a glance (Provider Hat)

| Element | Light | Dark |
|---|---|---|
| Screen background | `#F5F1EC` (flat fill) | `#1A1815` |
| Surfaces / inputs | `#EDE8E2` | `#201D1A` |
| Cards | `#FFFFFF` | `#252220` |
| Primary text | `#000000` | `#F0ECE7` |
| Secondary text | `#7E6667` | `#7E6667` |
| Accent | `#5C4033` | `#AF9197` |
| Text/icon on a solid accent fill | `#FFFFFF` | `#FFFFFF` |
| Borders | `rgba(126,102,103,0.14)` | `rgba(126,102,103,0.18)` |
| Status bar | dark-content | light-content |

## Dark vs Light at a glance (Client Hat)

| Element | Light | Dark |
|---|---|---|
| Screen background | `#FBF7F8` | `#17151A` |
| Surfaces / inputs | `#F3EEF0` | `#1E1B21` |
| Cards | `#FFFFFF` | `#26222A` |
| Primary text | `#000000` | `#F0ECE7` |
| Secondary text | `rgba(74,35,64,0.62)` | `rgba(240,236,231,0.65)` |
| Accent | `#4A2340` (plum) | `#E5ECF4` (blue-grey) |
| Text/icon on a solid accent fill (`onAccent`) | `#FFFFFF` | `#1B2740` — **not white, accent is pale here** |
| Secondary as icon/text (`secondaryText`) | `#4A6B8F` | `#E5ECF4` |
| Borders | `rgba(74,35,64,0.14)` | `rgba(240,236,231,0.16)` |
| Status bar | dark-content | light-content |
