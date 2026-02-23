import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CartScreen from '../../screens/CartScreen';
import ProviderProfileScreen from '../../screens/ProviderProfileScreen';
import BookingsScreen from '../../screens/BookingsScreen';
import NotificationsScreen from '../../screens/NotificationsScreen';
import { CartStackParamList } from '../types';
import { useTheme } from '../../contexts/ThemeContext';

const CartStack = createNativeStackNavigator<CartStackParamList>();

export default function CartNavigator() {
  const { theme } = useTheme();

  return (
    <CartStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.background,
        },
        headerTintColor: theme.text,
        headerTitleStyle: {
          color: theme.text,
        },
        headerBackTitle: 'Back',
      }}
    >
      <CartStack.Screen 
        name="CartMain" 
        component={CartScreen}  // ✅ This is correct - just pass the component
        options={{ 
          headerShown: false 
        }}
      />
      
      <CartStack.Screen 
        name="ProviderProfile"
        component={ProviderProfileScreen}
        options={{ 
          title: 'Provider Details',
          presentation: 'card',
          headerBackTitle: 'Cart',
        }}
      />
      
      <CartStack.Screen 
        name="Bookings"
        component={BookingsScreen}
        options={{ 
          title: 'My Bookings',
          presentation: 'card',
          headerBackTitle: 'Cart',
        }}
      />
      
      <CartStack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: 'Notifications',
          presentation: 'formSheet',
          headerShown: false,
          headerBackTitle: 'Close',
        }}
      />
    </CartStack.Navigator>
  );
}