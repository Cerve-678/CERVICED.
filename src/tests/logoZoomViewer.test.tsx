import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { LogoZoomViewer } from '../components/LogoZoomViewer';

const logo = 'https://example.com/logo.png';

describe('LogoZoomViewer', () => {
  it('shows only the logo, and a tap anywhere closes it', () => {
    const onClose = jest.fn();
    const { getByLabelText, queryByText } = render(
      <LogoZoomViewer uri={logo} visible onClose={onClose} accessibilityName="Glow Studio" />,
    );
    // No page counter, caption or close button: just the logo.
    expect(queryByText(/Page|zoom/i)).toBeNull();
    fireEvent.press(getByLabelText('Glow Studio logo. Tap to close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('draws nothing for a provider without a logo', () => {
    const { toJSON } = render(
      <LogoZoomViewer uri={null} visible onClose={() => {}} accessibilityName="Glow Studio" />,
    );
    expect(toJSON()).toBeNull();
  });
});
