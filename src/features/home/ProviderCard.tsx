import React, { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../../contexts/ThemeContext';
import { FramedLogo } from '../../components/FramedLogo';
import { LOGO_CARD_SIZES } from '../../utils/logoFraming';
import type { LogoCardSlot, LogoFraming } from '../../types/database';

interface ProviderCardProps {
  provider: { name: string; service: string; logo: any; logoFraming?: LogoFraming | null };
  onPress: () => void;
  style: any;
  blurStyle: any;
  /** Which of the provider's framed card shapes this card is: the small
   *  (brandCardBlur) or large (providerBlur) Home card. Cards of any other
   *  shape fill and centre the logo. */
  logoSlot?: LogoCardSlot;
}

/** Compact provider card used by every Home discovery section. */
export const ProviderCard = memo<ProviderCardProps>(({ provider, onPress, style, blurStyle, logoSlot }) => {
  const { palette: P } = useTheme();
  // The framing a provider set for this card shape in Info Reg. Without it
  // the logo fills the card, exactly as before framing existed.
  const framed = logoSlot && provider.logo?.uri && provider.logoFraming?.[logoSlot];
  return (
    <TouchableOpacity style={style} onPress={onPress} activeOpacity={0.75}>
      <View style={[blurStyle, { backgroundColor: P.card, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
        {framed ? (
          <FramedLogo
            uri={provider.logo.uri}
            framing={provider.logoFraming}
            slot={logoSlot}
            style={{ borderRadius: LOGO_CARD_SIZES[logoSlot].radius }}
          />
        ) : provider.logo ? <Image source={provider.logo} style={styles.providerImage} contentFit="cover" transition={0} /> : (
          <View style={[styles.placeholderCard, { backgroundColor: P.surface }]}><Text style={[styles.placeholderText, { color: P.sub }]}>{provider.service}</Text></View>
        )}
      </View>
      <Text style={[styles.providerCardName, { color: P.text }]} numberOfLines={1}>{provider.name}</Text>
      <Text style={[styles.providerCardSub, { color: P.sub }]} numberOfLines={1}>{provider.service}</Text>
    </TouchableOpacity>
  );
});
ProviderCard.displayName = 'ProviderCard';

const styles = StyleSheet.create({
  // The parent card owns the clipping radius (12 for compact, 16 for large).
  // Giving every image a 16px radius left uncovered corners on compact cards.
  providerImage: { position: 'absolute', width: '100%', height: '100%' },
  placeholderCard: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  placeholderText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3, textAlign: 'center' },
  providerCardName: { fontSize: 12, fontWeight: '600', marginTop: 5, letterSpacing: 0.1 },
  providerCardSub: { fontSize: 11, fontWeight: '400', marginTop: 1, opacity: 0.8 },
});
