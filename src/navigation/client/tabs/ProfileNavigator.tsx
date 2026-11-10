import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import UserProfileScreen from '../../../screens/client/UserProfileScreen';
import ProviderProfileScreen from '../../../screens/client/ProviderProfileScreen';
import ProviderChatScreen from '../../../screens/client/ProviderChatScreen';
import MessagesScreen from '../../../screens/client/MessagesScreen';
import ProfileInfoScreen from '../../../screens/client/ProfileInfoScreen';
import BeautyProfileScreen from '../../../screens/client/BeautyProfileScreen';
import CircleScreen from '../../../screens/client/CircleScreen';
import ChangePasswordScreen from '../../../screens/shared/ChangePasswordScreen';
import NotificationsSettingsScreen from '../../../screens/client/NotificationsSettingsScreen';
import PaymentMethodsScreen from '../../../screens/client/PaymentMethodsScreen';
import SubscriptionScreen from '../../../screens/client/SubscriptionScreen';
import HelpCentreScreen from '../../../screens/shared/HelpCentreScreen';
import TextSizingScreen from '../../../screens/shared/TextSizingScreen';
import LanguageRegionScreen from '../../../screens/shared/LanguageRegionScreen';
import ReportProblemScreen from '../../../screens/shared/ReportProblemScreen';
import AdminDashboardScreen from '../../../screens/shared/AdminDashboardScreen';
import AdminMoneyScreen from '../../../screens/shared/AdminMoneyScreen';
import AdminCreateAccountScreen from '../../../screens/shared/AdminCreateAccountScreen';
import AdminCreatedAccountsScreen from '../../../screens/shared/AdminCreatedAccountsScreen';
import PointsScreen from '../../../screens/client/PointsScreen';
import BookingsScreen from '../../../screens/client/BookingsScreen';
import ActivityCentreScreen from '../../../screens/client/ActivityCentreScreen';
import BookingDetailScreen from '../../../screens/client/BookingDetailScreen';
import { BOOKING_DETAIL_OPTIONS } from '../bookingDetailOptions';
import ExternalBookingDetailScreen from '../../../screens/client/ExternalBookingDetailScreen';
import RescheduleScreen from '../../../screens/client/RescheduleScreen';
import ClientIntakeFormScreen from '../../../screens/client/ClientIntakeFormScreen';
import BookmarkedProvidersScreen from '../../../screens/client/BookmarkedProvidersScreen';
import NotificationsScreen from '../../../screens/shared/NotificationsScreen';
import CartScreen from '../../../screens/client/CartScreen';
import DevSettingsScreen from '../../../screens/shared/DevSettingsScreen';
import InfoRegScreen from '../../../screens/provider/InfoRegScreen';
import { ProfileStackParamList } from '../../types';
import { useTheme } from '../../../contexts/ThemeContext';

const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileNavigator() {
  const { theme, palette } = useTheme();

  return (
    <ProfileStack.Navigator>
      <ProfileStack.Screen
        name="ProfileMain"
        component={UserProfileScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="ProfileInfo"
        component={ProfileInfoScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="BeautyProfile"
        component={BeautyProfileScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="Circle"
        component={CircleScreen}
        options={{
          title: 'Your circle',
          presentation: 'card',
          headerBackTitle: 'Back',
          headerShadowVisible: false,
          // palette.bg is what ThemedBackground paints, so the header and
          // the screen read as one surface (theme.background differs).
          headerStyle: { backgroundColor: palette.bg },
          headerTintColor: palette.text,
          headerTitleStyle: { fontFamily: 'JosefinSans-Bold', fontSize: 20, color: palette.text },
        }}
      />
      <ProfileStack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="NotificationsSettings"
        component={NotificationsSettingsScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="PaymentMethods"
        component={PaymentMethodsScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="Subscription"
        component={SubscriptionScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="HelpCentre"
        component={HelpCentreScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="TextSizing"
        component={TextSizingScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="LanguageRegion"
        component={LanguageRegionScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="ReportProblem"
        component={ReportProblemScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="AdminDashboard"
        component={AdminDashboardScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="AdminMoney"
        component={AdminMoneyScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="AdminCreateAccount"
        component={AdminCreateAccountScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="AdminCreatedAccounts"
        component={AdminCreatedAccountsScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="Points"
        component={PointsScreen}
        options={{ headerShown: false }}
      />

      <ProfileStack.Screen
        name="ProviderChat"
        component={ProviderChatScreen}
        options={{ headerShown: true, presentation: 'card', headerBackTitle: 'Back' }}
      />

      <ProfileStack.Screen
        name="Messages"
        component={MessagesScreen}
        options={{ headerShown: true, title: 'Messages', headerBackTitle: 'Back' }}
      />

      <ProfileStack.Screen
        name="ProviderProfile"
        component={ProviderProfileScreen}
        options={{
          title: 'Provider Profile',
          presentation: 'card',
          headerBackTitle: 'Profile',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerTitleStyle: { color: theme.text },
        }}
      />

      {/* CartScreen renders its own header, so the native stack header must
          stay hidden (matches CartNavigator's CartMain). */}
      <ProfileStack.Screen
        name="CartMain"
        component={CartScreen}
        options={{
          presentation: 'card',
          headerShown: false,
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
            fontFamily: 'JosefinSans-Bold',
            fontSize: 22,
            color: theme.text,
          },
          headerTintColor: theme.text,
        }}
      />

      <ProfileStack.Screen
        name="ActivityCentre"
        component={ActivityCentreScreen}
        options={{
          title: 'Activity Centre',
          presentation: 'card',
          headerTransparent: false,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          headerTitleStyle: {
            fontFamily: 'JosefinSans-Bold',
            fontSize: 22,
            color: theme.text,
          },
          headerTintColor: theme.text,
        }}
      />

      <ProfileStack.Screen
        name="ClientIntakeForm"
        component={ClientIntakeFormScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />

      <ProfileStack.Screen
        name="BookingDetail"
        component={BookingDetailScreen}
        // Set here, not only in the screen's own setOptions, so the first
        // frame of the push has no back-button text or route-name title.
        options={BOOKING_DETAIL_OPTIONS}
      />
      <ProfileStack.Screen
        name="ExternalBookingDetail"
        component={ExternalBookingDetailScreen}
        options={{ headerShown: true, presentation: 'card' }}
      />

      <ProfileStack.Screen
        name="Reschedule"
        component={RescheduleScreen}
        options={{ headerShown: true, presentation: 'card' }}
      />

      <ProfileStack.Screen
        name="BookmarkedProviders"
        component={BookmarkedProvidersScreen}
        options={{
          title: 'Saved Providers',
          presentation: 'card',
          headerShown: false,
        }}
      />

      <ProfileStack.Group screenOptions={{
        presentation: 'fullScreenModal',
        headerBackTitle: 'Close',
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
      }}>
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
          // @ts-ignore
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
