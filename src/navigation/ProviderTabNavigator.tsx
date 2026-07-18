import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { ProviderTabParamList } from './types';

// Navigators
import BeccaNavigator from './Tabs/BeccaNavigator';
import ProviderHomeNavigator from './Tabs/ProviderHomeNavigator';
import ProviderServicesNavigator from './Tabs/ProviderServicesNavigator';
import ProviderAccountNavigator from './Tabs/ProviderAccountNavigator';

// Components
import TabIcon from '../components/TabIcon';
import IslandPillTabBar from '../components/IslandPillTabBar';
import ErrorBoundary from '../components/ErrorBoundary';
import { useTheme } from '../contexts/ThemeContext';

const Tab = createBottomTabNavigator<ProviderTabParamList>();

export default function ProviderTabNavigation() {
  const { theme } = useTheme();

  return (
    <Tab.Navigator
      initialRouteName="ProviderHome"
      tabBar={(props) => <IslandPillTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen
        name="Becca"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="chat-dots" focused={focused} color={theme.text} size={26} />
          ),
        }}
      >
        {() => (
          <ErrorBoundary>
            <BeccaNavigator />
          </ErrorBoundary>
        )}
      </Tab.Screen>
      <Tab.Screen
        name="ProviderHome"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="calendar-today" focused={focused} color={theme.text} size={26} />
          ),
        }}
      >
        {() => (
          <ErrorBoundary>
            <ProviderHomeNavigator />
          </ErrorBoundary>
        )}
      </Tab.Screen>
      <Tab.Screen
        name="MyServices"
        options={{
          title: 'My Services',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="grid-layout" focused={focused} color={theme.text} size={26} />
          ),
        }}
      >
        {() => (
          <ErrorBoundary>
            <ProviderServicesNavigator />
          </ErrorBoundary>
        )}
      </Tab.Screen>
      <Tab.Screen
        name="Profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="user" focused={focused} color={theme.text} size={26} />
          ),
        }}
      >
        {() => (
          <ErrorBoundary>
            <ProviderAccountNavigator />
          </ErrorBoundary>
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
