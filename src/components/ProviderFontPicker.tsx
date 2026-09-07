import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { PROVIDER_FONTS } from '../constants/providerFonts';

interface ProviderFontPickerProps {
  value: string;
  onChange: (key: string) => void;
  accentColor: string;
  textColor: string;
  subColor: string;
  borderColor: string;
  cardColor: string;
}

/** A grid in which every option previews the business name in its real font. */
const ProviderFontPicker: React.FC<ProviderFontPickerProps> = ({
  value,
  onChange,
  accentColor,
  textColor,
  subColor,
  borderColor,
  cardColor,
}) => (
  <View style={styles.grid}>
    {PROVIDER_FONTS.map(font => {
      const isSelected = value === font.key;
      return (
        <TouchableOpacity
          key={font.key}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onChange(font.key);
          }}
          activeOpacity={0.8}
          style={[
            styles.option,
            { backgroundColor: cardColor, borderColor: isSelected ? accentColor : borderColor },
          ]}
          accessibilityRole="radio"
          accessibilityState={{ checked: isSelected }}
          accessibilityLabel={font.name}
        >
          <Text style={[styles.preview, { fontFamily: font.fontFamily, color: textColor }]} numberOfLines={1}>
            Your Business
          </Text>
          <Text style={[styles.optionName, { color: isSelected ? textColor : subColor }]} numberOfLines={1}>
            {font.name}
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  option: {
    borderRadius: 12,
    borderWidth: 2,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 6,
    minWidth: '31%',
    flexGrow: 1,
  },
  preview: { fontSize: 17 },
  optionName: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 10,
    textAlign: 'center',
  },
});

export default ProviderFontPicker;
