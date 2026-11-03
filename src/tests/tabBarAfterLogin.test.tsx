import React from "react";
import { Animated, Keyboard, Platform } from "react-native";
import { act, render } from "@testing-library/react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import IslandPillTabBar from "../components/IslandPillTabBar";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
jest.mock("../contexts/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false }),
}));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light" },
}));

// The bar's own show/hide is an Animated.timing to 1 (hidden) or 0 (shown).
function hideTargets(spy: jest.SpyInstance): number[] {
  return spy.mock.calls.map(([, config]) => (config as { toValue: number }).toValue);
}

function barProps(): BottomTabBarProps {
  const routes = [
    { key: "home-1", name: "ProviderHome" },
    { key: "profile-1", name: "Profile" },
  ];
  const options = { title: "", tabBarHideOnKeyboard: true };
  return {
    state: { index: 0, routes, key: "tabs", routeNames: ["ProviderHome", "Profile"], type: "tab", stale: false, history: [] },
    descriptors: Object.fromEntries(routes.map(r => [r.key, { options, route: r, navigation: {}, render: () => null }])),
    navigation: { emit: jest.fn(() => ({ defaultPrevented: false })), navigate: jest.fn() },
    insets: { top: 0, bottom: 34, left: 0, right: 0 },
  } as unknown as BottomTabBarProps;
}

describe("IslandPillTabBar after sign-in", () => {
  afterEach(() => jest.restoreAllMocks());

  it("shows straight away while the Login screen's keyboard is still closing", () => {
    jest.spyOn(Keyboard, "isVisible").mockReturnValue(true);
    const timing = jest.spyOn(Animated, "timing");
    render(<IslandPillTabBar {...barProps()} />);
    expect(hideTargets(timing)).not.toContain(1);
  });

  it("still hides for a keyboard opened after it appears", () => {
    const listeners: Record<string, () => void> = {};
    jest.spyOn(Keyboard, "addListener").mockImplementation(((event: string, listener: () => void) => {
      listeners[event] = listener;
      return { remove: jest.fn() };
    }) as unknown as typeof Keyboard.addListener);
    const timing = jest.spyOn(Animated, "timing");
    render(<IslandPillTabBar {...barProps()} />);
    act(() => {
      listeners[Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow"]?.();
    });
    expect(hideTargets(timing)).toContain(1);
  });
});
