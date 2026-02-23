import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import UserProfileScreen from '../../screens/UserProfileScreen';  // CORRECTED: was importing ProviderProfileScreen
import ProviderProfileScreen from '../../screens/ProviderProfileScreen';  // ADDED: for navigation
import BookingsScreen from '../../screens/BookingsScreen';
import BookmarkedProvidersScreen from '../../screens/BookmarkedProvidersScreen';
import NotificationsScreen from '../../screens/NotificationsScreen';
import CartScreen from '../../screens/CartScreen';
import DevSettingsScreen from '../../screens/DevSettingsScreen';
import InfoRegScreen from '../../screens/InfoRegScreen';
import { ProfileStackParamList } from '../types';
import { useTheme } from '../../contexts/ThemeContext';

const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileNavigator() {
  const { theme } = useTheme();

  return (
    <ProfileStack.Navigator>
      <ProfileStack.Screen
        name="ProfileMain"
        component={UserProfileScreen}  // CORRECTED: now uses UserProfileScreen
        options={{ headerShown: false }}
      />
      
      {/* ADD ProviderProfile screen for navigation */}
      <ProfileStack.Screen
        name="ProviderProfile"
        component={ProviderProfileScreen}
        options={{
          title: 'Provider Profile',
          presentation: 'card',
          headerBackTitle: 'Profile',
          headerStyle: {
            backgroundColor: theme.background,
          },
          headerTintColor: theme.text,
          headerTitleStyle: {
            color: theme.text,
          },
        }}
      />

      <ProfileStack.Screen
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

      <ProfileStack.Screen
        name="Bookings"
        component={BookingsScreen}
        options={{
          title: 'Track Appointment',
          presentation: 'card',
          headerBackTitle: 'Profile',
          headerTransparent: false,
          headerShadowVisible: false,
          headerTitleStyle: {
            fontFamily: 'BakbakOne',
            fontSize: 22,
            color: theme.text,
          },
          headerTintColor: theme.text,
        }}
      />

      <ProfileStack.Group screenOptions={{
        presentation: 'fullScreenModal',
        headerBackTitle: 'Close',
        headerStyle: {
          backgroundColor: theme.background,
        },
        headerTintColor: theme.text,
      }}>
        <ProfileStack.Screen
          name="BookmarkedProviders"
          component={BookmarkedProvidersScreen}
          options={{
            title: 'Saved Providers',
          }}
        />
        <ProfileStack.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{
            title: 'Notifications',
            presentation: 'formSheet',
            headerShown: false,
          }}
        />
        <ProfileStack.Screen
          name="DevSettings"
          component={DevSettingsScreen}
          options={{
            title: 'Developer Settings',
            presentation: 'fullScreenModal',
            headerShown: false,
          }}
        />
        <ProfileStack.Screen
          name="InfoReg"
          component={InfoRegScreen}
          options={{
            title: 'Provider Registration',
            presentation: 'fullScreenModal',
            headerShown: false,
          }}
        />
      </ProfileStack.Group>
    </ProfileStack.Navigator>
  );
}