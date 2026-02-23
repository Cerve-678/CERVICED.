import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../../screens/HomeScreen';
import ProviderProfileScreen from '../../screens/ProviderProfileScreen';
import SearchScreen from '../../screens/SearchScreen';
import BookingsScreen from '../../screens/BookingsScreen';
import BookmarkedProvidersScreen from '../../screens/BookmarkedProvidersScreen';
import NotificationsScreen from '../../screens/NotificationsScreen';
import CartScreen from '../../screens/CartScreen';
import { HomeStackParamList } from '../types';
import { useTheme } from '../../contexts/ThemeContext';

const HomeStack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeNavigator() {
  const { theme } = useTheme();

  return (
    <HomeStack.Navigator>
      {/* Main home screen - no header */}
      <HomeStack.Screen
        name="HomeMain"
        component={HomeScreen}
        options={{ headerShown: false }}
      />

      {/* PUSH NAVIGATION - Full screen as you requested */}
      <HomeStack.Screen
        name="ProviderProfile"
        component={ProviderProfileScreen}
        options={{
          title: 'Provider Profile',
          presentation: 'card', // Push navigation
          headerBackTitle: 'Home',
          headerStyle: {
            backgroundColor: theme.background,
          },
          headerTintColor: theme.text,
          headerTitleStyle: {
            color: theme.text,
          },
        }}
      />

      {/* PUSH NAVIGATION for BookmarkedProviders */}
      <HomeStack.Screen
        name="BookmarkedProviders"
        component={BookmarkedProvidersScreen}
        options={{
          title: 'Your Providers',
          presentation: 'card', // Push navigation
          headerBackTitle: 'Home',
          headerStyle: {
            backgroundColor: theme.background,
          },
          headerTintColor: theme.text,
          headerTitleStyle: {
            color: theme.text,
          },
        }}
      />

      {/* INSTANT NAVIGATION for Search - No animation */}
      <HomeStack.Screen
        name="Search"
        component={SearchScreen}
        options={{
          title: 'Find Your Cervice',
          animation: 'none',
          headerBackTitle: 'Back',
          headerTransparent: true,
          headerSearchBarOptions: {
            placeholder: 'Search providers...',
            hideWhenScrolling: false,
            autoCapitalize: 'none',
            placement: 'stacked',
          },
        }}
      />

      {/* PUSH NAVIGATION for Bookings - MOVED FROM MODAL */}
      <HomeStack.Screen
        name="Bookings"
        component={BookingsScreen}
        options={{
          title: 'My Bookings',
          presentation: 'card', // Push navigation
          headerBackTitle: 'Home',
          headerStyle: {
            backgroundColor: theme.background,
          },
          headerTintColor: theme.text,
          headerTitleStyle: {
            color: theme.text,
          },
        }}
      />

      {/* PUSH NAVIGATION for Cart */}
      <HomeStack.Screen
        name="CartMain"
        component={CartScreen}
        options={{
          title: 'Cart',
          presentation: 'card', // Push navigation
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

      {/* SWIPE-DOWN MODAL - Notifications (formSheet style on iOS) */}
      <HomeStack.Group screenOptions={{
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
        <HomeStack.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{
            headerShown: false,
          }}
        />
      </HomeStack.Group>
    </HomeStack.Navigator>
  );
}