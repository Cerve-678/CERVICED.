import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ProviderProfileScreen from '../screens/ProviderProfileScreen';

const mockRoute = { params: { providerId: 'styled-by-kathrine' } };
const mockNavigation = { setOptions: jest.fn(), goBack: jest.fn() };

describe('ProviderProfileScreen', () => {
  it('renders without crashing', () => {
    const { getByText } = render(
      <ProviderProfileScreen route={mockRoute} navigation={mockNavigation} />
    );
    expect(getByText('@KATHRINE')).toBeTruthy();
  });

  it('handles bell button press', () => {
    const { getByRole } = render(
      <ProviderProfileScreen route={mockRoute} navigation={mockNavigation} />
    );
    const bellButton = getByRole('button');
    fireEvent.press(bellButton);
    // Test notification animation
  });
});