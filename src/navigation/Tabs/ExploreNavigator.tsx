import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ExploreScreen from '../../screens/ExploreScreen';
import ProviderProfileScreen from '../../screens/ProviderProfileScreen';
import ProviderChatScreen from '../../screens/ProviderChatScreen';
import SearchScreen from '../../screens/SearchScreen';
import BookmarkedProvidersScreen from '../../screens/BookmarkedProvidersScreen';
import CartScreen from '../../screens/CartScreen';
import DevSettingsScreen from '../../screens/DevSettingsScreen';
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
      
      <ExploreStack.Screen
        name="ProviderChat"
        component={ProviderChatScreen}
        options={{ headerShown: true, presentation: 'card', headerBackTitle: 'Back' }}
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

      {/* PUSH NAVIGATION for Cart — CartScreen renders its own header, so the
          native stack header must stay hidden (matches CartNavigator's CartMain). */}
      <ExploreStack.Screen
        name="CartMain"
        component={CartScreen}
        options={{
          presentation: 'card',
          headerShown: false,
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
            title: 'Search Cervices',
            // Overrides the group's fullScreenModal slide-up-from-bottom —
            // Search plays its own internal "float up and merge" entrance
            // (see SearchScreen's isMorphEntry), so the screen itself must
            // enter with no transition of its own, same as HomeNavigator's
            // Search screen. The per-navigate `{ animation: 'none' }' 3rd
            // argument some callers pass to navigation.navigate() doesn't
            // actually override a navigator-level presentation animation —
            // this static option is what actually takes effect.
            animation: 'none',
          }}
        />
        <ExploreStack.Screen
          name="BookmarkedProviders"
          component={BookmarkedProvidersScreen}
          options={{
            title: 'Saved Providers',
          }}
        />
        <ExploreStack.Screen
          name="DevSettings"
          component={DevSettingsScreen}
          options={{
            title: 'Developer Settings',
            headerShown: false,
          }}
        />
      </ExploreStack.Group>
    </ExploreStack.Navigator>
  );
}