import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { ProviderTabParamList } from './types';

// Navigators
import BeccaNavigator from './Tabs/BeccaNavigator';
import ProviderHomeNavigator from './Tabs/ProviderHomeNavigator';
import ProviderServicesNavigator from './Tabs/ProviderServicesNavigator';
import ProfileNavigator from './Tabs/ProfileNavigator';

// Components
import TabIcon from '../components/TabIcon';
import AdaptiveTabBar from '../components/AdaptiveTabBar';
import { useTheme } from '../contexts/ThemeContext';

const Tab = createBottomTabNavigator<ProviderTabParamList>();

export default function ProviderTabNavigation() {
  const { theme } = useTheme();

  return (
    <Tab.Navigator
      initialRouteName="ProviderHome"
      tabBar={(props) => <AdaptiveTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen
        name="Becca"
        component={BeccaNavigator}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="chat-dots" focused={focused} color={theme.text} size={26} />
          ),
        }}
      />
      <Tab.Screen
        name="ProviderHome"
        component={ProviderHomeNavigator}
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="calendar-today" focused={focused} color={theme.text} size={26} />
          ),
        }}
      />
      <Tab.Screen
        name="MyServices"
        component={ProviderServicesNavigator}
        options={{
          title: 'My Services',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="grid-layout" focused={focused} color={theme.text} size={26} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileNavigator}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="user" focused={focused} color={theme.text} size={26} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
