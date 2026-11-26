import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CartScreen from '../../../screens/client/CartScreen';
import BookingDetailScreen from '../../../screens/client/BookingDetailScreen';
import { BOOKING_DETAIL_OPTIONS } from '../bookingDetailOptions';
import ExternalBookingDetailScreen from '../../../screens/client/ExternalBookingDetailScreen';
import RescheduleScreen from '../../../screens/client/RescheduleScreen';
import ProviderProfileScreen from '../../../screens/client/ProviderProfileScreen';
import ProviderChatScreen from '../../../screens/client/ProviderChatScreen';
import BookingsScreen from '../../../screens/client/BookingsScreen';
import ActivityCentreScreen from '../../../screens/client/ActivityCentreScreen';
import ClientIntakeFormScreen from '../../../screens/client/ClientIntakeFormScreen';
import NotificationsScreen from '../../../screens/shared/NotificationsScreen';
import { CartStackParamList } from '../../types';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../contexts/ThemeContext';

const CartStack = createNativeStackNavigator<CartStackParamList>();

export default function CartNavigator() {
  const { theme } = useTheme();
  const { t } = useTranslation();

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
        headerBackTitle: t('common.back'),
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
        options={{ headerShown: true, presentation: 'card', headerBackTitle: t('common.back') }}
      />

      <CartStack.Screen
        name="ProviderProfile"
        component={ProviderProfileScreen}
        // Same as the other tabs' ProviderProfile. The stack-wide frosted
        // blur above must not apply here: the profile's header is see-through
        // so the cover photo shows behind it.
        options={{
          title: t('shared.nav.providerProfile'),
          presentation: 'card',
          headerBackTitle: t('shared.nav.cart'),
          headerBlurEffect: undefined,
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerTitleStyle: { color: theme.text },
        }}
      />
      
      <CartStack.Screen
        name="Bookings"
        component={BookingsScreen}
        options={{
          title: t('shared.nav.trackAppointment'),
          presentation: 'card',
          headerBackTitle: t('shared.nav.cart'),
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
        name="ActivityCentre"
        component={ActivityCentreScreen}
        options={{
          title: t('profile.forYou.activity.title'),
          presentation: 'card',
          headerTransparent: false,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
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
        // Set here, not only in the screen's own setOptions, so the first
        // frame of the push has no back-button text or route-name title.
        options={BOOKING_DETAIL_OPTIONS}
      />
      <CartStack.Screen
        name="ExternalBookingDetail"
        component={ExternalBookingDetailScreen}
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
          title: t('shared.nav.notifications'),
          presentation: 'formSheet',
          headerShown: false,
          headerBackTitle: t('common.close'),
        }}
      />

    </CartStack.Navigator>
  );
}
