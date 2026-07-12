import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProviderHomeScreen from '../../screens/ProviderHomeScreen';
import ProviderBookingDetailScreen from '../../screens/ProviderBookingDetailScreen';
import ProviderIntakeFormScreen from '../../screens/ProviderIntakeFormScreen';
import NotificationsScreen from '../../screens/NotificationsScreen';
import ProviderInboxScreen from '../../screens/ProviderInboxScreen';
import ProviderConversationScreen from '../../screens/ProviderConversationScreen';
import ProviderPromotionsScreen from '../../screens/ProviderPromotionsScreen';
import ProviderClienteleScreen from '../../screens/ProviderClienteleScreen';
import ProviderInfoPackScreen from '../../screens/ProviderInfoPackScreen';
import DevSettingsScreen from '../../screens/DevSettingsScreen';
import ProviderScheduleScreen from '../../screens/ProviderScheduleScreen';
import { ProviderHomeStackParamList } from '../types';
import { useTheme } from '../../contexts/ThemeContext';

const ProviderHomeStack = createNativeStackNavigator<ProviderHomeStackParamList>();

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

      <ProviderHomeStack.Screen
        name="ProviderConversation"
        component={ProviderConversationScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />

      <ProviderHomeStack.Screen
        name="ProviderSchedule"
        component={ProviderScheduleScreen}
        options={{
          headerShown: false,
          presentation: 'formSheet',
          // Cap the sheet below full screen so Save Hours sits near the
          // bottom instead of being stranded mid-screen on a full sheet.
          sheetAllowedDetents: [0.75],
          // formSheet can present slightly taller than the screen's own
          // content — whatever peeks out below shows this color, so it must
          // track the screen's actual (theme-aware) background, not a fixed
          // one, or a mismatched strip shows at the bottom of the sheet.
          contentStyle: { backgroundColor: theme.background },
        }}
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
      </ProviderHomeStack.Group>
    </ProviderHomeStack.Navigator>
  );
}
