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

/**
 * The provider destinations a link-only pro (booking_mode 'external') can use.
 *
 * Their app has no booking calendar, Clientele, Info Packs, Automations,
 * booking rules or full Analytics, and no My Services tab, so those keys stay
 * out. Each of these is registered in ProviderBeccaNavigator, the stack their
 * Home pushes Becca on. `schedule` lands on ProviderScheduleScreen, which
 * shows them Opening Hours only (`hoursOnly`).
 */
export const LINK_ONLY_PROVIDER_NAV = new Set([
  "schedule",
  "messages",
  "conversation",
  "Notifications",
]);

/** True only for a navigation action that BeccaScreen can actually fulfil. */
export function isBeccaNavigationSuggestion(
  hat: BeccaHat,
  suggestion: ChatSuggestion,
  linkOnly = false,
): boolean {
  if (suggestion.action !== "navigate") return true;
  const screen = suggestion.data?.screen;
  if (!screen) return false;

  if (hat === "provider") {
    if (linkOnly) return LINK_ONLY_PROVIDER_NAV.has(screen);
    return screen in PROVIDER_PUSH_NAV || screen in PROVIDER_TAB_NAV;
  }

  if (screen === "Explore") return true;
  if (screen === "Profile") {
    const profileScreen = suggestion.data?.params?.["profileScreen"];
    return typeof profileScreen === "string" && CLIENT_PROFILE_SCREENS.has(profileScreen);
  }
  return CLIENT_BECCA_SCREENS.has(screen);
}
