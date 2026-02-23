# Navigation Migration Plan - React Navigation to Expo Router with Native Tabs

## Current State
Your app currently uses:
- React Navigation v7 with stack and tab navigators
- Custom tab bar component (AdaptiveTabBar)
- Nested stack navigators for each tab
- Complex navigation patterns with params

## Target State
Expo Router with unstable-native-tabs for iOS 26+ Liquid Glass effect

## Critical Issue
The current screens are **heavily integrated** with React Navigation:
- They use `useNavigation()` hook from `@react-navigation/native`
- They use `navigation.navigate()` with complex params
- They have nested stack navigators within each tab
- Type definitions are tied to React Navigation param lists

## Migration Options

### Option 1: Full Migration (Complex, High Risk)
**Effort**: 4-6 hours
**Risk**: High - Will break navigation temporarily

Steps:
1. Convert all navigation calls from `navigation.navigate()` to Expo Router's `router.push()`
2. Update all screen imports and convert to file-based routing
3. Rewrite nested navigators as nested folders
4. Update all TypeScript types for routes
5. Test all navigation flows

**Files to update**: 20+ files

### Option 2: Hybrid Approach (Recommended)
**Effort**: 2-3 hours
**Risk**: Medium

Keep using React Navigation **inside** each tab, but use Native Tabs for the main tab bar:

```
app/
  _layout.tsx  (Root with providers)
  (tabs)/
    _layout.tsx  (NativeTabs)
    index.tsx    (HomeNavigator - React Navigation Stack)
    becca.tsx    (BeccaNavigator - React Navigation Stack)
    explore.tsx  (ExploreNavigator - React Navigation Stack)
    cart.tsx     (CartNavigator - React Navigation Stack)
    profile.tsx  (ProfileNavigator - React Navigation Stack)
```

Each tab file wraps the existing stack navigator, giving you:
- ✅ Native iOS Liquid Glass tab bar
- ✅ Keep all existing navigation logic
- ✅ Minimal code changes
- ✅ Lower risk

### Option 3: Gradual Migration
Start with simplified tab screens, then incrementally add navigation:
1. Create basic tab screens without navigation
2. Test native tabs work
3. Incrementally add back features

## Recommendation

I recommend **Option 2: Hybrid Approach** because:

1. **Minimal Breaking Changes**: Your existing screens continue to work as-is
2. **Native Tabs**: You get the iOS 26+ Liquid Glass effect you want
3. **Safer**: Navigation within tabs stays the same
4. **Faster**: 2-3 hours vs 4-6 hours

## Next Steps

Would you like me to:
A) Proceed with Option 2 (Hybrid - safest)
B) Proceed with Option 1 (Full migration - riskier but cleaner)
C) Create a minimal demo first to test native tabs work on your device

Let me know which approach you prefer!
