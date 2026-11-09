import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { createNavigationContainerRef, NavigationContainer, type NavigationState } from '@react-navigation/native';
import ProviderTabNavigation from '../navigation/provider/ProviderTabNavigator';

// The real tab navigator and My Profile stack, with the screens replaced by
// stubs that press the same navigation calls: which screen X lands on is the
// navigators' doing, so this is what has to be real.
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ myBookingMode: 'platform', myProviderIdStatus: 'resolved' }),
}));
jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: { text: '#000' }, isDarkMode: false, palette: { accent: '#000', card: '#fff', text: '#000', sub: '#000', border: '#000', bg: '#fff', surface: '#fff' } }),
}));
jest.mock('../components/ThemedBackground', () => ({ ThemedBackground: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('../components/TabIcon', () => () => null);
jest.mock('../components/ErrorBoundary', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('../components/IslandPillTabBar', () => () => null);

function mockStub(label: string) {
  const { Text: T } = jest.requireActual('react-native');
  return { __esModule: true, default: () => <T>{label}</T> };
}
jest.mock('../navigation/provider/tabs/ProviderBeccaNavigator', () => mockStub('Becca'));
jest.mock('../navigation/provider/tabs/ProviderHomeNavigator', () => mockStub('Calendar'));
jest.mock('../navigation/provider/tabs/LinkOnlyPortfolioNavigator', () => mockStub('Portfolio'));
jest.mock('../navigation/provider/tabs/LinkOnlyMessagesNavigator', () => mockStub('Messages'));
jest.mock('../screens/provider/LinkOnlyHomeScreen', () => mockStub('LinkOnlyHome'));

jest.mock('../screens/provider/ProviderMyProfileScreen', () => {
  const { Text: T, TouchableOpacity: Touch } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({ navigation }: { navigation: { navigate: (name: string, params?: object) => void } }) => (
      <>
        <T>My Profile</T>
        <Touch onPress={() => navigation.navigate('Payments')}><T>Open Payments</T></Touch>
        <Touch onPress={() => navigation.navigate('BookingDetail', { bookingId: 'b' })}><T>Open Booking</T></Touch>
      </>
    ),
  };
});
function mockCloses(label: string) {
  const { Text: T, TouchableOpacity: Touch } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({ navigation }: { navigation: never }) => (
      <>
        <T>{label}</T>
        <Touch onPress={() => jest.requireActual('../navigation/closeWithinTab').closeWithinTab(navigation)}><T>Close</T></Touch>
      </>
    ),
  };
}
jest.mock('../screens/provider/PaymentsScreen', () => mockCloses('Payments'));
jest.mock('../screens/provider/ProviderBookingDetailScreen', () => mockCloses('Booking'));
jest.mock('../screens/provider/InfoRegScreen', () => mockStub('InfoReg'));
jest.mock('../screens/provider/ProviderIntakeFormScreen', () => mockStub('Intake'));
jest.mock('../screens/provider/ProviderPromotionsScreen', () => mockStub('Promotions'));
jest.mock('../screens/provider/ProviderClienteleScreen', () => mockStub('Clientele'));
jest.mock('../screens/provider/ProviderInfoPackScreen', () => mockStub('InfoPack'));
jest.mock('../screens/provider/ProviderConversationScreen', () => mockStub('Conversation'));
jest.mock('../screens/provider/ProviderScheduleScreen', () => mockStub('Schedule'));
jest.mock('../screens/provider/BusinessInfoScreen', () => mockStub('BusinessInfo'));
jest.mock('../screens/provider/SchedulingScreen', () => mockStub('Scheduling'));
jest.mock('../screens/provider/PoliciesScreen', () => mockStub('Policies'));
jest.mock('../screens/provider/BrandingScreen', () => mockStub('Branding'));
jest.mock('../screens/provider/ProviderAnalyticsScreen', () => mockStub('Analytics'));
jest.mock('../screens/provider/AddBookingScreen', () => mockStub('AddBooking'));
jest.mock('../screens/shared/DevSettingsScreen', () => mockStub('Dev'));

jest.mock('../screens/provider/ProviderAccountScreen', () => {
  const { Text: T, TouchableOpacity: Touch } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({ navigation }: { navigation: { navigate: (name: string) => void } }) => (
      <>
        <T>Account</T>
        <Touch onPress={() => navigation.navigate('BusinessProfile')}><T>Open Business Profile</T></Touch>
        <Touch onPress={() => navigation.navigate('BookingHistory')}><T>Open History</T></Touch>
      </>
    ),
  };
});
jest.mock('../screens/provider/BusinessProfileScreen', () => {
  const { Text: T, TouchableOpacity: Touch } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({ navigation }: { navigation: { navigate: (name: string) => void } }) => (
      <>
        <T>Business Profile</T>
        <Touch onPress={() => navigation.navigate('Payments')}><T>Open Payments</T></Touch>
      </>
    ),
  };
});
jest.mock('../screens/provider/ProviderNotificationSettingsScreen', () => mockStub('ProviderNotificationSettingsScreen'));
jest.mock('../screens/provider/ProviderAchievementsScreen', () => mockStub('ProviderAchievementsScreen'));

jest.mock('../screens/provider/ProviderInboxScreen', () => mockStub('ProviderInboxScreen'));
jest.mock('../screens/shared/ChangePasswordScreen', () => mockStub('ChangePasswordScreen'));
jest.mock('../screens/shared/HelpCentreScreen', () => mockStub('HelpCentreScreen'));
jest.mock('../screens/shared/TextSizingScreen', () => mockStub('TextSizingScreen'));
jest.mock('../screens/shared/LanguageRegionScreen', () => mockStub('LanguageRegionScreen'));
jest.mock('../screens/shared/ReportProblemScreen', () => mockStub('ReportProblemScreen'));
jest.mock('../screens/shared/AdminMoneyScreen', () => mockStub('AdminMoneyScreen'));
jest.mock('../screens/provider/BusinessDetailsScreen', () => mockStub('BusinessDetailsScreen'));
jest.mock('../screens/provider/ServicesPricingScreen', () => mockStub('ServicesPricingScreen'));
jest.mock('../screens/provider/AboutYouScreen', () => mockStub('AboutYouScreen'));
jest.mock('../screens/provider/ProviderCommunicationsScreen', () => mockStub('ProviderCommunicationsScreen'));
jest.mock('../screens/provider/ProviderAutomationsScreen', () => mockStub('ProviderAutomationsScreen'));
jest.mock('../screens/provider/ProviderAccountInfoScreen', () => mockStub('ProviderAccountInfoScreen'));
jest.mock('../screens/client/ProviderProfileScreen', () => mockStub('ProviderProfileScreen'));

function focusedPath(state: NavigationState | undefined): string[] {
  if (!state) return [];
  const route = state.routes[state.index];
  if (!route) return [];
  return [route.name, ...focusedPath(route.state as NavigationState | undefined)];
}

function renderTabs() {
  const ref = createNavigationContainerRef();
  render(
    <NavigationContainer ref={ref}>
      <ProviderTabNavigation />
    </NavigationContainer>,
  );
  return ref;
}

it.each([
  ['Open Payments', 'Payments'],
  ['Open Booking', 'Booking'],
])('%s from My Profile: closing goes back to My Profile, not the calendar', (open) => {
  const ref = renderTabs();
  act(() => { (ref as unknown as { navigate: (name: string) => void }).navigate('MyServices'); });
  expect(screen.getByText('My Profile')).toBeTruthy();

  fireEvent.press(screen.getByText(open));
  expect(focusedPath(ref.getRootState())).toContain(open === 'Open Payments' ? 'Payments' : 'BookingDetail');

  fireEvent.press(screen.getByText('Close'));
  expect(focusedPath(ref.getRootState())).toEqual(['MyServices', 'ProviderServicesMain']);
});

it('Payments from Business Profile: closing goes back to Business Profile, not the calendar', () => {
  const ref = renderTabs();
  act(() => { (ref as unknown as { navigate: (name: string) => void }).navigate('Profile'); });
  fireEvent.press(screen.getByText('Open Business Profile'));
  fireEvent.press(screen.getByText('Open Payments'));
  expect(focusedPath(ref.getRootState())).toEqual(['Profile', 'Payments']);
  fireEvent.press(screen.getByText('Close'));
  expect(focusedPath(ref.getRootState())).toEqual(['Profile', 'BusinessProfile']);
});

it.each([
  ['MyServices', 'ProviderServicesMain'],
  ['Profile', 'ProviderAccountMain'],
])('Payments alone on the %s stack: closing stays in that tab instead of falling through to the calendar', (tab, root) => {
  const ref = renderTabs();
  // A nested navigate without initial: false into a tab that hasn't mounted,
  // the way a deep link can land, leaves Payments as the stack's only route.
  act(() => { (ref as unknown as { navigate: (name: string, params: object) => void }).navigate(tab, { screen: 'Payments' }); });
  expect(focusedPath(ref.getRootState())).toEqual([tab, 'Payments']);

  fireEvent.press(screen.getByText('Close'));
  expect(focusedPath(ref.getRootState())).toEqual([tab, root]);
});
