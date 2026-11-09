import React from "react";
import { Text } from "react-native";
import { act, render } from "@testing-library/react-native";
import {
  createNavigationContainerRef,
  NavigationContainer,
} from "@react-navigation/native";
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  PROVIDER_HOME_TAB,
  QUICK_ACCESS_ROUTES,
  SETTINGS_TAB,
  stackHidesTabBar,
  tabStackRouteNames,
} from "../navigation/tabBarVisibility";

const settingsStackHidesTabBar = (route: string | undefined) =>
  stackHidesTabBar(SETTINGS_TAB, route ? [route] : []);

describe("Settings tab", () => {
  it("keeps the bar on client Profile, provider Settings and Business Profile", () => {
    expect(settingsStackHidesTabBar(undefined)).toBe(false);
    expect(settingsStackHidesTabBar("ProfileMain")).toBe(false);
    expect(settingsStackHidesTabBar("ProviderAccountMain")).toBe(false);
    expect(settingsStackHidesTabBar("BusinessProfile")).toBe(false);
  });

  it("hides it on every screen pushed on top, in both hats", () => {
    for (const route of [
      "Achievements", "NotificationSettings", "BusinessDetails", "Branding", "ProviderConversation",
      "NotificationsSettings", "Points", "BeautyProfile", "Bookings", "ProviderChat", "ClientIntakeForm",
    ]) {
      expect(settingsStackHidesTabBar(route)).toBe(true);
    }
  });
});

describe("provider Home tab", () => {
  it("keeps the bar on Home and on screens not opened from Quick Access", () => {
    expect(stackHidesTabBar(PROVIDER_HOME_TAB, [])).toBe(false);
    expect(stackHidesTabBar(PROVIDER_HOME_TAB, ["ProviderHomeMain"])).toBe(false);
    expect(stackHidesTabBar(PROVIDER_HOME_TAB, ["ProviderHomeMain", "BookingDetail"])).toBe(false);
    expect(stackHidesTabBar(PROVIDER_HOME_TAB, ["ProviderHomeMain", "Notifications"])).toBe(false);
  });

  it("hides it on every Quick Access screen and anything opened from one", () => {
    for (const route of QUICK_ACCESS_ROUTES) {
      expect(stackHidesTabBar(PROVIDER_HOME_TAB, ["ProviderHomeMain", route])).toBe(true);
    }
    expect(stackHidesTabBar(PROVIDER_HOME_TAB, ["ProviderHomeMain", "ProviderInbox", "ProviderConversation"])).toBe(true);
    expect(stackHidesTabBar(PROVIDER_HOME_TAB, ["ProviderHomeMain", "Clientele", "BookingDetail"])).toBe(true);
  });

  it("leaves other tabs alone, even on the same screens", () => {
    expect(stackHidesTabBar("MyServices", ["MyServicesMain", "ProviderSchedule"])).toBe(false);
    expect(stackHidesTabBar("LinkOnlyMessages", ["ProviderInbox"])).toBe(false);
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
    hidden.current = stackHidesTabBar(tab.name, tabStackRouteNames(tab));
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
        <Tab.Screen name={SETTINGS_TAB} component={Settings} />
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

it("follows the provider Home stack into Quick Access and back", () => {
  const Tab = createBottomTabNavigator();
  const Stack = createNativeStackNavigator();
  const ref = createNavigationContainerRef();
  const hidden = { current: false };

  const TabBar = ({ state }: BottomTabBarProps) => {
    const tab = state.routes[state.index]!;
    hidden.current = stackHidesTabBar(tab.name, tabStackRouteNames(tab));
    return null;
  };
  const Blank = () => <Text>screen</Text>;
  const Home = () => (
    <Stack.Navigator>
      <Stack.Screen name="ProviderHomeMain" component={Blank} />
      <Stack.Screen name="BookingDetail" component={Blank} />
      <Stack.Screen name="ProviderInbox" component={Blank} />
      <Stack.Screen name="ProviderConversation" component={Blank} />
    </Stack.Navigator>
  );

  render(
    <NavigationContainer ref={ref}>
      <Tab.Navigator tabBar={(props) => <TabBar {...props} />}>
        <Tab.Screen name={PROVIDER_HOME_TAB} component={Home} />
      </Tab.Navigator>
    </NavigationContainer>,
  );
  const navigate = (name: string) =>
    act(() => {
      (ref as unknown as { navigate: (n: string) => void }).navigate(name);
    });
  const back = () => act(() => ref.goBack());

  expect(hidden.current).toBe(false);
  navigate("BookingDetail");
  expect(hidden.current).toBe(false);
  back();
  navigate("ProviderInbox");
  expect(hidden.current).toBe(true);
  navigate("ProviderConversation");
  expect(hidden.current).toBe(true);
  back();
  back();
  expect(hidden.current).toBe(false);
});
