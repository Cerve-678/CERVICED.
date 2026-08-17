import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import BeccaScreen from "../../../screens/shared/BeccaScreen";
import NotificationsScreen from "../../../screens/shared/NotificationsScreen";
import ProviderBookingDetailScreen from "../../../screens/provider/ProviderBookingDetailScreen";
import DevSettingsScreen from "../../../screens/shared/DevSettingsScreen";
import ProviderScheduleScreen from "../../../screens/provider/ProviderScheduleScreen";
import AddBookingScreen from "../../../screens/provider/AddBookingScreen";
import ProviderClienteleScreen from "../../../screens/provider/ProviderClienteleScreen";
import ProviderInboxScreen from "../../../screens/provider/ProviderInboxScreen";
import ProviderConversationScreen from "../../../screens/provider/ProviderConversationScreen";
import ProviderPromotionsScreen from "../../../screens/provider/ProviderPromotionsScreen";
import ProviderInfoPackScreen from "../../../screens/provider/ProviderInfoPackScreen";
import ProviderAnalyticsScreen from "../../../screens/provider/ProviderAnalyticsScreen";
import ProviderBookingHistoryScreen from "../../../screens/provider/ProviderBookingHistoryScreen";
import ProviderAutomationsScreen from "../../../screens/provider/ProviderAutomationsScreen";
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
 *
 * Everything below BookingDetail is Becca's OWN copy of a screen that also
 * exists in ProviderHome/Profile/MyServices. That duplication is the point:
 * Becca's chips used to jump across tabs, which landed each screen at its tab
 * root with an empty stack beneath it — so its close/back button dispatched a
 * GO_BACK no navigator could handle. Pushing within this stack always leaves
 * BeccaMain underneath, so back returns to the conversation that sent you
 * there. The client BeccaNavigator already works this way.
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

      {/* ── Becca's own copies of her chip destinations ──────────────────── */}

      <ProviderBeccaStack.Screen
        name="ProviderSchedule"
        component={ProviderScheduleScreen}
        options={{ headerShown: false, presentation: "card" }}
      />

      <ProviderBeccaStack.Screen
        name="AddBooking"
        component={AddBookingScreen}
        options={{ headerShown: false, presentation: "modal" }}
      />

      <ProviderBeccaStack.Screen
        name="Clientele"
        component={ProviderClienteleScreen}
        options={{ headerShown: false, presentation: "card" }}
      />

      <ProviderBeccaStack.Screen
        name="ProviderInbox"
        component={ProviderInboxScreen}
        options={{ headerShown: false, presentation: "card" }}
      />

      <ProviderBeccaStack.Screen
        name="ProviderConversation"
        component={ProviderConversationScreen}
        options={{ headerShown: false, presentation: "card" }}
      />

      <ProviderBeccaStack.Screen
        name="Promotions"
        component={ProviderPromotionsScreen}
        options={{ headerShown: false, presentation: "card" }}
      />

      <ProviderBeccaStack.Screen
        name="InfoPacks"
        component={ProviderInfoPackScreen}
        options={{ headerShown: false, presentation: "card" }}
      />

      <ProviderBeccaStack.Screen
        name="Analytics"
        component={ProviderAnalyticsScreen}
        options={{ headerShown: false, presentation: "card" }}
      />

      <ProviderBeccaStack.Screen
        name="BookingHistory"
        component={ProviderBookingHistoryScreen}
        options={{ headerShown: false, presentation: "card" }}
      />

      <ProviderBeccaStack.Screen
        name="Automations"
        component={ProviderAutomationsScreen}
        options={{ headerShown: false, presentation: "card" }}
      />
    </ProviderBeccaStack.Navigator>
  );
}
