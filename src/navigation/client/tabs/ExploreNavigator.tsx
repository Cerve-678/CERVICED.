import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ExploreScreen from '../../../screens/client/ExploreScreen';
import ProviderProfileScreen from '../../../screens/client/ProviderProfileScreen';
import ProviderChatScreen from '../../../screens/client/ProviderChatScreen';
import SearchScreen from '../../../screens/client/SearchScreen';
import BookmarkedProvidersScreen from '../../../screens/client/BookmarkedProvidersScreen';
import CartScreen from '../../../screens/client/CartScreen';
import DevSettingsScreen from '../../../screens/shared/DevSettingsScreen';
import { ExploreStackParamList } from '../../types';
import { useTheme } from '../../../contexts/ThemeContext';

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

      {/* PUSH NAVIGATION for BookmarkedProviders — deliberately a card, not
          part of the fullScreenModal group below. BookmarkedProvidersScreen
          relies entirely on the native stack's back button (its only
          goBack() is inside the empty-state "Explore Providers" button), and
          a fullScreenModal renders no back chevron and — unlike 'modal' —
          can't be swipe-dismissed either, so presenting it modally here left
          any user with at least one saved provider with no way back.
          Matches HomeNavigator's registration. */}
      <ExploreStack.Screen
        name="BookmarkedProviders"
        component={BookmarkedProvidersScreen}
        options={{
          title: 'Your Providers',
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

      {/* PUSH NAVIGATION for Search — deliberately a card, NOT part of the
          fullScreenModal group below. react-native-screens presents a
          fullScreenModal as a presented view controller on top of the
          navigation controller, and every screen pushed after it joins that
          presentation chain rather than the underlying stack — so tapping a
          result in Search (which pushes ProviderProfile, a 'card') did
          nothing at all when Search was reached from Explore, while the
          identical tap worked from Home, where Search is a plain push.
          HomeNavigator registers it the same way; `animation: 'none'` is
          what Search's own "float up and merge" entrance (see
          SearchScreen's isMorphEntry) needs, and it never needed the modal
          presentation to get that. Same class of bug as BookmarkedProviders
          above. */}
      <ExploreStack.Screen
        name="Search"
        component={SearchScreen}
        options={{
          title: 'Search Cervices',
          presentation: 'card',
          animation: 'none',
          headerBackTitle: 'Back',
          headerStyle: {
            backgroundColor: theme.background,
          },
          headerTintColor: theme.text,
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
