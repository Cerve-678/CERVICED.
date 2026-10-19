import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProviderHomeScreen from '../../../screens/provider/ProviderHomeScreen';
import ProviderBookingDetailScreen from '../../../screens/provider/ProviderBookingDetailScreen';
import ProviderIntakeFormScreen from '../../../screens/provider/ProviderIntakeFormScreen';
import NotificationsScreen from '../../../screens/shared/NotificationsScreen';
import ProviderInboxScreen from '../../../screens/provider/ProviderInboxScreen';
import ProviderConversationScreen from '../../../screens/provider/ProviderConversationScreen';
import ProviderPromotionsScreen from '../../../screens/provider/ProviderPromotionsScreen';
import ProviderClienteleScreen from '../../../screens/provider/ProviderClienteleScreen';
import ProviderInfoPackScreen from '../../../screens/provider/ProviderInfoPackScreen';
import DevSettingsScreen from '../../../screens/shared/DevSettingsScreen';
import ProviderScheduleScreen from '../../../screens/provider/ProviderScheduleScreen';
import ProviderBookingHistoryScreen from '../../../screens/provider/ProviderBookingHistoryScreen';
import AddBookingScreen from '../../../screens/provider/AddBookingScreen';
import InfoRegScreen from '../../../screens/provider/InfoRegScreen';
import BrandingScreen from '../../../screens/provider/BrandingScreen';
import PoliciesScreen from '../../../screens/provider/PoliciesScreen';
import BusinessInfoScreen from '../../../screens/provider/BusinessInfoScreen';
import PaymentsScreen from '../../../screens/provider/PaymentsScreen';
import LinkOnlyHomeScreen from '../../../screens/provider/LinkOnlyHomeScreen';
import LinkOnlyAnalyticsScreen from '../../../screens/provider/LinkOnlyAnalyticsScreen';
import ProviderBeccaNavigator from './ProviderBeccaNavigator';
import { ProviderHomeStackParamList } from '../../types';
import { useTheme } from '../../../contexts/ThemeContext';

const ProviderHomeStack = createNativeStackNavigator<ProviderHomeStackParamList>();

const InfoRegComponent = InfoRegScreen as React.ComponentType<any>;

/**
 * `linkOnly` — a link-only provider (booking_mode 'external') has no booking
 * calendar, so their Home starts on LinkOnlyHomeMain. The rest of the stack
 * is shared; the link-only Home only pushes the screens that apply to them.
 */
export default function ProviderHomeNavigator({ linkOnly = false }: { linkOnly?: boolean }) {
  const { theme } = useTheme();

  return (
    <ProviderHomeStack.Navigator initialRouteName={linkOnly ? 'LinkOnlyHomeMain' : 'ProviderHomeMain'}>
      <ProviderHomeStack.Screen
        name="LinkOnlyHomeMain"
        component={LinkOnlyHomeScreen}
        options={{ headerShown: false }}
      />
      <ProviderHomeStack.Screen
        name="LinkOnlyAnalytics"
        component={LinkOnlyAnalyticsScreen}
        options={{ headerShown: false }}
      />
      {/* Link-only providers have no Becca tab, so Becca is pushed from
          their Home as its own stack. */}
      <ProviderHomeStack.Screen
        name="BeccaStack"
        component={ProviderBeccaNavigator}
        options={{ headerShown: false }}
      />
      <ProviderHomeStack.Screen
        name="ProviderHomeMain"
        component={ProviderHomeScreen}
        options={{ headerShown: false }}
      />

      <ProviderHomeStack.Screen
        name="BookingDetail"
        component={ProviderBookingDetailScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />

      <ProviderHomeStack.Screen
        name="ProviderIntakeForm"
        component={ProviderIntakeFormScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />

      <ProviderHomeStack.Screen
        name="Promotions"
        component={ProviderPromotionsScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />
      <ProviderHomeStack.Screen
        name="Clientele"
        component={ProviderClienteleScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />
      <ProviderHomeStack.Screen
        name="InfoPacks"
        component={ProviderInfoPackScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />

      <ProviderHomeStack.Screen
        name="ProviderInbox"
        component={ProviderInboxScreen}
        options={{ headerShown: false }}
      />

      {/* Reached from this screen's profile quick-actions. Registered here so
          those actions push onto the Home stack (leaving ProviderHomeMain
          beneath) rather than jumping to the Profile tab root, where the
          back/save button had no route to return to. */}
      <ProviderHomeStack.Screen
        name="EditProfile"
        component={InfoRegComponent}
        options={{ headerShown: false, presentation: 'fullScreenModal' }}
      />

      <ProviderHomeStack.Screen
        name="Branding"
        component={BrandingScreen}
        options={{ headerShown: false }}
      />

      <ProviderHomeStack.Screen
        name="Policies"
        component={PoliciesScreen}
        options={{ headerShown: false }}
      />

      <ProviderHomeStack.Screen
        name="BusinessInfo"
        component={BusinessInfoScreen}
        options={{ headerShown: false }}
      />

      <ProviderHomeStack.Screen
        name="Payments"
        component={PaymentsScreen}
        options={{ headerShown: false }}
      />

      <ProviderHomeStack.Screen
        name="ProviderConversation"
        component={ProviderConversationScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />

      {/* Reached from the "Today's Schedule" notification. A plain push, not
          part of the modal group below — the list is a regular screen in the
          Calendar stack, not a transient overlay. */}
      <ProviderHomeStack.Screen
        name="BookingHistory"
        component={ProviderBookingHistoryScreen}
        options={{ headerShown: false, presentation: 'card' }}
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
        <ProviderHomeStack.Screen
          name="ProviderSchedule"
          component={ProviderScheduleScreen}
          options={{ headerShown: false }}
        />
        <ProviderHomeStack.Screen
          name="AddBooking"
          component={AddBookingScreen}
          options={{ headerShown: false }}
        />
      </ProviderHomeStack.Group>
    </ProviderHomeStack.Navigator>
  );
}
