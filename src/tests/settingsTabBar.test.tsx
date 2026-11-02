import React from "react";
import { Text } from "react-native";
import { act, render } from "@testing-library/react-native";
import {
  createNavigationContainerRef,
  getFocusedRouteNameFromRoute,
  NavigationContainer,
} from "@react-navigation/native";
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  PROVIDER_SETTINGS_TAB,
  settingsStackHidesTabBar,
} from "../navigation/settingsTabBar";

describe("settingsStackHidesTabBar", () => {
  it("keeps the bar on Settings itself and on Business Profile", () => {
    expect(settingsStackHidesTabBar(undefined)).toBe(false);
    expect(settingsStackHidesTabBar("ProviderAccountMain")).toBe(false);
    expect(settingsStackHidesTabBar("BusinessProfile")).toBe(false);
  });

  it("hides it on every screen pushed on top", () => {
    for (const route of ["Achievements", "NotificationSettings", "BusinessDetails", "Branding", "ProviderConversation"]) {
      expect(settingsStackHidesTabBar(route)).toBe(true);
    }
  });
});

// The same reading IslandPillTabBar does, against a real tab + stack, so a
// navigation upgrade that changes what getFocusedRouteNameFromRoute returns
// shows up here.
it("follows the Settings stack as it is pushed and popped", () => {
  const Tab = createBottomTabNavigator();
  const Stack = createNativeStackNavigator();
  const ref = createNavigationContainerRef();
  const hidden = { current: false };

  const TabBar = ({ state }: BottomTabBarProps) => {
    const tab = state.routes[state.index]!;
    hidden.current =
      tab.name === PROVIDER_SETTINGS_TAB &&
      settingsStackHidesTabBar(getFocusedRouteNameFromRoute(tab));
    return null;
  };
  const Blank = () => <Text>screen</Text>;
  const Settings = () => (
    <Stack.Navigator>
      <Stack.Screen name="ProviderAccountMain" component={Blank} />
      <Stack.Screen name="BusinessProfile" component={Blank} />
      <Stack.Screen name="BusinessDetails" component={Blank} />
      <Stack.Screen name="Achievements" component={Blank} />
    </Stack.Navigator>
  );

  render(
    <NavigationContainer ref={ref}>
      <Tab.Navigator tabBar={(props) => <TabBar {...props} />}>
        <Tab.Screen name={PROVIDER_SETTINGS_TAB} component={Settings} />
      </Tab.Navigator>
    </NavigationContainer>,
  );
  const navigate = (name: string) =>
    act(() => {
      (ref as unknown as { navigate: (n: string) => void }).navigate(name);
    });
  const back = () => act(() => ref.goBack());

  expect(hidden.current).toBe(false);
  navigate("Achievements");
  expect(hidden.current).toBe(true);
  back();
  expect(hidden.current).toBe(false);
  navigate("BusinessProfile");
  expect(hidden.current).toBe(false);
  navigate("BusinessDetails");
  expect(hidden.current).toBe(true);
  back();
  expect(hidden.current).toBe(false);
});
