import fs from 'fs';
import path from 'path';
import React from 'react';
import { render } from '@testing-library/react-native';
import { ProviderCard } from '../features/home/ProviderCard';
import type { LogoFraming } from '../types/database';

const mockFramedLogo = jest.fn((_props: Record<string, unknown>) => null);
jest.mock('../components/FramedLogo', () => ({
  FramedLogo: (props: Record<string, unknown>) => mockFramedLogo(props),
}));

beforeEach(() => mockFramedLogo.mockClear());

jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ palette: { card: '#FFF', border: '#EEE', surface: '#F5F1EC', text: '#1C1A18', sub: '#8A8680' } }),
}));

const framing: LogoFraming = { imageRatio: 2, small: { zoom: 0.6, x: 0.1, y: 0 } };
const provider = (logoFraming: LogoFraming | null) => ({
  name: 'Studio',
  service: 'HAIR',
  logo: { uri: 'https://example.com/logo.png' },
  logoFraming,
});

/**
 * Info Reg lets a provider pinch and drag their logo into each Home card's
 * shape. Home stopped reading that framing on 2026-10-20, so the framer kept
 * saving changes no client ever saw.
 */
describe('Home cards draw the logo the way the provider framed it', () => {
  it('uses the framing saved for this card shape', () => {
    render(
      <ProviderCard provider={provider(framing)} onPress={() => {}} style={{}} blurStyle={{}} logoSlot="small" />,
    );
    expect(mockFramedLogo).toHaveBeenCalledWith(expect.objectContaining({ framing, slot: 'small' }));
  });

  it('fills the card when the provider never framed this shape', () => {
    render(
      <ProviderCard provider={provider(framing)} onPress={() => {}} style={{}} blurStyle={{}} logoSlot="large" />,
    );
    expect(mockFramedLogo).not.toHaveBeenCalled();
  });

  it('fills cards of any other shape', () => {
    render(
      <ProviderCard provider={provider(framing)} onPress={() => {}} style={{}} blurStyle={{}} />,
    );
    expect(mockFramedLogo).not.toHaveBeenCalled();
  });

  it('gives every small and large Home card its shape', () => {
    const home = fs.readFileSync(path.join(__dirname, '..', 'screens', 'client', 'HomeScreen.tsx'), 'utf8');
    expect(home).toContain('logoFraming: p.logo_framing ?? null');
    expect(home).not.toMatch(/blurStyle=\{styles\.brandCardBlur\}(?! logoSlot="small")/);
    expect(home).not.toMatch(/blurStyle=\{styles\.providerBlur\}(?! logoSlot="large")/);
  });
});
