import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react-native';
import SearchScreen from '../screens/client/SearchScreen';
import { getProviders } from '../services/databaseService';

jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: jest.fn(), setOptions: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));
jest.mock('../contexts/ThemeContext', () => ({
  useEnterpriseTheme: () => ({ isDarkMode: false, theme: {} }),
  useTheme: () => ({ isDarkMode: false, palette: new Proxy({}, { get: () => '#1A1815' }), theme: {} }),
}));
jest.mock('../services/clientLocationService', () => ({
  resolveClientLocation: jest.fn(async () => ({ coords: null })),
}));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('../services/userLearningService', () => ({
  __esModule: true,
  default: { trackFilter: jest.fn(async () => {}), trackSearch: jest.fn(async () => {}) },
}));
jest.mock('../services/databaseService', () => ({
  getProviders: jest.fn(),
  searchProviders: jest.fn(async () => []),
  logSearchEvent: jest.fn(),
  getProvidersAvailability: jest.fn(async () => new Map()),
  getProviderServiceFacets: jest.fn(async () => ({ priceRanges: new Map(), audiences: new Map(), skinTones: new Map() })),
  prefetchProviderBySlug: jest.fn(),
}));

const provider = (slug: string, cat: string) => ({
  id: `id-${slug}`, slug, display_name: `Salon ${slug}`, service_category: cat, service_categories: [cat],
  rating: 4, review_count: 1, location_text: 'London', service_locations: [],
});

describe('Search tab switching', () => {
  it('shows the tapped tab\'s providers', async () => {
    (getProviders as jest.Mock).mockImplementation(async (cat?: string) =>
      cat === 'NAILS' ? [provider('nails-one', 'NAILS')]
      : cat === 'HAIR' ? [provider('hair-one', 'HAIR')]
      : [provider('all-one', 'HAIR')]);

    render(<SearchScreen route={{ params: {} } as never} navigation={{ navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() } as never} />);
    await waitFor(() => expect(screen.getAllByText('Salon all-one').length).toBeGreaterThan(0));

    fireEvent.press(screen.getByText('Nails'));
    await waitFor(() => expect(screen.getAllByText('Salon nails-one').length).toBeGreaterThan(0));

    fireEvent.press(screen.getByText('Hair'));
    await waitFor(() => expect(screen.getAllByText('Salon hair-one').length).toBeGreaterThan(0));
    expect(screen.queryByText('Salon nails-one')).toBeNull();
  });
});

describe('Search tab switching under races', () => {
  const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>(r => { resolve = r; });
    return { promise, resolve };
  };

  it('keeps the LAST tapped tab when an earlier reply lands after a later one', async () => {
    const nails = deferred<unknown[]>();
    const hair = deferred<unknown[]>();
    (getProviders as jest.Mock).mockImplementation((cat?: string) =>
      cat === 'NAILS' ? nails.promise : cat === 'HAIR' ? hair.promise : Promise.resolve([provider('all-one', 'HAIR')]));

    render(<SearchScreen route={{ params: {} } as never} navigation={{ navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() } as never} />);
    await waitFor(() => expect(screen.getAllByText('Salon all-one').length).toBeGreaterThan(0));

    fireEvent.press(screen.getByText('Nails'));
    fireEvent.press(screen.getByText('Hair'));
    await act(async () => { hair.resolve([provider('hair-one', 'HAIR')]); });
    await act(async () => { nails.resolve([provider('nails-one', 'NAILS')]); });

    await waitFor(() => expect(screen.getAllByText('Salon hair-one').length).toBeGreaterThan(0));
    expect(screen.queryByText('Salon nails-one')).toBeNull();
  });

  it('shows the new tab even when the first reply is still in flight at mount', async () => {
    const first = deferred<unknown[]>();
    (getProviders as jest.Mock).mockImplementation((cat?: string) =>
      cat === 'NAILS' ? Promise.resolve([provider('nails-one', 'NAILS')]) : first.promise);

    render(<SearchScreen route={{ params: {} } as never} navigation={{ navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() } as never} />);
    fireEvent.press(screen.getByText('Nails'));
    await waitFor(() => expect(screen.getAllByText('Salon nails-one').length).toBeGreaterThan(0));
    await act(async () => { first.resolve([provider('all-one', 'HAIR')]); });
    expect(screen.queryByText('Salon all-one')).toBeNull();
    expect(screen.getAllByText('Salon nails-one').length).toBeGreaterThan(0);
  });

  it('tapping the active tab again returns to All', async () => {
    (getProviders as jest.Mock).mockImplementation(async (cat?: string) =>
      cat === 'NAILS' ? [provider('nails-one', 'NAILS')] : [provider('all-one', 'HAIR')]);
    render(<SearchScreen route={{ params: {} } as never} navigation={{ navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() } as never} />);
    await waitFor(() => expect(screen.getAllByText('Salon all-one').length).toBeGreaterThan(0));
    fireEvent.press(screen.getByText('Nails'));
    await waitFor(() => expect(screen.getAllByText('Salon nails-one').length).toBeGreaterThan(0));
    fireEvent.press(screen.getByText('Nails'));
    await waitFor(() => expect(screen.getAllByText('Salon all-one').length).toBeGreaterThan(0));
  });
});
