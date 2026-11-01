import React, { useState } from "react";
import { Text, TouchableOpacity } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import {
  createNavigationContainerRef,
  NavigationContainer,
} from "@react-navigation/native";
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useHideTabBar } from "../navigation/useHideTabBar";

type StackParams = {
  Plain: undefined;
  Detail: undefined;
  Reschedule: undefined;
  Profile: undefined;
};

function renderStack() {
  const Tab = createBottomTabNavigator();
  const Stack = createNativeStackNavigator<StackParams>();
  const ref = createNavigationContainerRef<StackParams>();
  const tabBarHidden = { current: false };

  const TabBar = ({ state, descriptors }: BottomTabBarProps) => {
    const options = descriptors[state.routes[state.index]!.key]!.options;
    tabBarHidden.current =
      (options.tabBarStyle as { display?: string } | undefined)?.display ===
      "none";
    return null;
  };
  const Plain = () => <Text>plain</Text>;
  const Hiding = () => {
    useHideTabBar();
    return <Text>hiding</Text>;
  };
  const Profile = () => {
    const [added, setAdded] = useState(false);
    useHideTabBar(!added);
    return (
      <TouchableOpacity onPress={() => setAdded(true)}>
        <Text>add to cart</Text>
      </TouchableOpacity>
    );
  };
  const Home = () => (
    <Stack.Navigator>
      <Stack.Screen name="Plain" component={Plain} />
      <Stack.Screen name="Detail" component={Hiding} />
      <Stack.Screen name="Reschedule" component={Hiding} />
      <Stack.Screen name="Profile" component={Profile} />
    </Stack.Navigator>
  );

  render(
    <NavigationContainer ref={ref}>
      <Tab.Navigator tabBar={(props) => <TabBar {...props} />}>
        <Tab.Screen name="Home" component={Home} />
      </Tab.Navigator>
    </NavigationContainer>,
  );

  const navigate = (name: keyof StackParams) =>
    act(() => {
      (ref as unknown as { navigate: (n: string) => void }).navigate(name);
    });
  const back = () =>
    act(() => {
      ref.goBack();
    });
  return { tabBarHidden, navigate, back };
}

describe("useHideTabBar", () => {
  it("keeps the bar hidden when one hiding screen opens another", () => {
    const { tabBarHidden, navigate } = renderStack();
    navigate("Detail");
    expect(tabBarHidden.current).toBe(true);
    navigate("Reschedule");
    expect(tabBarHidden.current).toBe(true);
  });

  it("stays hidden going back to a hiding screen, and returns on a plain one", () => {
    const { tabBarHidden, navigate, back } = renderStack();
    navigate("Detail");
    navigate("Reschedule");
    back();
    expect(tabBarHidden.current).toBe(true);
    back();
    expect(tabBarHidden.current).toBe(false);
  });

  it("restores the bar when a hiding screen opens one that doesn't hide it", () => {
    const { tabBarHidden, navigate, back } = renderStack();
    navigate("Detail");
    navigate("Plain");
    expect(tabBarHidden.current).toBe(false);
    back();
    expect(tabBarHidden.current).toBe(true);
  });

  it("lets a screen show the bar again part-way through a visit", () => {
    const { tabBarHidden, navigate } = renderStack();
    navigate("Detail");
    navigate("Profile");
    expect(tabBarHidden.current).toBe(true);
    fireEvent.press(screen.getByText("add to cart"));
    expect(tabBarHidden.current).toBe(false);
  });
});
