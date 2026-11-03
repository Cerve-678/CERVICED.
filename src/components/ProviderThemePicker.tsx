import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  PROVIDER_THEMES,
  SHEET_OPTIONS,
  THEME_COLLECTIONS,
} from '../constants/providerThemes';

// Swatch options for the Custom colour set builder, drawn from the same
// families as the collections so a home-made set sits as well as a preset.
// A colour saved from the older, brighter lists still shows on the profile;
// it just isn't offered here any more.
// Backdrop = hero colour behind the profile top (becomes the gradient).
export const CUSTOM_BACKDROP_OPTIONS = [
  '#D8C6AF', '#C9B2A3', '#9C8F84', '#E6B3B9', '#B9CFE3',
  '#B4807A', '#7F9A6E', '#D9703A', '#A92536', '#2747A0',
  '#1D4A3C', '#1D2C52', '#3C1F3E', '#113A41', '#2D2D2D',
];
// Card tones — includes the beige (#F1EAE2).
export const CUSTOM_CARD_OPTIONS = [
  '#FFFFFF', '#FFFDFB', '#F1EAE2', '#F9E9EE', '#FDF5F7',
  '#FCF8F0', '#F7FAF3', '#F9F6FD', '#F6FAFC',
];
export const CUSTOM_ACCENT_OPTIONS = [
  '#7A5A43', '#8C5647', '#4A403A', '#23262E', '#6A3D3A',
  '#3A211C', '#A98235', '#C29E76', '#B9643F', '#D9714F',
  '#E99AAE', '#D88A9B', '#66805F', '#2C3527', '#2C5AA0',
  '#1E2A4A',
];

export interface ThemeSelection {
  themeChoice: string;      // preset key or 'custom'
  customBackdrop: string;
  customCard: string;
  customAccent: string;
  sheetColor: string;       // content-area colour (beige/blush)
}

interface ProviderThemePickerProps {
  value: ThemeSelection;
  onChange: (next: ThemeSelection) => void;
  /** Called alongside onChange with the colours other form state may need. */
  onColorsResolved?: (colors: { accent: string; backdrop: string }) => void;
  textColor: string;
  subColor: string;
  borderColor: string;
  sepColor: string;
}

/** One theme option's swatch: a small gradient chip (the real backdrop blend)
 *  plus the accent as a dot overlaid on it, so the picker shows what the
 *  profile will actually look like instead of three disconnected dots. */
const ThemeSwatch: React.FC<{ accent: string; gradient: [string, string]; borderColor: string }> = (
  { accent, gradient, borderColor }
) => (
  <View style={[styles.swatchChip, { borderColor }]}>
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
    <View style={[styles.accentDot, { backgroundColor: accent, borderColor }]} />
  </View>
);

const ProviderThemePicker: React.FC<ProviderThemePickerProps> = ({
  value, onChange, onColorsResolved, textColor, subColor, borderColor, sepColor,
}) => {
  const { themeChoice, customBackdrop, customCard, customAccent, sheetColor } = value;

  const select = (patch: Partial<ThemeSelection>, resolved: { accent: string; backdrop: string }) => {
    Haptics.selectionAsync().catch(() => {});
    onChange({ ...value, ...patch });
    onColorsResolved?.(resolved);
  };

  return (
    <View>
      {/* Preset sets, one swipeable rail per collection */}
      {THEME_COLLECTIONS.map(collection => {
        const themes = PROVIDER_THEMES.filter(t => t.collection === collection.key);
        if (themes.length === 0) return null;
        return (
          <View key={collection.key} style={styles.collection}>
            <View style={styles.collectionHead}>
              <Text style={[styles.collectionName, { color: textColor }]}>{collection.name.toUpperCase()}</Text>
              <Text style={[styles.collectionDesc, { color: subColor }]} numberOfLines={1}>{collection.description}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {themes.map(t => {
                const isSelected = themeChoice === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    onPress={() => {
                      // Switching theme also defaults the content-area colour to
                      // whichever one best complements this palette — still
                      // overridable afterwards via the CONTENT AREA row below.
                      const suggested = SHEET_OPTIONS.find(o => o.key === t.suggestedSheet);
                      select(
                        { themeChoice: t.key, ...(suggested ? { sheetColor: suggested.color } : {}) },
                        { accent: t.tokens.accent, backdrop: t.tokens.hero }
                      );
                    }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${t.name}: ${t.description}`}
                    style={[
                      styles.option,
                      { borderColor: 'transparent' },
                      isSelected && { borderColor: t.tokens.accent },
                    ]}
                  >
                    <ThemeSwatch accent={t.tokens.accent} gradient={t.tokens.gradient} borderColor={borderColor} />
                    <Text style={[styles.optionName, { color: isSelected ? textColor : subColor }]} numberOfLines={2}>
                      {t.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        );
      })}

      <View style={styles.collection}>
        <View style={styles.collectionHead}>
          <Text style={[styles.collectionName, { color: textColor }]}>MAKE YOUR OWN</Text>
          <Text style={[styles.collectionDesc, { color: subColor }]} numberOfLines={1}>Pick each colour yourself</Text>
        </View>
        <View style={styles.rail}>
          <TouchableOpacity
            onPress={() => select(
              { themeChoice: 'custom' },
              { accent: customAccent, backdrop: customBackdrop }
            )}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: themeChoice === 'custom' }}
            style={[
              styles.option,
              { borderColor: 'transparent' },
              themeChoice === 'custom' && { borderColor: customAccent },
            ]}
          >
            <ThemeSwatch accent={customAccent} gradient={[customBackdrop, customCard]} borderColor={borderColor} />
            <Text style={[styles.optionName, { color: themeChoice === 'custom' ? textColor : subColor }]} numberOfLines={1}>
              Custom
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Custom builder */}
      {themeChoice === 'custom' && (
        <View style={[styles.customPanel, { borderTopColor: sepColor }]}>
          <Text style={[styles.rowLabel, { color: subColor }]}>ACCENT</Text>
          <View style={styles.swatchRow}>
            {CUSTOM_ACCENT_OPTIONS.map(c => (
              <TouchableOpacity
                key={`acc-${c}`}
                onPress={() => select({ customAccent: c }, { accent: c, backdrop: customBackdrop })}
                style={[
                  styles.swatch,
                  { backgroundColor: c, borderColor },
                  customAccent === c && { borderColor: textColor, borderWidth: 2.5 },
                ]}
              />
            ))}
          </View>

          <Text style={[styles.rowLabel, { color: subColor }]}>CARD COLOUR</Text>
          <View style={styles.swatchRow}>
            {CUSTOM_CARD_OPTIONS.map(c => (
              <TouchableOpacity
                key={`card-${c}`}
                onPress={() => select({ customCard: c }, { accent: customAccent, backdrop: customBackdrop })}
                style={[
                  styles.swatch,
                  { backgroundColor: c, borderColor },
                  customCard === c && { borderColor: customAccent, borderWidth: 2.5 },
                ]}
              />
            ))}
          </View>

          <Text style={[styles.rowLabel, { color: subColor }]}>BACKDROP</Text>
          <View style={styles.swatchRow}>
            {CUSTOM_BACKDROP_OPTIONS.map(c => (
              <TouchableOpacity
                key={`bg-${c}`}
                onPress={() => select({ customBackdrop: c }, { accent: customAccent, backdrop: c })}
                style={[
                  styles.swatch,
                  { backgroundColor: c, borderColor },
                  customBackdrop === c && { borderColor: customAccent, borderWidth: 2.5 },
                ]}
              />
            ))}
          </View>
        </View>
      )}

      {/* Content-area colour (the page behind the cards) */}
      <View style={[styles.customPanel, { borderTopColor: sepColor }]}>
        <Text style={[styles.rowLabel, { color: subColor }]}>CONTENT AREA</Text>
        <View style={styles.swatchRow}>
          {SHEET_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.key}
              onPress={() => select(
                { sheetColor: opt.color },
                { accent: themeChoice === 'custom' ? customAccent : (PROVIDER_THEMES.find(t => t.key === themeChoice)?.tokens.accent ?? customAccent),
                  backdrop: themeChoice === 'custom' ? customBackdrop : (PROVIDER_THEMES.find(t => t.key === themeChoice)?.tokens.hero ?? customBackdrop) }
              )}
              style={styles.sheetOption}
              activeOpacity={0.8}
            >
              <View style={[
                styles.sheetSwatch,
                { backgroundColor: opt.color, borderColor },
                sheetColor === opt.color && { borderColor: textColor, borderWidth: 2.5 },
              ]} />
              <Text style={[styles.optionName, { color: sheetColor === opt.color ? textColor : subColor }]}>
                {opt.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  collection: {
    marginBottom: 14,
  },
  collectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 6,
  },
  collectionName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    letterSpacing: 1.2,
  },
  collectionDesc: {
    flex: 1,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 11,
  },
  rail: {
    flexDirection: 'row',
    gap: 8,
  },
  option: {
    width: 84,
    borderRadius: 14,
    borderWidth: 2,
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 5,
  },
  swatchChip: {
    width: 68,
    height: 48,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: 3,
  },
  accentDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  optionName: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 10,
    textAlign: 'center',
  },
  customPanel: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 6,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sheetOption: {
    alignItems: 'center',
    gap: 4,
    marginRight: 6,
  },
  sheetSwatch: {
    width: 46,
    height: 34,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

export default ProviderThemePicker;
