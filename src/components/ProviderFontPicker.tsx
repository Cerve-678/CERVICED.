import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FONT_COLLECTIONS, PROVIDER_FONTS } from '../constants/providerFonts';

interface ProviderFontPickerProps {
  value: string;
  onChange: (key: string) => void;
  accentColor: string;
  textColor: string;
  subColor: string;
  borderColor: string;
  cardColor: string;
}

const PREVIEW_SIZE = 18;

/** One swipeable rail per collection, in which every option previews the
 *  business name in its real font — the same layout as the colour sets. */
const ProviderFontPicker: React.FC<ProviderFontPickerProps> = ({
  value,
  onChange,
  accentColor,
  textColor,
  subColor,
  borderColor,
  cardColor,
}) => (
  <View>
    {FONT_COLLECTIONS.map(collection => {
      const fonts = PROVIDER_FONTS.filter(f => f.collection === collection.key);
      if (fonts.length === 0) return null;
      return (
        <View key={collection.key} style={styles.collection}>
          <View style={styles.collectionHead}>
            <Text style={[styles.collectionName, { color: textColor }]}>{collection.name.toUpperCase()}</Text>
            <Text style={[styles.collectionDesc, { color: subColor }]} numberOfLines={1}>{collection.description}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {fonts.map(font => {
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
                  <Text
                    style={[
                      styles.preview,
                      { fontFamily: font.fontFamily, fontSize: PREVIEW_SIZE * (font.sizeScale ?? 1), color: textColor },
                    ]}
                    numberOfLines={1}
                  >
                    Your Business
                  </Text>
                  <Text style={[styles.optionName, { color: isSelected ? textColor : subColor }]} numberOfLines={1}>
                    {font.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  collection: { marginBottom: 14 },
  collectionHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 6 },
  collectionName: { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 1.2 },
  collectionDesc: { flex: 1, fontFamily: 'Jura-VariableFont_wght', fontWeight: '700', fontSize: 11 },
  rail: { flexDirection: 'row', gap: 10 },
  option: {
    width: 150,
    minHeight: 76,
    borderRadius: 12,
    borderWidth: 2,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  preview: { textAlign: 'center' },
  optionName: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 10,
    textAlign: 'center',
  },
});

export default ProviderFontPicker;
