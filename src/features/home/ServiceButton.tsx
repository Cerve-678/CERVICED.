import React, { memo } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation, type TranslationKey } from '../../i18n';

// `service` is the stored category id; only what's drawn is translated.
const SERVICE_LABEL_KEYS: Record<string, TranslationKey> = {
  HAIR: 'discover.category.hair',
  NAILS: 'discover.category.nails',
  LASHES: 'discover.category.lashes',
  MUA: 'discover.category.mua',
  BROWS: 'discover.category.brows',
  AESTHETICS: 'discover.category.aesthetics',
};

interface ServiceButtonProps {
  service: string;
  isSelected: boolean;
  onPress: () => void;
  onBack?: () => void;
  showBackArrow?: boolean;
}

/** Home discovery service filter control. */
export const ServiceButton = memo<ServiceButtonProps>(({ service, isSelected, onPress }) => {
  const { palette: P } = useTheme();
  const { t } = useTranslation();
  const labelKey = SERVICE_LABEL_KEYS[service];
  return (
    <TouchableOpacity style={styles.button} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.card, { backgroundColor: isSelected ? P.accent : P.surface, borderColor: P.border, borderWidth: StyleSheet.hairlineWidth }]}>
        <Text style={[styles.text, { color: isSelected ? P.onAccent : P.text }]}>{labelKey ? t(labelKey).toUpperCase() : service}</Text>
      </View>
    </TouchableOpacity>
  );
});
ServiceButton.displayName = 'ServiceButton';

const styles = StyleSheet.create({
  button: { marginRight: 10 },
  card: { borderRadius: 14, paddingHorizontal: Platform.OS === 'android' ? 18 : 22, height: Platform.OS === 'android' ? 30 : 34, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  text: { fontFamily: 'BakbakOne-Regular', fontSize: 12 },
});
