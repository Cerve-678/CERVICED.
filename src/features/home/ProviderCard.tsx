import React, { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../../contexts/ThemeContext';

interface ProviderCardProps {
  provider: { name: string; service: string; logo: any };
  onPress: () => void;
  style: any;
  blurStyle: any;
}

/** Compact provider card used by every Home discovery section. */
export const ProviderCard = memo<ProviderCardProps>(({ provider, onPress, style, blurStyle }) => {
  const { palette: P } = useTheme();
  return (
    <TouchableOpacity style={style} onPress={onPress} activeOpacity={0.75}>
      <View style={[blurStyle, { backgroundColor: P.card, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
        {provider.logo ? <Image source={provider.logo} style={styles.providerImage} contentFit="cover" transition={0} /> : (
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
  providerImage: { position: 'absolute', width: '100%', height: '100%', borderRadius: 16 },
  placeholderCard: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  placeholderText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3, textAlign: 'center' },
  providerCardName: { fontSize: 12, fontWeight: '600', marginTop: 5, letterSpacing: 0.1 },
  providerCardSub: { fontSize: 11, fontWeight: '400', marginTop: 1, opacity: 0.8 },
});
