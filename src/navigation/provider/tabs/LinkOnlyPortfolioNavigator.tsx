import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LinkOnlyPortfolioScreen from '../../../screens/provider/LinkOnlyPortfolioScreen';
import ProviderProfileScreen from '../../../screens/client/ProviderProfileScreen';
import { LinkOnlyPortfolioStackParamList } from '../../types';

const Stack = createNativeStackNavigator<LinkOnlyPortfolioStackParamList>();

/** Link-only providers' Portfolio tab (see ProviderTabNavigator). */
export default function LinkOnlyPortfolioNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="LinkOnlyPortfolioMain" component={LinkOnlyPortfolioScreen} options={{ headerShown: false }} />
      {/* The preview card at the top of Portfolio opens this. ProviderProfileScreen
          already knows when its owner is looking (no Book for yourself). */}
      <Stack.Screen name="MyPublicProfile" component={ProviderProfileScreen as React.ComponentType<any>} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
