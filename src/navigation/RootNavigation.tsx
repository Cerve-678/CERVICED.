import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import TabNavigation from './TabNavigator';
import ProviderTabNavigation from './ProviderTabNavigator';
import { RootStackParamList } from './types';
import { useAuth } from '../contexts/AuthContext';

// Auth screens
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SignUpStep1Screen from '../screens/auth/SignUpStep1Screen';
import SignUpStep2Screen from '../screens/auth/SignUpStep2Screen';
import SignUpStep3Screen from '../screens/auth/SignUpStep3Screen';
import SignUpStep4Screen from '../screens/auth/SignUpStep4Screen';

const Stack = createStackNavigator<RootStackParamList>();

export default function RootNavigation() {
  const { isLoggedIn, isLoading, user } = useAuth();
  const isProvider = user?.accountType === 'provider';
  const MainTabsComponent = isProvider ? ProviderTabNavigation : TabNavigation;

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5E6FA' }}>
        <ActivityIndicator size="large" color="#a342c3" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: 'transparent' },
          cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
          gestureEnabled: true,
          gestureDirection: 'horizontal',
        }}
      >
        {isLoggedIn ? (
          <Stack.Screen
            name="MainTabs"
            component={MainTabsComponent}
            options={{
              cardStyle: { backgroundColor: '#F5E6FA' },
            }}
          />
        ) : (
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="SignUpStep1" component={SignUpStep1Screen} />
            <Stack.Screen name="SignUpStep2" component={SignUpStep2Screen} />
            <Stack.Screen name="SignUpStep3" component={SignUpStep3Screen} />
            <Stack.Screen name="SignUpStep4" component={SignUpStep4Screen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
