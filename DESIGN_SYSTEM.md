# CERVICED Design System

The real design reference based on what's actually used across all screens.

---

## Important Note on the Theme System

The app has an enterprise theme system (`src/theme/tokens.ts` + `useEnterpriseTheme()`) but **it is not what most screens use**. Almost every screen defines its own local palette directly — `const L = {...}` for light mode and `const D = {...}` for dark mode. These local palettes are identical across every screen, forming the actual design system.

When building a new screen, follow the pattern every other screen uses.

---

## The Actual Colour Palette

Every screen uses these exact values. Copy them as-is.

### Light mode — `L` or `LIGHT`

```ts
const L = {
  bg:      '#F5F1EC',                    // warm cream — main screen background
  surface: '#EDE8E2',                    // slightly darker cream — inputs, list rows
  card:    '#FFFFFF',                    // pure white — cards
  accent:  '#AF9197',                    // muted dusty rose — buttons, active states, icons
  ice:     '#FFFFFF',                    // pure white (alias)
  text:    '#000000',                    // black — primary text
  sub:     '#7E6667',                    // muted rose-brown — secondary text, labels
  border:  'rgba(126,102,103,0.14)',     // very subtle warm border
  sep:     'rgba(126,102,103,0.08)',     // even subtler — dividers/separators
  iconBg:  'rgba(175,145,151,0.12)',     // icon background tint
};
```

### Dark mode — `D` or `DARK`

```ts
const D = {
  bg:      '#1A1815',                    // very dark warm brown-black
  surface: '#201D1A',                    // slightly lighter dark
  card:    '#252220',                    // card background
  accent:  '#AF9197',                    // same dusty rose — identical in both modes
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

---

## Background

**`<ThemedBackground>` is the mandatory root wrapper for every screen.** Never use a plain `<View>` or `<SafeAreaView>` as the outermost element — always wrap with `<ThemedBackground>` first.

### Light mode
Renders `assets/images/background.png` as an `<ImageBackground>` — a warm cream/linen texture fills the entire screen.

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

## Accent Colour

The accent is **`#AF9197`** — a muted dusty rose/mauve. It is the same in both light and dark mode.

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

Used in `ProviderAnalyticsScreen` for charts and data visualisation.

```ts
const P = {
  violet: '#BF5AF2',
  purple: '#9B59D0',
  pink:   '#FF375F',
  teal:   '#5AC8FA',
  green:  '#30D158',
  amber:  '#FF9F0A',
  blue:   '#0A84FF',
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
  accent: '#AF9197', ice: '#FFFFFF', text: '#000000',
  sub: '#7E6667', border: 'rgba(126,102,103,0.14)',
  sep: 'rgba(126,102,103,0.08)', iconBg: 'rgba(175,145,151,0.12)',
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

## Dark vs Light at a glance

| Element | Light | Dark |
|---|---|---|
| Screen background | Background image | `#1A1815` |
| Surfaces / inputs | `#EDE8E2` | `#201D1A` |
| Cards | `#FFFFFF` | `#252220` |
| Primary text | `#000000` | `#F0ECE7` |
| Secondary text | `#7E6667` | `#7E6667` |
| Accent | `#AF9197` | `#AF9197` |
| Borders | `rgba(126,102,103,0.14)` | `rgba(126,102,103,0.18)` |
| Status bar | dark-content | light-content |
