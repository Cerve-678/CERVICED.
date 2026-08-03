import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BeccaScreen from '../../../screens/shared/BeccaScreen';
import BookingDetailScreen from '../../../screens/client/BookingDetailScreen';
import RescheduleScreen from '../../../screens/client/RescheduleScreen';
import ProviderProfileScreen from '../../../screens/client/ProviderProfileScreen';
import ProviderChatScreen from '../../../screens/client/ProviderChatScreen';
import NotificationsScreen from '../../../screens/shared/NotificationsScreen';
import BookingsScreen from '../../../screens/client/BookingsScreen';
import ClientIntakeFormScreen from '../../../screens/client/ClientIntakeFormScreen';
import CartScreen from '../../../screens/client/CartScreen';
import DevSettingsScreen from '../../../screens/shared/DevSettingsScreen';
import { BeccaStackParamList } from '../../types';
import { useTheme } from '../../../contexts/ThemeContext';

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
        name="ProviderChat"
        component={ProviderChatScreen}
        options={{ headerShown: true, presentation: 'card', headerBackTitle: 'Back' }}
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

      {/* CartScreen renders its own header, so the native stack header must
          stay hidden (matches CartNavigator's CartMain). */}
      <BeccaStack.Screen
        name="CartMain"
        component={CartScreen}
        options={{
          presentation: 'card',
          headerShown: false,
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
        name="ClientIntakeForm"
        component={ClientIntakeFormScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />
      <BeccaStack.Screen
        name="BookingDetail"
        component={BookingDetailScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />
      <BeccaStack.Screen
        name="Reschedule"
        component={RescheduleScreen}
        options={{ headerShown: false, presentation: 'card' }}
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
