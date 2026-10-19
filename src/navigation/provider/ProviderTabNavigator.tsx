import React from "react";
import { ActivityIndicator, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import { ProviderTabParamList } from "../types";

// Navigators
// Provider mode uses the ISOLATED Becca stack (no client screens) so a provider
// can never bubble into a client-facing screen from the Becca tab.
import ProviderBeccaNavigator from "./tabs/ProviderBeccaNavigator";
import ProviderHomeNavigator from "./tabs/ProviderHomeNavigator";
import ProviderServicesNavigator from "./tabs/ProviderServicesNavigator";
import ProviderAccountNavigator from "./tabs/ProviderAccountNavigator";
import LinkOnlyPortfolioNavigator from "./tabs/LinkOnlyPortfolioNavigator";
import LinkOnlyMessagesNavigator from "./tabs/LinkOnlyMessagesNavigator";

// Components
import TabIcon from "../../components/TabIcon";
import IslandPillTabBar from "../../components/IslandPillTabBar";
import ErrorBoundary from "../../components/ErrorBoundary";
import { useTheme } from "../../contexts/ThemeContext";
import { ThemedBackground } from "../../components/ThemedBackground";
import { useAuth } from "../../contexts/AuthContext";

const Tab = createBottomTabNavigator<ProviderTabParamList>();

export default function ProviderTabNavigation() {
  const { theme } = useTheme();
  const { myBookingMode, myProviderIdStatus } = useAuth();

  // Which set of tabs to draw depends on the booking mode, which is looked up
  // after sign-in. Drawing the full CERVICED tabs while it's still pending is
  // what made a link-only provider see the full provider UI for a beat before
  // it swapped. Wait for the answer instead — only while it's still unknown,
  // so a re-check later in the session keeps the tabs (and their state) up. A
  // failed lookup falls through to the full tabs, as before.
  if (myProviderIdStatus === "pending" && myBookingMode === null) {
    return (
      <ThemedBackground>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.text} />
        </View>
      </ThemedBackground>
    );
  }

  // A link-only provider (booking_mode 'external') takes bookings on their own
  // page, so they get Home, Portfolio, Messages and Profile — no booking
  // calendar, no service catalogue, and Becca lives on their Home.
  if (myBookingMode === "external") {
    return <LinkOnlyProviderTabs />;
  }

  return (
    <Tab.Navigator
      initialRouteName="ProviderHome"
      // See TabNavigator: the default 'firstRoute' would send a bubbled back
      // press to Becca (the first declared tab) instead of ProviderHome.
      backBehavior="initialRoute"
      tabBar={(props) => <IslandPillTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#007AFF",
        tabBarInactiveTintColor: "#8E8E93",
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen
        name="Becca"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name="chat-dots"
              focused={focused}
              color={theme.text}
              size={26}
            />
          ),
        }}
      >
        {() => (
          <ErrorBoundary>
            <ProviderBeccaNavigator />
          </ErrorBoundary>
        )}
      </Tab.Screen>
      <Tab.Screen
        name="ProviderHome"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name="calendar-today"
              focused={focused}
              color={theme.text}
              size={26}
            />
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
          title: "My Services",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name="grid-layout"
              focused={focused}
              color={theme.text}
              size={26}
            />
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
            <TabIcon
              name="user"
              focused={focused}
              color={theme.text}
              size={26}
            />
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

function LinkOnlyProviderTabs() {
  const { theme } = useTheme();
  const icon = (name: string) => ({ focused }: { focused: boolean }) => (
    <TabIcon name={name} focused={focused} color={theme.text} size={26} />
  );

  return (
    <Tab.Navigator
      initialRouteName="ProviderHome"
      backBehavior="initialRoute"
      tabBar={(props) => <IslandPillTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#007AFF",
        tabBarInactiveTintColor: "#8E8E93",
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen name="ProviderHome" options={{ title: "Home", tabBarIcon: icon("house") }}>
        {() => (
          <ErrorBoundary>
            <ProviderHomeNavigator linkOnly />
          </ErrorBoundary>
        )}
      </Tab.Screen>
      <Tab.Screen name="LinkOnlyPortfolio" options={{ title: "Portfolio", tabBarIcon: icon("grid-layout") }}>
        {() => (
          <ErrorBoundary>
            <LinkOnlyPortfolioNavigator />
          </ErrorBoundary>
        )}
      </Tab.Screen>
      <Tab.Screen name="LinkOnlyMessages" options={{ title: "Messages", tabBarIcon: icon("chat-dots") }}>
        {() => (
          <ErrorBoundary>
            <LinkOnlyMessagesNavigator />
          </ErrorBoundary>
        )}
      </Tab.Screen>
      <Tab.Screen name="Profile" options={{ tabBarIcon: icon("user") }}>
        {() => (
          <ErrorBoundary>
            <ProviderAccountNavigator />
          </ErrorBoundary>
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
