import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockUpdateUser = jest.fn();
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ updateUser: mockUpdateUser, user: null }),
}));
jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDarkMode: false,
    palette: { bg: '#fff', text: '#000', sub: '#666', accent: '#AF9197', onAccent: '#fff', border: '#ddd' },
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../utils/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { missingBookingDetails } from '../features/bookings/beforeYouBook';
import { BeforeYouBookSheet } from '../features/bookings/BeforeYouBookSheet';

describe('missingBookingDetails', () => {
  it('asks an Apple account for only what Apple did not share', () => {
    expect(missingBookingDetails({ name: 'Ana Lee', phone: '', dob: '', hasClientProfile: true }))
      .toEqual(['phone', 'dob']);
    expect(missingBookingDetails({ name: '', phone: '', dob: '', hasClientProfile: true }))
      .toEqual(['name', 'phone', 'dob']);
  });

  it('asks nothing of a complete account', () => {
    expect(missingBookingDetails({ name: 'Ana', phone: '07123456789', dob: '1994-07-02', hasClientProfile: true }))
      .toEqual([]);
  });

  it('asks nothing while the users row has not been read', () => {
    expect(missingBookingDetails({ name: 'ana', phone: '', dob: '' })).toEqual([]);
    expect(missingBookingDetails(null)).toEqual([]);
  });
});

describe('BeforeYouBookSheet', () => {
  beforeEach(() => jest.clearAllMocks());

  const renderSheet = () => {
    const onDone = jest.fn();
    const screen = render(
      <BeforeYouBookSheet visible missing={['phone', 'dob']} onClose={jest.fn()} onDone={onDone} />,
    );
    return { ...screen, onDone };
  };

  it('only shows what is missing and holds until it is valid', async () => {
    const { queryByText, getByText, onDone } = renderSheet();
    expect(queryByText('FULL NAME')).toBeNull();
    fireEvent.press(getByText('Continue'));
    await waitFor(() => expect(getByText('Phone number is required')).toBeTruthy());
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('saves only the missing fields, then lets the booking carry on', async () => {
    mockUpdateUser.mockResolvedValue(undefined);
    const { getByPlaceholderText, getByText, onDone, getAllByPlaceholderText } = renderSheet();
    fireEvent.changeText(getByPlaceholderText('07123 456789'), ' 07123 456789 ');
    const [day, month, year] = [
      getAllByPlaceholderText('DD')[0]!, getAllByPlaceholderText('MM')[0]!, getAllByPlaceholderText('YYYY')[0]!,
    ];
    fireEvent.changeText(day, '02');
    fireEvent.changeText(month, '07');
    fireEvent.changeText(year, '1994');
    fireEvent.press(getByText('Continue'));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(mockUpdateUser).toHaveBeenCalledWith({ phone: '07123 456789', dob: '1994-07-02' });
  });

  it('stays open and says so when saving fails', async () => {
    mockUpdateUser.mockRejectedValue(new Error('offline'));
    const { getByPlaceholderText, getAllByPlaceholderText, getByText, onDone } = renderSheet();
    fireEvent.changeText(getByPlaceholderText('07123 456789'), '07123456789');
    fireEvent.changeText(getAllByPlaceholderText('DD')[0]!, '02');
    fireEvent.changeText(getAllByPlaceholderText('MM')[0]!, '07');
    fireEvent.changeText(getAllByPlaceholderText('YYYY')[0]!, '1994');
    fireEvent.press(getByText('Continue'));
    await waitFor(() => expect(getByText("We couldn't save your details. Please try again.")).toBeTruthy());
    expect(onDone).not.toHaveBeenCalled();
  });
});
