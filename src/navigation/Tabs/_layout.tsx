import { NativeTabs, NativeTabsTrigger, Icon, Badge } from 'expo-router/unstable-native-tabs';
import { useState } from 'react';

export default function TabsLayout() {
  // Simple example cart count – replace with your real CartContext
  const [cartCount] = useState(5);

  return (
    <NativeTabs {...({ screenOptions: {
        tabBarActiveTintColor: 'black',      // Selected icon/label color
        tabBarInactiveTintColor: 'gray',     // Unselected
      } } as any)}
    >
      <NativeTabsTrigger name="becca">
        <Icon {...({ name: 'chatbubble', focusedName: 'chatbubble.fill', size: 28 } as any)} />
      </NativeTabsTrigger>

      <NativeTabsTrigger name="explore">
        <Icon {...({ name: 'globe', focusedName: 'globe', size: 28 } as any)} />
      </NativeTabsTrigger>

      <NativeTabsTrigger name="index">
        <Icon {...({ name: 'house', focusedName: 'house.fill', size: 28 } as any)} />
      </NativeTabsTrigger>

      <NativeTabsTrigger name="cart">
        <Icon {...({ name: 'cart', focusedName: 'cart.fill', size: 28 } as any)} />
        {cartCount > 0 && <Badge>{cartCount > 99 ? '99+' : String(cartCount)}</Badge>}
      </NativeTabsTrigger>

      <NativeTabsTrigger name="profile">
        <Icon {...({ name: 'person', focusedName: 'person.fill', size: 28 } as any)} />
      </NativeTabsTrigger>
    </NativeTabs>
  );
}
/**
 * FOLDER STRUCTURE:
 *
 * app/
 *   _layout.tsx          ← You are here (Root)
 *   (tabs)/
 *     _layout.tsx        ← Tab navigator with native tabs
 *     index.tsx          ← Home tab
 *     becca.tsx          ← Becca tab
 *     explore.tsx        ← Explore tab
 *     cart.tsx           ← Cart tab
 *     profile.tsx        ← Profile tab
 *   auth.tsx             ← Auth modal screen
 *   [provider].tsx       ← Dynamic route example
 *
 * The (tabs) folder creates a route group that shares the tab layout
 * without adding "tabs" to the URL path.
 */
