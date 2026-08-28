// The navigation contract between Becca capabilities and BeccaScreen.
//
// Capabilities use semantic screen keys; the screen maps those keys to the
// correct navigator. Keeping the allowlists here makes an invalid action a
// testable contract failure rather than a button that silently does nothing.

import type { BeccaHat, ChatSuggestion } from "./types";

export const CLIENT_BECCA_SCREENS = new Set([
  "Bookings",
  "BookingDetail",
  "Reschedule",
  "ProviderProfile",
  "ProviderChat",
  "ClientIntakeForm",
  "Notifications",
  "CartMain",
]);

export const CLIENT_PROFILE_SCREENS = new Set([
  "ProfileMain",
  "ProfileInfo",
  "BeautyProfile",
  "ChangePassword",
  "NotificationsSettings",
  "PaymentMethods",
  "Subscription",
  "HelpCentre",
  "About",
  "Terms",
  "ReportProblem",
  "Points",
]);

export const PROVIDER_PUSH_NAV: Record<string, string> = {
  schedule: "ProviderSchedule",
  bookingRules: "Scheduling",
  clients: "Clientele",
  messages: "ProviderInbox",
  conversation: "ProviderConversation",
  Notifications: "Notifications",
  BookingDetail: "BookingDetail",
  promotions: "Promotions",
  infopacks: "InfoPacks",
  analytics: "Analytics",
  history: "BookingHistory",
  automations: "Automations",
};

export const PROVIDER_TAB_NAV: Record<string, { tab: string; screen: string }> = {
  home: { tab: "ProviderHome", screen: "ProviderHomeMain" },
  services: { tab: "MyServices", screen: "ProviderServicesMain" },
};

/** True only for a navigation action that BeccaScreen can actually fulfil. */
export function isBeccaNavigationSuggestion(
  hat: BeccaHat,
  suggestion: ChatSuggestion,
): boolean {
  if (suggestion.action !== "navigate") return true;
  const screen = suggestion.data?.screen;
  if (!screen) return false;

  if (hat === "provider") {
    return screen in PROVIDER_PUSH_NAV || screen in PROVIDER_TAB_NAV;
  }

  if (screen === "Explore") return true;
  if (screen === "Profile") {
    const profileScreen = suggestion.data?.params?.["profileScreen"];
    return typeof profileScreen === "string" && CLIENT_PROFILE_SCREENS.has(profileScreen);
  }
  return CLIENT_BECCA_SCREENS.has(screen);
}
