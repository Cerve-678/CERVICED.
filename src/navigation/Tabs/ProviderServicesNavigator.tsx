import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProviderMyProfileScreen from '../../screens/ProviderMyProfileScreen';
import InfoRegScreen from '../../screens/InfoRegScreen';
import ProviderPromotionsScreen from '../../screens/ProviderPromotionsScreen';
import ProviderClienteleScreen from '../../screens/ProviderClienteleScreen';
import ProviderInfoPackScreen from '../../screens/ProviderInfoPackScreen';
import DevSettingsScreen from '../../screens/DevSettingsScreen';
import { ProviderServicesStackParamList } from '../types';
import { useTheme } from '../../contexts/ThemeContext';

const ProviderServicesStack = createNativeStackNavigator<ProviderServicesStackParamList>();

// InfoRegScreen was originally typed for ProfileStackParamList but works
// identically here — it only uses navigation.goBack() and local state
const InfoRegComponent = InfoRegScreen as React.ComponentType<any>;

export default function ProviderServicesNavigator() {
  const { theme } = useTheme();

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
