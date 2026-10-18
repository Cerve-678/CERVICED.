import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LinkOnlyPortfolioScreen from '../../../screens/provider/LinkOnlyPortfolioScreen';
import { LinkOnlyPortfolioStackParamList } from '../../types';

const Stack = createNativeStackNavigator<LinkOnlyPortfolioStackParamList>();

/** Link-only providers' Portfolio tab (see ProviderTabNavigator). */
export default function LinkOnlyPortfolioNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="LinkOnlyPortfolioMain" component={LinkOnlyPortfolioScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
