import React, { useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { NavigationContainer, type NavigationState } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { navigationRef } from '../navigation/navigationRef';
import { navigateNested } from '../navigation/rootNavigate';

// A push tap on the provider hat used to fire while ProviderTabNavigation was
// still showing its spinner (no tabs until the booking mode is known), and the
// navigate was dropped: "Do you have a screen named 'ProviderHome'?". The tap
// now waits for the tab to mount and lands once it does.

jest.mock('../utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

const Root = createStackNavigator();
const Tab = createBottomTabNavigator();
const HomeStack = createStackNavigator();

function ProviderHomeTab() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="ProviderHomeMain">{() => <Text>Calendar</Text>}</HomeStack.Screen>
      <HomeStack.Screen name="BookingDetail">
        {({ route }) => <Text>Booking {(route.params as { bookingId: string }).bookingId}</Text>}
      </HomeStack.Screen>
    </HomeStack.Navigator>
  );
}

/** Spinner first, tabs once "Finish loading" is pressed — the shape of
 *  ProviderTabNavigation while the booking mode lookup is pending. */
function MainTabs() {
  const [loaded, setLoaded] = useState(false);
  if (!loaded) {
    return (
      <TouchableOpacity onPress={() => setLoaded(true)}>
        <Text>Finish loading</Text>
      </TouchableOpacity>
    );
  }
  return (
    <Tab.Navigator tabBar={() => null} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="ProviderHome" component={ProviderHomeTab} />
    </Tab.Navigator>
  );
}

function focusedPath(state: NavigationState | undefined): string[] {
  const path: string[] = [];
  let node = state as NavigationState | undefined;
  while (node) {
    const route = node.routes[node.index];
    if (!route) break;
    path.push(route.name);
    node = route.state as NavigationState | undefined;
  }
  return path;
}

it('waits for the provider tabs to mount before opening the booking', async () => {
  render(
    <NavigationContainer ref={navigationRef}>
      <Root.Navigator screenOptions={{ headerShown: false }}>
        <Root.Screen name="MainTabs" component={MainTabs} />
      </Root.Navigator>
    </NavigationContainer>,
  );
  await screen.findByText('Finish loading');

  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  act(() => navigateNested('ProviderHome', 'BookingDetail', { bookingId: 'b1' }));
  expect(errorSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();

  fireEvent.press(screen.getByText('Finish loading'));

  expect(await screen.findByText('Booking b1')).toBeTruthy();
  expect(focusedPath(navigationRef.getRootState())).toEqual(['MainTabs', 'ProviderHome', 'BookingDetail']);
});
