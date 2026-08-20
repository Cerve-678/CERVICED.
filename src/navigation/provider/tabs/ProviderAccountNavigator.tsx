import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProviderAccountScreen from '../../../screens/provider/ProviderAccountScreen';
import InfoRegScreen from '../../../screens/provider/InfoRegScreen';
import NotificationsScreen from '../../../screens/shared/NotificationsScreen';
import ProviderBookingHistoryScreen from '../../../screens/provider/ProviderBookingHistoryScreen';
import ProviderBookingDetailScreen from '../../../screens/provider/ProviderBookingDetailScreen';
import ProviderIntakeFormScreen from '../../../screens/provider/ProviderIntakeFormScreen';
import ProviderInboxScreen from '../../../screens/provider/ProviderInboxScreen';
import ProviderConversationScreen from '../../../screens/provider/ProviderConversationScreen';
import ChangePasswordScreen from '../../../screens/shared/ChangePasswordScreen';
import HelpCentreScreen from '../../../screens/shared/HelpCentreScreen';
import AboutScreen from '../../../screens/shared/AboutScreen';
import TermsScreen from '../../../screens/shared/TermsScreen';
import ReportProblemScreen from '../../../screens/shared/ReportProblemScreen';
import ProviderAnalyticsScreen from '../../../screens/provider/ProviderAnalyticsScreen';
import ProviderPromotionsScreen from '../../../screens/provider/ProviderPromotionsScreen';
import ProviderClienteleScreen from '../../../screens/provider/ProviderClienteleScreen';
import ProviderScheduleScreen from '../../../screens/provider/ProviderScheduleScreen';
import AddBookingScreen from '../../../screens/provider/AddBookingScreen';
import BusinessDetailsScreen from '../../../screens/provider/BusinessDetailsScreen';
import BusinessInfoScreen from '../../../screens/provider/BusinessInfoScreen';
import ServicesPricingScreen from '../../../screens/provider/ServicesPricingScreen';
import AboutYouScreen from '../../../screens/provider/AboutYouScreen';
import SchedulingScreen from '../../../screens/provider/SchedulingScreen';
import PaymentsScreen from '../../../screens/provider/PaymentsScreen';
import PoliciesScreen from '../../../screens/provider/PoliciesScreen';
import ProviderCommunicationsScreen from '../../../screens/provider/ProviderCommunicationsScreen';
import ProviderAutomationsScreen from '../../../screens/provider/ProviderAutomationsScreen';
import BusinessProfileScreen from '../../../screens/provider/BusinessProfileScreen';
import BrandingScreen from '../../../screens/provider/BrandingScreen';
import ProviderAccountInfoScreen from '../../../screens/provider/ProviderAccountInfoScreen';
import ProviderInfoPackScreen from '../../../screens/provider/ProviderInfoPackScreen';
import DevSettingsScreen from '../../../screens/shared/DevSettingsScreen';
import { ProviderAccountStackParamList } from '../../types';

const ProviderAccountStack = createNativeStackNavigator<ProviderAccountStackParamList>();

const InfoRegComponent = InfoRegScreen as React.ComponentType<any>;

export default function ProviderAccountNavigator() {

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
        name="BookingHistory"
        component={ProviderBookingHistoryScreen}
        options={{ headerShown: false }}
      />

      <ProviderAccountStack.Screen
        name="BookingDetail"
        component={ProviderBookingDetailScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />

      <ProviderAccountStack.Screen
        name="ProviderIntakeForm"
        component={ProviderIntakeFormScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />

      <ProviderAccountStack.Screen
        name="ProviderInbox"
        component={ProviderInboxScreen}
        options={{ headerShown: false }}
      />

      <ProviderAccountStack.Screen
        name="ProviderConversation"
        component={ProviderConversationScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />

      <ProviderAccountStack.Screen
        name="Analytics"
        component={ProviderAnalyticsScreen}
        options={{ headerShown: false }}
      />

      <ProviderAccountStack.Screen
        name="Promotions"
        component={ProviderPromotionsScreen}
        options={{ headerShown: false }}
      />

      <ProviderAccountStack.Screen
        name="Clientele"
        component={ProviderClienteleScreen}
        options={{ headerShown: false }}
      />

      <ProviderAccountStack.Screen
        name="ProviderSchedule"
        component={ProviderScheduleScreen}
        options={{ headerShown: false }}
      />

      <ProviderAccountStack.Screen
        name="AddBooking"
        component={AddBookingScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />

      <ProviderAccountStack.Screen
        name="InfoPacks"
        component={ProviderInfoPackScreen}
        options={{ headerShown: false }}
      />

      <ProviderAccountStack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ headerShown: false }}
      />

      <ProviderAccountStack.Screen
        name="AccountInfo"
        component={ProviderAccountInfoScreen}
        options={{ headerShown: false }}
      />

      {/* Business Details is a hub; the sub-screens below each own a slice of
          what used to be one 671-line screen. Scheduling and Payments were
          added later, consolidating settings that had spread across
          ServicesPricing and Automations. */}
      <ProviderAccountStack.Screen
        name="BusinessDetails"
        component={BusinessDetailsScreen}
        options={{ headerShown: false }}
      />

      <ProviderAccountStack.Screen
        name="BusinessInfo"
        component={BusinessInfoScreen}
        options={{ headerShown: false }}
      />

      <ProviderAccountStack.Screen
        name="ServicesPricing"
        component={ServicesPricingScreen}
        options={{ headerShown: false }}
      />

      <ProviderAccountStack.Screen
        name="AboutYou"
        component={AboutYouScreen}
        options={{ headerShown: false }}
      />

      <ProviderAccountStack.Screen
        name="Scheduling"
        component={SchedulingScreen}
        options={{ headerShown: false }}
      />

      <ProviderAccountStack.Screen
        name="Payments"
        component={PaymentsScreen}
        options={{ headerShown: false }}
      />

      <ProviderAccountStack.Screen
        name="Policies"
        component={PoliciesScreen}
        options={{ headerShown: false }}
      />

      <ProviderAccountStack.Screen
        name="Communications"
        component={ProviderCommunicationsScreen}
        options={{ headerShown: false }}
      />

      <ProviderAccountStack.Screen
        name="Automations"
        component={ProviderAutomationsScreen}
        options={{ headerShown: false }}
      />

      <ProviderAccountStack.Screen
        name="BusinessProfile"
        component={BusinessProfileScreen}
        options={{ headerShown: false }}
      />

      <ProviderAccountStack.Screen
        name="Branding"
        component={BrandingScreen}
        options={{ headerShown: false }}
      />

      <ProviderAccountStack.Screen
        name="HelpCentre"
        component={HelpCentreScreen}
        options={{ headerShown: false }}
      />

      <ProviderAccountStack.Screen
        name="About"
        component={AboutScreen}
        options={{ headerShown: false }}
      />

      <ProviderAccountStack.Screen
        name="Terms"
        component={TermsScreen}
        options={{ headerShown: false }}
      />

      <ProviderAccountStack.Screen
        name="ReportProblem"
        component={ReportProblemScreen}
        options={{ headerShown: false }}
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
