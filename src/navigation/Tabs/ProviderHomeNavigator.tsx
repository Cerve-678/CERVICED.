import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProviderHomeScreen from '../../screens/ProviderHomeScreen';
import ProviderBookingDetailScreen from '../../screens/ProviderBookingDetailScreen';
import NotificationsScreen from '../../screens/NotificationsScreen';
import DevSettingsScreen from '../../screens/DevSettingsScreen';
import { ProviderHomeStackParamList } from '../types';
import { useTheme } from '../../contexts/ThemeContext';

const ProviderHomeStack = createNativeStackNavigator<ProviderHomeStackParamList>();

export default function ProviderHomeNavigator() {
  const { theme } = useTheme();

  return (
    <ProviderHomeStack.Navigator>
      <ProviderHomeStack.Screen
        name="ProviderHomeMain"
        component={ProviderHomeScreen}
        options={{ headerShown: false }}
      />

      <ProviderHomeStack.Screen
        name="BookingDetail"
        component={ProviderBookingDetailScreen}
        options={{
          title: 'Booking Details',
          presentation: 'card',
          headerBackTitle: 'Schedule',
          headerStyle: {
            backgroundColor: theme.background,
          },
          headerTintColor: theme.text,
          headerTitleStyle: {
            color: theme.text,
          },
        }}
      />

      <ProviderHomeStack.Group screenOptions={{
        presentation: 'modal',
        headerBackTitle: 'Close',
        headerStyle: {
          backgroundColor: 'transparent',
        },
        headerTintColor: theme.text,
        contentStyle: {
          backgroundColor: 'transparent',
        },
      }}>
        <ProviderHomeStack.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{ headerShown: false }}
        />
        <ProviderHomeStack.Screen
          name="DevSettings"
          component={DevSettingsScreen}
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
      </ProviderHomeStack.Group>
    </ProviderHomeStack.Navigator>
  );
}
