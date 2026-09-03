import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProviderMyProfileScreen from '../../../screens/provider/ProviderMyProfileScreen';
import InfoRegScreen from '../../../screens/provider/InfoRegScreen';
import ProviderIntakeFormScreen from '../../../screens/provider/ProviderIntakeFormScreen';
import ProviderPromotionsScreen from '../../../screens/provider/ProviderPromotionsScreen';
import ProviderClienteleScreen from '../../../screens/provider/ProviderClienteleScreen';
import ProviderInfoPackScreen from '../../../screens/provider/ProviderInfoPackScreen';
import ProviderConversationScreen from '../../../screens/provider/ProviderConversationScreen';
import ProviderScheduleScreen from '../../../screens/provider/ProviderScheduleScreen';
import PoliciesScreen from '../../../screens/provider/PoliciesScreen';
import PaymentsScreen from '../../../screens/provider/PaymentsScreen';
import BrandingScreen from '../../../screens/provider/BrandingScreen';
import ProviderAnalyticsScreen from '../../../screens/provider/ProviderAnalyticsScreen';
import AddBookingScreen from '../../../screens/provider/AddBookingScreen';
import DevSettingsScreen from '../../../screens/shared/DevSettingsScreen';
import { ProviderServicesStackParamList } from '../../types';

const ProviderServicesStack = createNativeStackNavigator<ProviderServicesStackParamList>();

// InfoRegScreen was originally typed for ProfileStackParamList but works
// identically here — it only uses navigation.goBack() and local state
const InfoRegComponent = InfoRegScreen as React.ComponentType<any>;

export default function ProviderServicesNavigator() {

  return (
    <ProviderServicesStack.Navigator>
      <ProviderServicesStack.Screen
        name="ProviderServicesMain"
        component={ProviderMyProfileScreen}
        options={{ headerShown: false }}
      />

      <ProviderServicesStack.Screen
        name="EditProfile"
        component={InfoRegComponent}
        options={{
          headerShown: false,
          presentation: 'card',
        }}
      />

      {/* Reached from EditProfile's "Your Terms & Conditions" card. Registered
          HERE as well as on the Home/Account stacks so that tap PUSHES within
          this stack, leaving the profile editor underneath for back — same
          reasoning as Policies below. */}
      <ProviderServicesStack.Screen
        name="ProviderIntakeForm"
        component={ProviderIntakeFormScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />

      <ProviderServicesStack.Screen
        name="Promotions"
        component={ProviderPromotionsScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />
      <ProviderServicesStack.Screen
        name="Clientele"
        component={ProviderClienteleScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />
      <ProviderServicesStack.Screen
        name="InfoPacks"
        component={ProviderInfoPackScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />

      {/* Reached from Clientele's Message button. Registered HERE (as well as
          on the Home/Becca/Account stacks) so that tap PUSHES within this
          stack, leaving Clientele underneath for back. */}
      <ProviderServicesStack.Screen
        name="ProviderConversation"
        component={ProviderConversationScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />

      {/* Reached from the availability card on the provider's own profile.
          Registered HERE (as well as on the Home/Becca stacks) so that tap
          PUSHES within this stack — a cross-tab navigate would land the
          schedule at a fresh tab root and its back button would fire an
          unhandled GO_BACK, the same trap documented on the Home stack. */}
      <ProviderServicesStack.Screen
        name="ProviderSchedule"
        component={ProviderScheduleScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />

      {/* Reached from the dashboard's Booking policies and Branding cards.
          Registered HERE as well as on the Account stack for the same reason
          as ProviderSchedule above — a cross-tab navigate would land these at
          a fresh tab root and their back button would fire an unhandled
          GO_BACK. */}
      <ProviderServicesStack.Screen
        name="Policies"
        component={PoliciesScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />

      <ProviderServicesStack.Screen
        name="Payments"
        component={PaymentsScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />

      <ProviderServicesStack.Screen
        name="Branding"
        component={BrandingScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />

      {/* Reached from the dashboard's saved-by-clients tile. Third stack to
          register it (Becca and Account have their own) for the same reason as
          Policies above. */}
      <ProviderServicesStack.Screen
        name="Analytics"
        component={ProviderAnalyticsScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />

      <ProviderServicesStack.Screen
        name="AddBooking"
        component={AddBookingScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />

      <ProviderServicesStack.Screen
        name="DevSettings"
        component={DevSettingsScreen}
        options={{
          headerShown: false,
          presentation: 'modal',
        }}
      />
    </ProviderServicesStack.Navigator>
  );
}
