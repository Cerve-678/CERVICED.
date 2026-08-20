# Switch-hat modal — "Quiet Editorial" concept (not implemented)

Status: **designed and briefly implemented, then reverted 2026-08-17.** Kept here
for future reference in case this direction gets picked up again. The switch
modals are back to their original centered-card design.

## Where this applies

Two mirrored "switch hat" confirmation modals:
- `src/screens/client/UserProfileScreen.tsx` — "Become a Provider" modal
  (`showProviderModal` state)
- `src/screens/provider/ProviderAccountScreen.tsx` — "Create Client Account"
  modal (`showClientModal` state)

Both currently use a centered `BlurView`-backed card (`Modal transparent
animationType="fade"`, `modalCard`/`modalBtn`/`modalCancel` styles).

## Why it was reverted

The user asked for this because they actually meant a different thing:
"different switch pop up" turned out to mean the *other* switch path needs a
different (currently nonexistent) confirmation — the direct `switchMode()`
call for users who already have both a client and provider profile currently
switches instantly with no popup at all. Quiet Editorial was designed against
the wrong target (the first-time "become a provider/client" upgrade modal,
which already had a popup) — kept as a documented option, not discarded,
since the visual direction itself may still be useful later.

## The concept

One of three mockups originally explored via the `cerviced-design-concept`
agent (Threshold, Split-Face, Quiet Editorial), all sharing one mechanism:
**the primary button always uses the destination hat's accent color**, not
the current screen's own accent — a low-noise signal that this is a mode
swap, not a same-hat confirm action.

Quiet Editorial specifically: a bottom sheet, not a centered card. No
dual-hat graphic — restraint is the point. Structure:

```
<Modal transparent animationType="slide">
  <View style={overlay}>                 {/* plain dim scrim, NOT blurred */}
    <Pressable onPress={dismiss} />       {/* tap-outside to dismiss */}
    <View style={card}>                   {/* bottom sheet, top corners only */}
      <View style={handle} />             {/* small centered drag-bar */}
      <Text style={kicker}>SWITCHING TO PROVIDER</Text>   {/* destination accent */}
      <Text style={headline}>Become a{'\n'}Provider</Text> {/* P.text, Bakbak */}
      <Text style={body}>...</Text>       {/* P.sub, Jura */}
      <TouchableOpacity style={primaryBtn}>...</TouchableOpacity>  {/* destination accent fill */}
      {/* provider-side only: second outline button, origin-neutral colors */}
      <TouchableOpacity style={cancelLink}>Cancel</TouchableOpacity>
    </View>
  </View>
</Modal>
```

### Backdrop
Dim only, no blur — `rgba(0,0,0,0.5)` light / `rgba(0,0,0,0.65)` dark.
Deliberate departure from the existing `BlurView intensity={60}` centered
modals; blur reads as more "alert-like," a flat scrim reads calmer.

### Sheet geometry
```
overlay: { flex: 1, justifyContent: 'flex-end' }
card: {
  borderTopLeftRadius: 28,
  borderTopRightRadius: 28,
  borderWidth: 1,
  paddingHorizontal: 24,
  paddingTop: 12,
  paddingBottom: insets.bottom + 24,   // useSafeAreaInsets()
}
handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20, backgroundColor: P.border }
```

### Kicker (uppercase, destination accent, the one accent signal in the sheet)
```
kicker: { fontFamily: 'BakbakOne-Regular', fontSize: 12, letterSpacing: 2, marginBottom: 8 }
```
Copy: `"SWITCHING TO PROVIDER"` / `"SWITCHING TO CLIENT"` — states the
destination hat explicitly, doesn't repeat the headline/button wording.

### Headline (origin-neutral — P.text, not accent)
```
headline: { fontFamily: 'BakbakOne-Regular', fontSize: 30, letterSpacing: -0.5, lineHeight: 34, marginBottom: 14 }
```

### Body
```
body: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14.5, lineHeight: 21, marginBottom: 24 }
```
Copy unchanged from the original modals (see git history / current code).

### Primary button (destination-accent fill)
```
primaryBtn: { borderRadius: 100, paddingVertical: 16, alignItems: 'center', marginBottom: 10 }
primaryBtnText: { fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 0.5 }
```
`activeOpacity={0.75}` (matches DESIGN_SYSTEM.md's documented primary-button
value — the first implementation pass used `0.8` and a design review caught
the drift).

### Destination-accent token wiring
```ts
// On UserProfileScreen.tsx (client screen, destination = provider):
import { lightTheme as providerLightTheme, darkTheme as providerDarkTheme } from '../../constants/theme';
const destinationAccent = isDarkMode ? providerDarkTheme.accent : providerLightTheme.accent;
const destinationOnAccent = isDarkMode ? providerDarkTheme.onAccent : providerLightTheme.onAccent;

// On ProviderAccountScreen.tsx (provider screen, destination = client):
import { clientLightTheme, clientDarkTheme } from '../../constants/theme';
const destinationAccent = isDarkMode ? clientDarkTheme.accent : clientLightTheme.accent;
const destinationOnAccent = isDarkMode ? clientDarkTheme.onAccent : clientLightTheme.onAccent;
```
Important: pair `destinationAccent` with the **destination hat's own**
`onAccent`, not the current screen's `P.onAccent` — client-hat dark mode's
`onAccent` is `#1B2740` (not white), so using the wrong hat's token produces
illegible text.

### Secondary outline button (provider-side "Create new account" only)
Stays origin-neutral (`P.border`/`P.text`), never destination-accent — the
accent signal stays singular to the primary button.

### Cancel
Plain text link, unchanged styling/copy from the original modals.

### Haptics (everything the first pass initially missed, then added)
- Scrim tap-to-dismiss and Cancel: `Haptics.ImpactFeedbackStyle.Light`
- Primary/outline buttons: `Haptics.ImpactFeedbackStyle.Medium`

## Known gaps / things to redo if revisited
- The destination-accent mechanism is the one piece of this worth keeping
  regardless of layout (centered card or sheet) — it's a real, reusable idea
  for signaling "you're switching identity."
- If reimplemented, re-run `cerviced-design-review` afterward — the first
  pass needed 4 fixes post-review (missing Jura font on body/cancel text,
  missing haptics, `activeOpacity` drift, orphaned `modalBtnOutline` styles
  left behind in `ProviderAccountScreen.tsx`).
- This was designed for the **first-time upgrade modal** (no provider/client
  profile yet). It was never designed against the *other* switch path — the
  instant, popup-less `switchMode()` call used when a user already has both
  hats.

## What was actually done for the dual-hat switch path (resolved separately)

The dual-hat switch already had a transition mechanism —
`AuthContext.switchMode()` sets `isSwitching`/`switchingTo` and
`src/navigation/RootNavigation.tsx` renders a full-screen "Leaving X Mode /
Switching to Y Mode" overlay during the ~900ms swap. It just wasn't visible
as a design problem until this session: the overlay was hardcoded to an
unrelated magenta/purple (`#DA70D6`, `rgba(218,112,214,...)`) that matched
neither hat's real palette from `src/constants/theme.ts`.

Fixed 2026-08-17: the overlay now resolves the **destination hat's** real
theme tokens (`lightTheme`/`darkTheme` for provider, `clientLightTheme`/
`clientDarkTheme` for client, branched on `isDarkMode`) and uses
`surfaceRaised`/`accent`/`sub`/`text` from that palette instead of hardcoded
colors — same "destination-accent" signal explored in the Quiet Editorial
concept above, applied to the transition that was already shipping rather
than to a new confirmation popup. No new popup was added; a single instant
tap still triggers the switch, per explicit user direction ("keep it
instant, but add a transition/animation" — the animation already existed,
it just needed to look like it belonged to this app).
