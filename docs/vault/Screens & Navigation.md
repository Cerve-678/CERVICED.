# Screens & Navigation

52 screens (`src/screens/`), one app, **two modes**: client and provider.

## Navigation structure (`src/navigation/`)
- `AppNavigator.tsx` / `RootNavigation.tsx` — root.
- `modeController.ts` + `navigationRef.ts` — switch between **client** and **provider** experiences.
- `TabNavigator.tsx` (client) vs `ProviderTabNavigator.tsx` (provider).
- `Tabs/` — per-tab stacks: `HomeNavigator`, `ExploreNavigator`, `CartNavigator`, `BeccaNavigator`, `ProfileNavigator` (client) · `ProviderHomeNavigator`, `ProviderServicesNavigator`, `ProviderAccountNavigator` (provider).
- `types.ts` — route param types (e.g. `BookingHistory`, `BookingDetail`).

## Screens by area
- **Client booking**: `BookingsScreen` (→ [[Booking Flow]]), `CartScreen`, `HomeScreen`, `ExploreScreen`, `BookmarkedProvidersScreen`.
- **Provider bookings**: `ProviderBookingHistoryScreen` (grouped history + waitlist; recently redesigned, no calendar), `ProviderBookingDetailScreen` (confirm, release address, collect balance).
- **Provider business**: `ProviderAccountScreen`, `ProviderAutomationsScreen` (auto-accept, reminders), `ProviderPromotionsScreen`, `ProviderIntakeFormScreen`, `ProviderCommunications/Inbox/Conversation`, `ProviderMyProfileScreen`.
- **Onboarding**: `AuthScreen`, `InfoRegScreen`, `BrandingScreen` → [[Provider Onboarding & Go-Live]].
- **AI**: `BeccaScreen` (assistant) → [[Services]].
- **Dev**: `DevSettingsScreen` (test push + receipt, `dev_reset_provider`).

## Connections
[[Contexts]] · [[Booking Flow]] · [[Provider Onboarding & Go-Live]] · [[Notifications]]

## Open questions
- Full route map (which screen navigates where)? Could auto-list from `types.ts`. #todo
