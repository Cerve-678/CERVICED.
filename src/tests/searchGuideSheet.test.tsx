import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import SearchGuideSheet, { AVAILABILITY_INFO } from '../features/providers/SearchGuideSheet';
import { BUSINESS_TYPE_META } from '../features/business-details/options';
import type { AppTheme } from '../constants/theme';

const P = new Proxy({}, { get: () => '#3F1E36' }) as AppTheme;

describe('SearchGuideSheet', () => {
  it('explains every venue type in the words a booking uses', () => {
    render(<SearchGuideSheet visible onClose={() => {}} P={P} bottomInset={0} />);

    for (const meta of Object.values(BUSINESS_TYPE_META)) {
      expect(screen.getByText(meta.label)).toBeTruthy();
      expect(screen.getByText(`${meta.clientVenueLabel}.`)).toBeTruthy();
    }
  });

  it('shows the same availability badges the cards show, and what no badge means', () => {
    render(<SearchGuideSheet visible onClose={() => {}} P={P} bottomInset={0} />);

    expect(screen.getByText(AVAILABILITY_INFO.available!.label)).toBeTruthy();
    expect(screen.getByText(AVAILABILITY_INFO.limited!.label)).toBeTruthy();
    expect(screen.getByText('No badge')).toBeTruthy();
    // 'none' covers "never set hours" too, so it must never become a badge.
    expect(AVAILABILITY_INFO.none).toBeUndefined();
  });

  it('closes from Done', () => {
    const onClose = jest.fn();
    render(<SearchGuideSheet visible onClose={onClose} P={P} bottomInset={0} />);

    fireEvent.press(screen.getByText('Done'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
