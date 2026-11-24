import React, { memo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { LogoCircle } from '../../components/FramedLogo';
import { useProviderLogoFraming } from './useProviderLogoFraming';

interface ProviderLogoCircleProps {
  /** The provider's DB id. Anything else (a slug) just draws unframed. */
  providerId: string | null | undefined;
  uri: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A provider's round logo where the screen only has the logo URL (a booking's
 * snapshot, a search row, a cart item): looks the circle framing up, batched
 * with every other row on screen, and draws it the way the provider set it.
 */
export const ProviderLogoCircle = memo(function ProviderLogoCircle({ providerId, uri, style }: ProviderLogoCircleProps) {
  const framing = useProviderLogoFraming(providerId, uri);
  return <LogoCircle uri={uri} framing={framing} style={style} />;
});
