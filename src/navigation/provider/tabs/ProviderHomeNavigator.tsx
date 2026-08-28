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
import AddBookingScreen from '../../../screens/provider/AddBookingScreen';
import InfoRegScreen from '../../../screens/provider/InfoRegScreen';
import BrandingScreen from '../../../screens/provider/BrandingScreen';
import { ProviderHomeStackParamList } from '../../types';
import { useTheme } from '../../../contexts/ThemeContext';

const ProviderHomeStack = createNativeStackNavigator<ProviderHomeStackParamList>();

const InfoRegComponent = InfoRegScreen as React.ComponentType<any>;

export default function ProviderHomeNavigator() {
  const { theme } = useTheme();

  return (
    <ProviderHomeStack.Navigator>
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
        name="ProviderConversation"
        component={ProviderConversationScreen}
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
