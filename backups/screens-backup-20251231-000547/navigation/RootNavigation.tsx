import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import TabNavigation from './TabNavigator';
import { CartProvider } from '../contexts/CartContext';
import { BookingProvider } from '../contexts/BookingContext';
import { RootStackParamList } from './types';
import DevSettingsScreen from '../screens/DevSettingsScreen';


const Stack = createStackNavigator<RootStackParamList>();

export default function RootNavigation() {
  return (
    <CartProvider>
      <BookingProvider>
        <NavigationContainer>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              cardStyle: { backgroundColor: 'transparent' },
              cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
              gestureEnabled: true,
              gestureDirection: 'horizontal',
            }}
            initialRouteName="MainTabs"
          >
            <Stack.Screen
              name="MainTabs"
              component={TabNavigation}
              options={{
                cardStyle: { backgroundColor: '#F5E6FA' },
              }}
            />

            {/* Add future app-wide modals here if needed */}
            <Stack.Screen
              name="DevSettings"
              component={DevSettingsScreen}
              options={{
                headerShown: false,
                presentation: 'modal', // Makes it slide up like a modal
              }}
            />
            {/* Example:
          <Stack.Screen
            name="GlobalSearch"
            component={GlobalSearchScreen}
            options={{
              presentation: 'modal',
              headerShown: true,
              title: 'Search',
            }}
          />
          */}
          </Stack.Navigator>
        </NavigationContainer>
      </BookingProvider>
    </CartProvider>
  );
}
