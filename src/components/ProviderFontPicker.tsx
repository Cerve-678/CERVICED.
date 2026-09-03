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

/** Grid of business-name font options — each option previews its own name in
 *  its actual font, so the picker doubles as the sample rather than needing a
 *  separate preview strip (mirrors ProviderThemePicker's swatch-as-preview shape). */
const ProviderFontPicker: React.FC<ProviderFontPickerProps> = ({
  value, onChange, accentColor, textColor, subColor, borderColor, cardColor,
}) => {
  return (
    <View style={styles.grid}>
      {PROVIDER_FONTS.map(f => {
        const isSelected = value === f.key;
        return (
          <TouchableOpacity
            key={f.key}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(f.key);
            }}
            activeOpacity={0.8}
            style={[
              styles.option,
              { backgroundColor: cardColor, borderColor: isSelected ? accentColor : borderColor },
            ]}
          >
            <Text style={[styles.preview, { fontFamily: f.fontFamily, color: textColor }]} numberOfLines={1}>
              Your Business
            </Text>
            <Text style={[styles.optionName, { color: isSelected ? textColor : subColor }]} numberOfLines={1}>
              {f.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
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
  preview: {
    fontSize: 17,
  },
  optionName: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 10,
    textAlign: 'center',
  },
});

export default ProviderFontPicker;
