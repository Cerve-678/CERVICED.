import React from 'react';
import { Share } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ProviderProfileQrSheet } from '../components/ProviderProfileQrSheet';
import { copyText } from '../utils/clipboard';

jest.mock('react-native-qrcode-svg', () => () => null);
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../utils/clipboard', () => ({ copyText: jest.fn() }));

function renderSheet() {
  return render(
    <ProviderProfileQrSheet
      visible
      providerSlug="amara-lashes"
      providerName="Amara Lashes"
      isLive
      accentColor="#4A2C1E"
      backgroundColor="#FFFFFF"
      textColor="#1A1A1A"
      subtextColor="#666666"
      borderColor="#DDDDDD"
      onClose={jest.fn()}
    />,
  );
}

describe('profile QR sheet: copy link', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
  });

  it('shows the page link and copies it, then says it was copied', async () => {
    (copyText as jest.Mock).mockResolvedValue(true);
    renderSheet();
    expect(screen.getByText('www.cerviced.co/@amara-lashes')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Copy link, www.cerviced.co/@amara-lashes'));
    });

    expect(copyText).toHaveBeenCalledWith('https://www.cerviced.co/@amara-lashes');
    expect(screen.getByText('Copied')).toBeTruthy();
    expect(Share.share).not.toHaveBeenCalled();
  });

  it('opens the share sheet instead when this build cannot copy', async () => {
    (copyText as jest.Mock).mockResolvedValue(false);
    renderSheet();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Copy link, www.cerviced.co/@amara-lashes'));
    });

    expect(Share.share).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://www.cerviced.co/@amara-lashes' }));
    expect(screen.queryByText('Copied')).toBeNull();
  });
});
