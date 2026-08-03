import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import UserProfileScreen from '../../../screens/client/UserProfileScreen';
import ProviderProfileScreen from '../../../screens/client/ProviderProfileScreen';
import ProviderChatScreen from '../../../screens/client/ProviderChatScreen';
import MessagesScreen from '../../../screens/client/MessagesScreen';
import ProfileInfoScreen from '../../../screens/client/ProfileInfoScreen';
import BeautyProfileScreen from '../../../screens/client/BeautyProfileScreen';
import ChangePasswordScreen from '../../../screens/shared/ChangePasswordScreen';
import NotificationsSettingsScreen from '../../../screens/client/NotificationsSettingsScreen';
import PaymentMethodsScreen from '../../../screens/client/PaymentMethodsScreen';
import SubscriptionScreen from '../../../screens/client/SubscriptionScreen';
import HelpCentreScreen from '../../../screens/shared/HelpCentreScreen';
import AboutScreen from '../../../screens/shared/AboutScreen';
import TermsScreen from '../../../screens/shared/TermsScreen';
import ReportProblemScreen from '../../../screens/shared/ReportProblemScreen';
import PointsScreen from '../../../screens/client/PointsScreen';
import BookingsScreen from '../../../screens/client/BookingsScreen';
import BookingDetailScreen from '../../../screens/client/BookingDetailScreen';
import RescheduleScreen from '../../../screens/client/RescheduleScreen';
import ClientIntakeFormScreen from '../../../screens/client/ClientIntakeFormScreen';
import BookmarkedProvidersScreen from '../../../screens/client/BookmarkedProvidersScreen';
import NotificationsScreen from '../../../screens/shared/NotificationsScreen';
import CartScreen from '../../../screens/client/CartScreen';
import DevSettingsScreen from '../../../screens/shared/DevSettingsScreen';
import InfoRegScreen from '../../../screens/shared/InfoRegScreen';
import { ProfileStackParamList } from '../../types';
import { useTheme } from '../../../contexts/ThemeContext';

const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileNavigator() {
  const { theme } = useTheme();

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
        name="About"
        component={AboutScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="Terms"
        component={TermsScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="ReportProblem"
        component={ReportProblemScreen}
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
            fontFamily: 'BakbakOne',
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
        options={{ headerShown: false, presentation: 'card' }}
      />

      <ProfileStack.Screen
        name="Reschedule"
        component={RescheduleScreen}
        options={{ headerShown: false, presentation: 'card' }}
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
