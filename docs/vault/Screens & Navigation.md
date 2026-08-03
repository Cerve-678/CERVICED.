# Screens & Navigation

65 screens, one app, **two modes**: client and provider. **Reorganized into subfolders** (previously all flat under `src/screens/` / `src/navigation/`) — `src/screens/{auth,client,provider,shared}/` and `src/navigation/{client,provider}/`. The [[Setup — Using This Vault|vault generator]] has since been updated to recurse into the nested layout — auto-generated screen notes are current again.

## Screens by folder
- **`src/screens/auth/`** — `AuthScreen`, `ReactivateAccountScreen`, login/signup/password-reset screens.
- **`src/screens/client/`** — `BookingsScreen` (→ [[Booking Flow]]), `BookingDetailScreen`, `CartScreen`, `HomeScreen`, `ExploreScreen`, `SearchScreen`, `BookmarkedProvidersScreen`, `RescheduleScreen`, `ProviderProfileScreen` (client's read-only view of a provider), `ProviderChatScreen`, `UserProfileScreen`, `ProfileInfoScreen`, `PaymentMethodsScreen`, `SubscriptionScreen`, `PointsScreen`, `OffersScreen`, `MessagesScreen`, `NotificationsSettingsScreen`, `ClientIntakeFormScreen`, `BeautyProfileScreen`, `BeautyBillingScreen`.
- **`src/screens/provider/`** — `ProviderHomeScreen`, `ProviderBookingHistoryScreen` (grouped history + waitlist → [[Waitlist]]), `ProviderBookingDetailScreen` (confirm, release address → [[Address Release]], collect balance), `ProviderAccountScreen`/`ProviderAccountInfoScreen`, `ProviderAutomationsScreen` (auto-accept, reminders), `ProviderMyProfileScreen`, `ProviderScheduleScreen`, `ProviderAnalyticsScreen`, `ProviderPromotionsScreen`, `ProviderIntakeFormScreen`, `ProviderInfoPackScreen`, `ProviderClienteleScreen`, `ProviderCommunicationsScreen`/`ProviderInboxScreen`/`ProviderConversationScreen`, `ProviderBusinessEmailScreen`, `BrandingScreen`, `BusinessProfileScreen`.
- **`src/screens/shared/`** — used by both modes: `InfoRegScreen` (→ [[Provider Onboarding & Go-Live]] — provider signup **and** its own edit-profile screen for business type/address/policy), `BeccaScreen` (AI assistant → [[Services]]), `NotificationsScreen`, `DevSettingsScreen` (test push + receipt, `dev_reset_provider`), `TermsScreen`, `InfoScreen`, `AboutScreen`, `HelpCentreScreen`, `ReportProblemScreen`, `ChangeCredentialsScreen`/`ChangePasswordScreen`.

## Navigation structure (`src/navigation/`)
- `RootNavigation.tsx` — root; `modeController.ts` + `navigationRef.ts` switch between **client** and **provider** experiences.
- **`client/`** — `ClientTabNavigator.tsx` (was `TabNavigator.tsx`) + `client/tabs/`: `HomeNavigator`, `ExploreNavigator`, `CartNavigator`, `BeccaNavigator`, `ProfileNavigator`.
- **`provider/`** — `ProviderTabNavigator.tsx` + `provider/tabs/`: `ProviderHomeNavigator`, `ProviderServicesNavigator`, `ProviderAccountNavigator`, `ProviderBeccaNavigator`.
- `types.ts` — route param types (e.g. `BookingHistory`, `BookingDetail`).

## Connections
[[Contexts]] · [[Booking Flow]] · [[Provider Onboarding & Go-Live]] · [[Notifications]] · [[Waitlist]]

## Open questions
- Full route map (which screen navigates where)? Could auto-list from `types.ts`. #todo
