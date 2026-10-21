import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../../../screens/client/HomeScreen';
import BookingDetailScreen from '../../../screens/client/BookingDetailScreen';
import ExternalBookingDetailScreen from '../../../screens/client/ExternalBookingDetailScreen';
import RescheduleScreen from '../../../screens/client/RescheduleScreen';
import ProviderProfileScreen from '../../../screens/client/ProviderProfileScreen';
import ProviderChatScreen from '../../../screens/client/ProviderChatScreen';
import SearchScreen from '../../../screens/client/SearchScreen';
import BookingsScreen from '../../../screens/client/BookingsScreen';
import BookmarkedProvidersScreen from '../../../screens/client/BookmarkedProvidersScreen';
import NotificationsScreen from '../../../screens/shared/NotificationsScreen';
import CartScreen from '../../../screens/client/CartScreen';
import ClientIntakeFormScreen from '../../../screens/client/ClientIntakeFormScreen';
import DevSettingsScreen from '../../../screens/shared/DevSettingsScreen';
import OffersScreen from '../../../screens/client/OffersScreen';
import { HomeStackParamList } from '../../types';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../contexts/ThemeContext';

const HomeStack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeNavigator() {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <HomeStack.Navigator>
      {/* Main home screen - no header */}
      <HomeStack.Screen
        name="HomeMain"
        component={HomeScreen}
        options={{ headerShown: false }}
      />

      <HomeStack.Screen
        name="ProviderChat"
        component={ProviderChatScreen}
        options={{ headerShown: true, presentation: 'card', headerBackTitle: t('common.back') }}
      />

      {/* PUSH NAVIGATION - Full screen as you requested */}
      <HomeStack.Screen
        name="ProviderProfile"
        component={ProviderProfileScreen}
        options={{
          title: t('shared.nav.providerProfile'),
          presentation: 'card', // Push navigation
          headerBackTitle: t('shared.nav.home'),
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
          title: t('shared.nav.yourProviders'),
          presentation: 'card', // Push navigation
          headerBackTitle: t('shared.nav.home'),
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
          title: t('shared.nav.findYourCervice'),
          animation: 'none',
          headerBackTitle: t('common.back'),
          headerTransparent: true,
          headerSearchBarOptions: {
            placeholder: t('shared.nav.searchProvidersPlaceholder'),
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
          title: t('shared.nav.trackAppointment'),
          presentation: 'card',
          headerBackTitle: t('shared.nav.home'),
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

      {/* PUSH NAVIGATION for Cart — CartScreen renders its own header, so the
          native stack header must stay hidden (matches CartNavigator's CartMain). */}
      <HomeStack.Screen
        name="CartMain"
        component={CartScreen}
        options={{
          presentation: 'card', // Push navigation
          headerShown: false,
        }}
      />

      <HomeStack.Screen
        name="ClientIntakeForm"
        component={ClientIntakeFormScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />

      <HomeStack.Screen
        name="Offers"
        component={OffersScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />

      <HomeStack.Screen
        name="BookingDetail"
        component={BookingDetailScreen}
        options={{ headerShown: true, presentation: 'card' }}
      />
      <HomeStack.Screen
        name="ExternalBookingDetail"
        component={ExternalBookingDetailScreen}
        options={{ headerShown: true, presentation: 'card' }}
      />

      <HomeStack.Screen
        name="Reschedule"
        component={RescheduleScreen}
        options={{ headerShown: true, presentation: 'card' }}
      />

      {/* SWIPE-DOWN MODAL - Notifications (formSheet style on iOS) */}
      <HomeStack.Group screenOptions={{
        presentation: 'modal',
        headerBackTitle: t('common.close'),
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

        {/* Developer Settings - Modal presentation */}
        <HomeStack.Screen
          name="DevSettings"
          component={DevSettingsScreen}
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
      </HomeStack.Group>
    </HomeStack.Navigator>
  );
}
