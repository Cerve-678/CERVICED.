// src/navigation/types.ts
import { CompositeScreenProps, NavigatorScreenParams } from "@react-navigation/native";
import { StackScreenProps } from "@react-navigation/stack";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";

// ============================================================================
// STACK PARAM LISTS
// ============================================================================

// Root Stack
export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<TabParamList>;
  Welcome: undefined;
  Login: undefined;
  // providerId — when present, jumps straight to the preview step for that
  // specific unclaimed listing (from a profile's "Claim this business"
  // button) instead of starting at the search step. See ClaimProviderScreen.
  ClaimProvider: { providerId?: string } | undefined;
  SignUpStep1: undefined;
  SignUpStep2: undefined;
  SignUpStep3: undefined;
  SignUpStep4: undefined;
  SignUpStep5: undefined;
  EmailVerification: { email: string };
  ForgotPassword: undefined;
  ResetPasswordOTP: { email: string };
  NewPassword: undefined;
};
// Home Stack
export type HomeStackParamList = {
  HomeMain: undefined;
  ProviderProfile: { providerId: string; source?: string; openServiceId?: string };
  ProviderChat: {
    providerId: string;
    providerDbId: string;
    providerName: string;
  };
  Search: { initialQuery?: string; category?: string; morph?: boolean };
  Bookings:
    | {
        openBookingId?: string;
        openReschedule?: boolean;
        highlightBookingId?: string;
        initialTab?: "all" | "past";
      }
    | undefined;
  BookingDetail: { bookingId: string };
  Reschedule: { bookingId: string };
  BookmarkedProviders: undefined;
  Notifications: undefined;
  CartMain: undefined;
  ClientIntakeForm: { formId: string; bookingId: string; serviceName?: string };
  DevSettings: undefined;
  Offers: undefined;
};

// Explore Stack
export type ExploreStackParamList = {
  ExploreMain: { category?: string };
  ProviderProfile: { providerId: string; source?: string; openServiceId?: string };
  ProviderChat: {
    providerId: string;
    providerDbId: string;
    providerName: string;
  };
  Search: { initialQuery?: string; category?: string; morph?: boolean };
  BookmarkedProviders: undefined;
  CartMain: undefined;
  DevSettings: undefined;
};

// Becca Stack
export type BeccaStackParamList = {
  BeccaMain: { conversationId?: string };
  ProviderProfile: { providerId: string; source?: string; openServiceId?: string };
  ProviderChat: {
    providerId: string;
    providerDbId: string;
    providerName: string;
  };
  Notifications: undefined;
  Bookings:
    | {
        openBookingId?: string;
        openReschedule?: boolean;
        highlightBookingId?: string;
        initialTab?: "all" | "past";
      }
    | undefined;
  BookingDetail: { bookingId: string };
  Reschedule: { bookingId: string };
  ClientIntakeForm: { formId: string; bookingId: string; serviceName?: string };
  CartMain: undefined;
  DevSettings: undefined;
};

// Provider Becca Stack — the isolated Becca tab used in PROVIDER mode. It
// deliberately registers NO client screens (no ProviderProfile / Bookings /
// Cart / client BookingDetail), so a provider can never bubble into a client
// screen. BookingDetail here is the PROVIDER booking detail.
export type ProviderBeccaStackParamList = {
  BeccaMain: { conversationId?: string };
  Notifications: undefined;
  BookingDetail: { bookingId: string; booking?: any; groupSiblings?: any[] };
  DevSettings: undefined;
  // Becca's OWN copies of the provider screens her chips route to.
  //
  // Deliberately duplicated from ProviderHome/Profile/MyServices rather than
  // reached by a cross-tab navigate: a cross-tab jump lands the screen at its
  // tab root with an empty stack beneath it, so its close/back button fires an
  // unhandled GO_BACK. Pushing within THIS stack always leaves BeccaMain
  // underneath, so back returns to the conversation that sent you there.
  // Mirrors how the client BeccaNavigator already owns its own destinations.
  ProviderSchedule: undefined;
  Scheduling: undefined;
  AddBooking: undefined;
  Clientele: undefined;
  ProviderInbox:
    | { initialFilter?: "all" | "pending" | "confirmed" | "done" | "messages" }
    | undefined;
  ProviderConversation: {
    conversationId: string;
    clientUserId: string;
    clientName: string;
  };
  Promotions: undefined;
  InfoPacks: undefined;
  Analytics: undefined;
  BookingHistory: { initialTab?: 'history' | 'todo' } | undefined;
  Automations: undefined;
};

// Cart Stack
export type CartStackParamList = {
  CartMain: undefined;
  ProviderProfile: { providerId: string; source?: string; openServiceId?: string };
  ProviderChat: {
    providerId: string;
    providerDbId: string;
    providerName: string;
  };
  Bookings:
    | {
        openBookingId?: string;
        openReschedule?: boolean;
        highlightBookingId?: string;
        initialTab?: "all" | "past";
      }
    | undefined;
  BookingDetail: { bookingId: string };
  Reschedule: { bookingId: string };
  ClientIntakeForm: { formId: string; bookingId: string; serviceName?: string };
  Notifications: undefined;
  DevSettings: undefined;
};

// Profile Stack
export type ProfileStackParamList = {
  ProfileMain: undefined;
  /** `returnToTab` is set when checkout sends the client here to set their
   *  address — saving returns to that tab (where the cart, and its in-flight
   *  Confirm Your Details state, is still mounted) instead of falling back to
   *  ProfileMain. */
  ProfileInfo: { returnToTab?: string } | undefined;
  BeautyProfile: undefined;
  ChangePassword: undefined;
  NotificationsSettings: undefined;
  PaymentMethods: undefined;
  Subscription: undefined;
  HelpCentre: undefined;
  About: undefined;
  Terms: undefined;
  ReportProblem: undefined;
  Points: undefined;
  ProviderProfile: { providerId: string; source?: string; openServiceId?: string };
  ProviderChat: {
    providerId: string;
    providerDbId: string;
    providerName: string;
  };
  Messages: undefined;
  Bookings:
    | {
        openBookingId?: string;
        openReschedule?: boolean;
        highlightBookingId?: string;
        initialTab?: "all" | "past";
      }
    | undefined;
  BookingDetail: { bookingId: string };
  Reschedule: { bookingId: string };
  BookmarkedProviders: undefined;
  Notifications: undefined;
  CartMain: undefined;
  ClientIntakeForm: { formId: string; bookingId: string; serviceName?: string };
  DevSettings: undefined;
  InfoReg: { transferProviderId?: string } | undefined;
};

// Provider Home Stack (Calendar/Scheduling)
export type ProviderHomeStackParamList = {
  // jumpToDate: set after AddBookingScreen creates a booking outside "today",
  // so the calendar opens straight to the day it was added on instead of
  // silently leaving the provider on whatever day they already had selected.
  ProviderHomeMain: { jumpToDate?: string } | undefined;
  ProviderSchedule: undefined;
  AddBooking: undefined;
  // Reachable from the Calendar tab's profile quick-actions. Registered here
  // (as well as on the Profile stack) so those actions PUSH instead of jumping
  // to the Profile tab root — a cross-tab jump left these at the root of a
  // fresh stack, so their back/save button fired an unhandled GO_BACK.
  EditProfile: { transferProviderId?: string } | undefined;
  Branding: undefined;
  BookingDetail: { bookingId: string; booking?: any; openReschedule?: boolean; groupSiblings?: any[] };
  ProviderIntakeForm:
    | {
        bookingId: string;
        clientUserId: string;
        serviceName: string;
        formId?: string;
      }
    | undefined;
  Notifications: undefined;
  ProviderInbox:
    | { initialFilter?: "all" | "pending" | "confirmed" | "done" | "messages" }
    | undefined;
  ProviderConversation: {
    conversationId: string;
    clientUserId: string;
    clientName: string;
  };
  Promotions: undefined;
  InfoPacks: undefined;
  Clientele: undefined;
  DevSettings: undefined;
};

// Provider Services Stack (profile preview + edit via InfoRegScreen)
export type ProviderServicesStackParamList = {
  ProviderServicesMain: undefined;
  EditProfile: { transferProviderId?: string } | undefined;
  Promotions: undefined;
  InfoPacks: undefined;
  Clientele: undefined;
  // Pushed from the Clientele screen's Message button, for the same reason
  // ProviderSchedule is registered here — a cross-tab navigate would land the
  // conversation at a bare tab root and its back button would fire an
  // unhandled GO_BACK.
  ProviderConversation: {
    conversationId: string;
    clientUserId: string;
    clientName: string;
  };
  // Pushed from the availability card on the provider's own profile, so the
  // schedule opens with that profile beneath it instead of at a bare tab root.
  ProviderSchedule: undefined;
  AddBooking: undefined;
  DevSettings: undefined;
};

// Provider Account Stack (settings for provider users)
export type ProviderAccountStackParamList = {
  ProviderAccountMain: undefined;
  EditProfile: { transferProviderId?: string } | undefined;
  Notifications: undefined;
  BookingHistory: { initialTab?: 'history' | 'todo' } | undefined;
  Analytics: undefined;
  Promotions: undefined;
  InfoPacks: undefined;
  Clientele: undefined;
  ProviderSchedule: undefined;
  AddBooking: undefined;
  BookingDetail: { bookingId: string; booking?: any; groupSiblings?: any[] };
  ProviderIntakeForm: {
    bookingId: string;
    clientUserId: string;
    serviceName: string;
    formId?: string;
  };
  ProviderInbox:
    | { initialFilter?: "all" | "pending" | "confirmed" | "done" | "messages" }
    | undefined;
  ProviderConversation: {
    conversationId: string;
    clientUserId: string;
    clientName: string;
  };
  ChangePassword: undefined;
  AccountInfo: undefined;
  // Business Details is a hub over these sub-screens.
  BusinessDetails: undefined;
  BusinessInfo: undefined;
  ServicesPricing: undefined;
  AboutYou: undefined;
  Scheduling: undefined;
  Payments: undefined;
  Policies: undefined;
  Communications: undefined;
  Automations: undefined;
  BusinessProfile: undefined;
  Branding: undefined;
  HelpCentre: undefined;
  About: undefined;
  Terms: undefined;
  ReportProblem: undefined;
  DevSettings: undefined;
};

// Provider Tab Navigator
export type ProviderTabParamList = {
  // Provider mode uses the isolated Becca stack (no client screens).
  Becca: NavigatorScreenParams<ProviderBeccaStackParamList>;
  ProviderHome: NavigatorScreenParams<ProviderHomeStackParamList>;
  MyServices: NavigatorScreenParams<ProviderServicesStackParamList>;
  Profile: NavigatorScreenParams<ProviderAccountStackParamList>;
};

// Tab Navigator
export type TabParamList = {
  Becca: NavigatorScreenParams<BeccaStackParamList>;
  Explore: NavigatorScreenParams<ExploreStackParamList>;
  Home: NavigatorScreenParams<HomeStackParamList>;
  Cart: NavigatorScreenParams<CartStackParamList>;
  Profile: NavigatorScreenParams<ProfileStackParamList>;
};

// ============================================================================
// COMPOSITE SCREEN PROPS (for type-safe navigation across stacks and tabs)
// ============================================================================

export type HomeScreenProps<T extends keyof HomeStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<HomeStackParamList, T>,
    CompositeScreenProps<
      BottomTabScreenProps<TabParamList>,
      StackScreenProps<RootStackParamList>
    >
  >;

export type ExploreScreenProps<T extends keyof ExploreStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<ExploreStackParamList, T>,
    CompositeScreenProps<
      BottomTabScreenProps<TabParamList>,
      StackScreenProps<RootStackParamList>
    >
  >;

export type BeccaScreenProps<T extends keyof BeccaStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<BeccaStackParamList, T>,
    CompositeScreenProps<
      BottomTabScreenProps<TabParamList>,
      StackScreenProps<RootStackParamList>
    >
  >;

export type CartScreenProps<T extends keyof CartStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<CartStackParamList, T>,
    CompositeScreenProps<
      BottomTabScreenProps<TabParamList>,
      StackScreenProps<RootStackParamList>
    >
  >;

export type ProfileScreenProps<T extends keyof ProfileStackParamList> =
  CompositeScreenProps<
    NativeStackScreenProps<ProfileStackParamList, T>,
    CompositeScreenProps<
      BottomTabScreenProps<TabParamList>,
      StackScreenProps<RootStackParamList>
    >
  >;

export type ProviderHomeScreenProps<
  T extends keyof ProviderHomeStackParamList,
> = CompositeScreenProps<
  NativeStackScreenProps<ProviderHomeStackParamList, T>,
  CompositeScreenProps<
    BottomTabScreenProps<ProviderTabParamList>,
    StackScreenProps<RootStackParamList>
  >
>;

export type ProviderServicesScreenProps<
  T extends keyof ProviderServicesStackParamList,
> = CompositeScreenProps<
  NativeStackScreenProps<ProviderServicesStackParamList, T>,
  CompositeScreenProps<
    BottomTabScreenProps<ProviderTabParamList>,
    StackScreenProps<RootStackParamList>
  >
>;

// ============================================================================
// LEGACY SUPPORT (for backwards compatibility)
// ============================================================================

export type CartMainScreenProps = CartScreenProps<"CartMain">;

// ============================================================================
// PROVIDER ID HELPERS
// ============================================================================

export const getProviderIdFromName = (providerName: string): string =>
  providerName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

export const getProviderDisplayName = (providerId: string): string =>
  providerId
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

export const NAVIGATION_SOURCES = {
  HOME: "home",
  EXPLORE: "explore",
  BECCA: "becca",
  CART: "cart",
  PROFILE: "profile",
} as const;

export type NavigationSource =
  (typeof NAVIGATION_SOURCES)[keyof typeof NAVIGATION_SOURCES];

export const isValidProviderId = (id: string): boolean =>
  /^[a-z0-9-]+$/.test(id);
