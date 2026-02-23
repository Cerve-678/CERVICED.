# Enterprise Theme Migration Guide

This guide explains how to migrate components from the legacy theme system to the new enterprise-level design token system.

## Overview

The enterprise theme system provides:
- **Hierarchical token organization**: `theme.colors.text.primary` instead of `theme.text`
- **Semantic naming**: Clear purpose for each token
- **Complete design system**: Typography, spacing, shadows, etc.
- **Type safety**: Full TypeScript support
- **Backward compatibility**: Legacy theme still works

## Migration Strategy

### Phase 1: Use Both Systems (Current)
All existing code continues to work using `useTheme()` hook and legacy `theme` object.
```typescript
const { theme } = useTheme();
// theme.text, theme.background, etc. still work
```

### Phase 2: Gradual Migration
New components and updated components use enterprise theme:
```typescript
const { enterpriseTheme } = useTheme();
// OR use convenience hook
const { theme } = useEnterpriseTheme();
```

### Phase 3: Full Enterprise (Future)
Eventually deprecate legacy theme when all components are migrated.

## Quick Reference

### Legacy vs Enterprise Mapping

| Legacy Property | Enterprise Token | Notes |
|----------------|------------------|-------|
| `theme.background` | `theme.colors.background.primary` | Main background |
| `theme.secondaryBackground` | `theme.colors.background.secondary` | Secondary background |
| `theme.cardBackground` | `theme.colors.background.elevated` | Cards, elevated surfaces |
| `theme.text` | `theme.colors.text.primary` | Primary text |
| `theme.secondaryText` | `theme.colors.text.secondary` | Secondary text |
| `theme.accent` | `theme.colors.brand.primary` | Brand primary color |
| `theme.border` | `theme.colors.border.primary` | Primary borders |
| `theme.glassBackground` | `theme.colors.surface.glass` | Glass morphism |
| `theme.blurTint` | `theme.blur.tint` | Blur tint |

## Migration Examples

### Example 1: Simple Text Component

**Before (Legacy):**
```typescript
import { useTheme } from '../contexts/ThemeContext';

export default function MyComponent() {
  const { theme } = useTheme();

  return (
    <View style={{ backgroundColor: theme.background }}>
      <Text style={{ color: theme.text }}>Hello</Text>
      <Text style={{ color: theme.secondaryText }}>World</Text>
    </View>
  );
}
```

**After (Enterprise):**
```typescript
import { useEnterpriseTheme } from '../contexts/ThemeContext';

export default function MyComponent() {
  const { theme } = useEnterpriseTheme();

  return (
    <View style={{ backgroundColor: theme.colors.background.primary }}>
      <Text style={{
        color: theme.colors.text.primary,
        fontSize: theme.typography.fontSize.md,
        fontFamily: theme.typography.fontFamily.body,
      }}>
        Hello
      </Text>
      <Text style={{
        color: theme.colors.text.secondary,
        fontSize: theme.typography.fontSize.sm,
      }}>
        World
      </Text>
    </View>
  );
}
```

### Example 2: Card Component with Spacing

**Before (Legacy):**
```typescript
const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.cardBackground,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
});
```

**After (Enterprise):**
```typescript
const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.background.elevated,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.base,
    borderWidth: 1,
    borderColor: theme.colors.border.primary,
    ...theme.shadows.md, // Add shadow tokens
  },
});
```

### Example 3: Button Component

**Before (Legacy):**
```typescript
const styles = StyleSheet.create({
  button: {
    backgroundColor: theme.accent,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
```

**After (Enterprise):**
```typescript
const styles = StyleSheet.create({
  button: {
    backgroundColor: theme.colors.brand.primary,
    paddingVertical: theme.components.button.paddingVertical,
    paddingHorizontal: theme.components.button.paddingHorizontal,
    borderRadius: theme.components.button.borderRadius,
    height: theme.components.button.height.md,
  },
  buttonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.md,
    fontWeight: theme.typography.fontWeight.bold,
    fontFamily: theme.typography.fontFamily.heading,
  },
});
```

### Example 4: Modal Component

**Before (Legacy):**
```typescript
<BlurView
  intensity={100}
  tint={theme.blurTint}
  style={{ backgroundColor: theme.cardBackground }}
>
  {/* content */}
</BlurView>
```

**After (Enterprise):**
```typescript
<BlurView
  intensity={theme.blur.intensity.medium}
  tint={theme.blur.tint}
  style={{
    backgroundColor: theme.colors.background.elevated,
    borderRadius: theme.components.modal.borderRadius,
  }}
>
  {/* content */}
</BlurView>
```

## Best Practices

### 1. Use Semantic Tokens
```typescript
// ❌ Avoid
backgroundColor: '#FFFFFF'

// ✅ Good
backgroundColor: theme.colors.surface.primary
```

### 2. Use Component Tokens
```typescript
// ❌ Avoid
borderRadius: 12,
padding: 16,

// ✅ Good
borderRadius: theme.components.card.borderRadius,
padding: theme.components.card.padding,
```

### 3. Use Typography Scale
```typescript
// ❌ Avoid
fontSize: 16,
fontWeight: '600',

// ✅ Good
fontSize: theme.typography.fontSize.md,
fontWeight: theme.typography.fontWeight.semibold,
fontFamily: theme.typography.fontFamily.body,
```

### 4. Use Spacing Scale
```typescript
// ❌ Avoid
marginBottom: 24,
gap: 8,

// ✅ Good
marginBottom: theme.spacing.xl,
gap: theme.spacing.sm,
```

### 5. Use Shadow Tokens (Auto-adjusts for Dark Mode)
```typescript
// ❌ Avoid
shadowColor: '#000',
shadowOffset: { width: 0, height: 2 },
shadowOpacity: 0.1,
shadowRadius: 4,
elevation: 3,

// ✅ Good - Automatically uses darker shadows in dark mode
...theme.shadows.md,

// The theme system automatically provides:
// - Light shadows (subtle) in light mode
// - Dark shadows (stronger opacity) in dark mode
// This creates better depth perception in dark mode
```

### 6. Use Z-Index Scale
```typescript
// ❌ Avoid
zIndex: 1000,
zIndex: 9999,

// ✅ Good - Use semantic z-index values
import { zIndex } from '../theme/tokens';

zIndex: zIndex.modal,      // 1400
zIndex: zIndex.overlay,    // 1300
zIndex: zIndex.toast,      // 1600
zIndex: zIndex.tooltip,    // 1700 (highest)
```

## Migration Checklist

When migrating a component:

- [ ] Replace `useTheme()` with `useEnterpriseTheme()`
- [ ] Update all color references to use `theme.colors.*`
- [ ] Replace hard-coded font sizes with `theme.typography.fontSize.*`
- [ ] Replace hard-coded spacing with `theme.spacing.*`
- [ ] Replace hard-coded border radius with `theme.borderRadius.*`
- [ ] Add shadow tokens where appropriate
- [ ] Use component tokens for common patterns
- [ ] Test in both light and dark modes
- [ ] Verify instant theme switching still works

## Common Pitfalls

### 1. Forgetting to Use useMemo for Styles
```typescript
// ❌ Styles recreated on every render
const styles = {
  text: { color: theme.colors.text.primary },
};

// ✅ Memoized styles
const styles = useMemo(() => ({
  text: { color: theme.colors.text.primary },
}), [theme]);

// ✅ Or use StyleSheet.create outside component
const createStyles = (theme: EnterpriseTheme) => StyleSheet.create({
  text: { color: theme.colors.text.primary },
});
```

### 2. Mixing Legacy and Enterprise Tokens
```typescript
// ❌ Inconsistent
backgroundColor: theme.background, // legacy
color: theme.colors.text.primary, // enterprise

// ✅ Consistent - use all enterprise
backgroundColor: theme.colors.background.primary,
color: theme.colors.text.primary,
```

### 3. Hard-coding Brand Colors
```typescript
// ❌ Hard-coded
backgroundColor: '#a342c3ff',

// ✅ Use brand tokens
backgroundColor: theme.colors.brand.primary,
```

## Next Steps

1. Start with new components - use enterprise theme from the start
2. Gradually migrate existing components when making updates
3. Focus on high-traffic screens first (Home, Search, Profile)
4. Test thoroughly in both light and dark modes
5. Monitor performance - use React DevTools Profiler

## Support

If you encounter issues during migration:
1. Check this guide for examples
2. Review the tokens.ts file for available tokens
3. Look at migrated components (FilterModal, LocationModal) as references
