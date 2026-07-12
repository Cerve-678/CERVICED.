import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProviderAccountScreen from '../../screens/ProviderAccountScreen';
import InfoRegScreen from '../../screens/InfoRegScreen';
import NotificationsScreen from '../../screens/NotificationsScreen';
import ProviderBookingHistoryScreen from '../../screens/ProviderBookingHistoryScreen';
import ProviderBookingDetailScreen from '../../screens/ProviderBookingDetailScreen';
import ProviderIntakeFormScreen from '../../screens/ProviderIntakeFormScreen';
import ProviderInboxScreen from '../../screens/ProviderInboxScreen';
import ProviderConversationScreen from '../../screens/ProviderConversationScreen';
import ChangePasswordScreen from '../../screens/ChangePasswordScreen';
import HelpCentreScreen from '../../screens/HelpCentreScreen';
import AboutScreen from '../../screens/AboutScreen';
import TermsScreen from '../../screens/TermsScreen';
import ReportProblemScreen from '../../screens/ReportProblemScreen';
import ProviderAnalyticsScreen from '../../screens/ProviderAnalyticsScreen';
import ProviderPromotionsScreen from '../../screens/ProviderPromotionsScreen';
import ProviderClienteleScreen from '../../screens/ProviderClienteleScreen';
import ProviderBusinessEmailScreen from '../../screens/ProviderBusinessEmailScreen';
import ProviderCommunicationsScreen from '../../screens/ProviderCommunicationsScreen';
import ProviderAutomationsScreen from '../../screens/ProviderAutomationsScreen';
import BusinessProfileScreen from '../../screens/BusinessProfileScreen';
import BrandingScreen from '../../screens/BrandingScreen';
import ProviderAccountInfoScreen from '../../screens/ProviderAccountInfoScreen';
import ProviderInfoPackScreen from '../../screens/ProviderInfoPackScreen';
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

      <ProviderAccountStack.Screen
        name="BusinessDetails"
        component={ProviderBusinessEmailScreen}
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
