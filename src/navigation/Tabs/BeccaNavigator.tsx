import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BeccaScreen from '../../screens/BeccaScreen';
import ProviderProfileScreen from '../../screens/ProviderProfileScreen';
import NotificationsScreen from '../../screens/NotificationsScreen';
import BookingsScreen from '../../screens/BookingsScreen';
import CartScreen from '../../screens/CartScreen';
import DevSettingsScreen from '../../screens/DevSettingsScreen';
import { BeccaStackParamList } from '../types';
import { useTheme } from '../../contexts/ThemeContext';

const BeccaStack = createNativeStackNavigator<BeccaStackParamList>();

export default function BeccaNavigator() {
  const { theme } = useTheme();

  return (
    <BeccaStack.Navigator>
      <BeccaStack.Screen
        name="BeccaMain"
        component={BeccaScreen}
        options={{ headerShown: false }}
      />
      
      <BeccaStack.Screen
        name="ProviderProfile"
        component={ProviderProfileScreen}
        options={{
          title: 'Provider Profile',
          presentation: 'card',
          headerBackTitle: 'Chat',
          headerStyle: {
            backgroundColor: theme.background,
          },
          headerTintColor: theme.text,
          headerTitleStyle: {
            color: theme.text,
          },
        }}
      />

      <BeccaStack.Screen
        name="CartMain"
        component={CartScreen}
        options={{
          title: 'Cart',
          presentation: 'card',
          headerBackTitle: 'Back',
          headerStyle: {
            backgroundColor: theme.background,
          },
          headerTintColor: theme.text,
          headerTitleStyle: {
            color: theme.text,
          },
        }}
      />

      <BeccaStack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: 'Notifications',
          presentation: 'formSheet',
          headerShown: false,
          headerBackTitle: 'Close',
          headerStyle: {
            backgroundColor: theme.background,
          },
          headerTintColor: theme.text,
        }}
      />
      <BeccaStack.Screen
        name="Bookings"
        component={BookingsScreen}
        options={{
          title: 'Track Appointment',
          presentation: 'card',
          headerBackTitle: 'Chat',
          headerTransparent: false,
          headerShadowVisible: false,
          headerStyle: {
            backgroundColor: theme.background,
          },
          headerTitleStyle: {
            fontFamily: 'BakbakOne',
            fontSize: 22,
            color: theme.text,
          },
          headerTintColor: theme.text,
        }}
      />
      <BeccaStack.Screen
        name="DevSettings"
        component={DevSettingsScreen}
        options={{
          title: 'Developer Settings',
          presentation: 'fullScreenModal',
          headerShown: false,
        }}
      />
    </BeccaStack.Navigator>
  );
}