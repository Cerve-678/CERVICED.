import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import BeccaScreen from "../../../screens/shared/BeccaScreen";
import NotificationsScreen from "../../../screens/shared/NotificationsScreen";
import ProviderBookingDetailScreen from "../../../screens/provider/ProviderBookingDetailScreen";
import DevSettingsScreen from "../../../screens/shared/DevSettingsScreen";
import { ProviderBeccaStackParamList } from "../../types";

const ProviderBeccaStack =
  createNativeStackNavigator<ProviderBeccaStackParamList>();

/**
 * The Becca tab as mounted in PROVIDER mode.
 *
 * Unlike the shared client BeccaNavigator, this registers NO client screens
 * (no ProviderProfile / Bookings / Cart / client BookingDetail / Reschedule).
 * `BookingDetail` here is the PROVIDER booking detail. Because the provider tab
 * tree therefore contains only provider screens, a deep-link (e.g. a notification
 * tap) can never bubble across into a client screen — full mode isolation.
 */
export default function ProviderBeccaNavigator() {
  return (
    <ProviderBeccaStack.Navigator>
      <ProviderBeccaStack.Screen
        name="BeccaMain"
        component={BeccaScreen}
        options={{ headerShown: false }}
      />

      {/* Provider booking detail — a notification opened from the Becca tab in
          provider mode resolves here, not to the client BookingDetailScreen. */}
      <ProviderBeccaStack.Screen
        name="BookingDetail"
        component={ProviderBookingDetailScreen}
        options={{ headerShown: false, presentation: "card" }}
      />

      <ProviderBeccaStack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ headerShown: false, presentation: "formSheet" }}
      />

      <ProviderBeccaStack.Screen
        name="DevSettings"
        component={DevSettingsScreen}
        options={{ headerShown: false, presentation: "fullScreenModal" }}
      />
    </ProviderBeccaStack.Navigator>
  );
}
