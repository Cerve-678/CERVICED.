import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ExploreScreen from '../../screens/ExploreScreen';
import ProviderProfileScreen from '../../screens/ProviderProfileScreen';
import SearchScreen from '../../screens/SearchScreen';
import BookmarkedProvidersScreen from '../../screens/BookmarkedProvidersScreen';
import CartScreen from '../../screens/CartScreen';
import { ExploreStackParamList } from '../types';
import { useTheme } from '../../contexts/ThemeContext';

const ExploreStack = createNativeStackNavigator<ExploreStackParamList>();

export default function ExploreNavigator() {
  const { theme } = useTheme();

  return (
    <ExploreStack.Navigator>
      <ExploreStack.Screen
        name="ExploreMain"
        component={ExploreScreen}
        options={{ headerShown: false }}
      />
      
      {/* PUSH NAVIGATION for Provider Profile */}
      <ExploreStack.Screen
        name="ProviderProfile"
        component={ProviderProfileScreen}
        options={{
          title: 'Provider Profile',
          presentation: 'card',
          headerBackTitle: 'Explore',
          headerStyle: {
            backgroundColor: theme.background,
          },
          headerTintColor: theme.text,
          headerTitleStyle: {
            color: theme.text,
          },
        }}
      />

      {/* PUSH NAVIGATION for Cart */}
      <ExploreStack.Screen
        name="CartMain"
        component={CartScreen}
        options={{
          title: 'Cart',
          presentation: 'card',
          headerBackTitle: 'Back',
          headerStyle: {
            backgroundColor: theme.background,
          },
          headerTintColor: theme.text,
          headerTitleStyle: {
            color: theme.text,
          },
        }}
      />

      {/* FULL-SCREEN MODALS */}
      <ExploreStack.Group screenOptions={{
        presentation: 'fullScreenModal',
        headerBackTitle: 'Close',
        headerStyle: {
          backgroundColor: theme.background,
        },
        headerTintColor: theme.text,
      }}>
        <ExploreStack.Screen
          name="Search"
          component={SearchScreen}
          options={{
            title: 'Search & Filter',
          }}
        />
        <ExploreStack.Screen
          name="BookmarkedProviders"
          component={BookmarkedProvidersScreen}
          options={{
            title: 'Saved Providers',
          }}
        />
      </ExploreStack.Group>
    </ExploreStack.Navigator>
  );
}