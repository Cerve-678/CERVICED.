import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProviderAccountScreen from '../../screens/ProviderAccountScreen';
import InfoRegScreen from '../../screens/InfoRegScreen';
import NotificationsScreen from '../../screens/NotificationsScreen';
import DevSettingsScreen from '../../screens/DevSettingsScreen';
import { ProviderAccountStackParamList } from '../types';
import { useTheme } from '../../contexts/ThemeContext';

const ProviderAccountStack = createNativeStackNavigator<ProviderAccountStackParamList>();

const InfoRegComponent = InfoRegScreen as React.ComponentType<any>;

export default function ProviderAccountNavigator() {
  const { theme } = useTheme();

  return (
    <ProviderAccountStack.Navigator>
      <ProviderAccountStack.Screen
        name="ProviderAccountMain"
        component={ProviderAccountScreen}
        options={{ headerShown: false }}
      />

      <ProviderAccountStack.Screen
        name="EditProfile"
        component={InfoRegComponent}
        options={{
          headerShown: false,
          presentation: 'fullScreenModal',
        }}
      />

      <ProviderAccountStack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          headerShown: false,
          presentation: 'formSheet',
        }}
      />

      <ProviderAccountStack.Screen
        name="DevSettings"
        component={DevSettingsScreen}
        options={{
          headerShown: false,
          presentation: 'fullScreenModal',
        }}
      />
    </ProviderAccountStack.Navigator>
  );
}
