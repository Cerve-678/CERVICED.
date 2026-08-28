import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CartScreen from '../../../screens/client/CartScreen';
import BookingDetailScreen from '../../../screens/client/BookingDetailScreen';
import RescheduleScreen from '../../../screens/client/RescheduleScreen';
import ProviderProfileScreen from '../../../screens/client/ProviderProfileScreen';
import ProviderChatScreen from '../../../screens/client/ProviderChatScreen';
import BookingsScreen from '../../../screens/client/BookingsScreen';
import ClientIntakeFormScreen from '../../../screens/client/ClientIntakeFormScreen';
import NotificationsScreen from '../../../screens/shared/NotificationsScreen';
import DevSettingsScreen from '../../../screens/shared/DevSettingsScreen';
import { CartStackParamList } from '../../types';
import { useTheme } from '../../../contexts/ThemeContext';

const CartStack = createNativeStackNavigator<CartStackParamList>();

export default function CartNavigator() {
  const { theme } = useTheme();

  return (
    <CartStack.Navigator
      screenOptions={{
        headerTransparent: true,
        headerBlurEffect: 'light',
        headerShadowVisible: false,
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
        name="ProviderChat"
        component={ProviderChatScreen}
        options={{ headerShown: true, presentation: 'card', headerBackTitle: 'Back' }}
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
          title: 'Track Appointment',
          presentation: 'card',
          headerBackTitle: 'Cart',
          headerTransparent: false,
          headerBlurEffect: undefined,
          headerShadowVisible: false,
          headerTitleStyle: {
            fontFamily: 'BakbakOne',
            fontSize: 22,
            color: theme.text,
          },
          headerTintColor: theme.text,
        }}
      />

      <CartStack.Screen
        name="ClientIntakeForm"
        component={ClientIntakeFormScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />

      <CartStack.Screen
        name="BookingDetail"
        component={BookingDetailScreen}
        options={{ headerShown: true, presentation: 'card' }}
      />

      <CartStack.Screen
        name="Reschedule"
        component={RescheduleScreen}
        options={{ headerShown: true, presentation: 'card' }}
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

      <CartStack.Screen
        name="DevSettings"
        component={DevSettingsScreen}
        options={{
          title: 'Developer Settings',
          presentation: 'fullScreenModal',
          headerShown: false,
        }}
      />
    </CartStack.Navigator>
  );
}
