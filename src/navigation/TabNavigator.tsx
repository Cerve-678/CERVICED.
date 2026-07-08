import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, View, Text } from 'react-native';

import { TabParamList } from '../navigation/types'; // ✅ Import from types.ts

// Navigators
import HomeNavigator from './Tabs/HomeNavigator';
import ExploreNavigator from './Tabs/ExploreNavigator';
import BeccaNavigator from './Tabs/BeccaNavigator';
import CartNavigator from './Tabs/CartNavigator';
import ProfileNavigator from './Tabs/ProfileNavigator';

// Components
import TabIcon from '../components/TabIcon';
import IslandPillTabBar from '../components/IslandPillTabBar';
import { useCart } from '../contexts/CartContext';

const Tab = createBottomTabNavigator<TabParamList>();

const CartBadge: React.FC<{ count: number }> = ({ count }) => {
  if (count === 0) return null;
  return (
    <View style={styles.cartBadge}>
      <Text style={styles.cartBadgeText}>{count > 99 ? '99+' : count.toString()}</Text>
    </View>
  );
};

const CartTabIcon: React.FC<{ focused: boolean; color: string }> = ({ focused, color }) => {
  const { totalItems } = useCart();
  return (
    <View style={styles.cartIconContainer}>
      <TabIcon name="basket-shopping" focused={focused} color={color} size={26} />
      <CartBadge count={totalItems} />
    </View>
  );
};

export default function TabNavigation() {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={(props) => <IslandPillTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen
        name="Becca"
        component={BeccaNavigator}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="chat-dots" focused={focused} color={color} size={26} />
          ),
        }}
      />
      <Tab.Screen
        name="Explore"
        component={ExploreNavigator}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="earth" focused={focused} color={color} size={26} />
          ),
        }}
      />
      <Tab.Screen
        name="Home"
        component={HomeNavigator}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="house" focused={focused} color={color} size={26} />
          ),
        }}
      />
      <Tab.Screen
        name="Cart"
        component={CartNavigator}
        options={{
          tabBarIcon: ({ focused, color }) => <CartTabIcon focused={focused} color={color} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileNavigator}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="user" focused={focused} color={color} size={26} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  cartIconContainer: {
    position: 'relative',
  },
  cartBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FF4444',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  cartBadgeText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
