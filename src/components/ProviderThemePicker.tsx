import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  PROVIDER_THEMES,
  SHEET_OPTIONS,
} from '../constants/providerThemes';

// Swatch options for the Custom colour set builder.
// Backdrop = hero colour behind the profile top (becomes the gradient).
export const CUSTOM_BACKDROP_OPTIONS = [
  '#C4A8AE', '#E3C7CF', '#F2D4DE', '#E9D9BE', '#CBDCC2',
  '#D9CBEC', '#C2DAE8', '#D4AF7A', '#8C6E7A', '#2D2D2D',
];
// Card tones — includes the beige (#F1EAE2).
export const CUSTOM_CARD_OPTIONS = [
  '#FFFFFF', '#FFFDFB', '#F1EAE2', '#F9E9EE', '#FDF5F7',
  '#FCF8F0', '#F7FAF3', '#F9F6FD', '#F6FAFC',
];
export const CUSTOM_ACCENT_OPTIONS = [
  '#E9799F', '#D98BA6', '#C2185B', '#7B1FA2', '#4A148C',
  '#303F9F', '#1565C0', '#00838F', '#2E7D32', '#E65100',
  '#4E342E', '#AD1457', '#FF5722', '#FF8F00',
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

/** One theme option rendered as three colour dots — accent, card, backdrop. */
const TripleDots: React.FC<{ accent: string; card: string; backdrop: string; borderColor: string }> = (
  { accent, card, backdrop, borderColor }
) => (
  <View style={styles.dotsRow}>
    <View style={[styles.dot, { backgroundColor: accent, borderColor }]} />
    <View style={[styles.dot, { backgroundColor: card, borderColor }]} />
    <View style={[styles.dot, { backgroundColor: backdrop, borderColor }]} />
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
      {/* Preset sets + custom — each option is ●●● (accent, card, backdrop) */}
      <View style={styles.grid}>
        {PROVIDER_THEMES.map(t => {
          const isSelected = themeChoice === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => select(
                { themeChoice: t.key },
                { accent: t.tokens.accent, backdrop: t.tokens.hero }
              )}
              activeOpacity={0.8}
              style={[
                styles.option,
                { borderColor: 'transparent' },
                isSelected && { borderColor: t.tokens.accent },
              ]}
            >
              <TripleDots accent={t.tokens.accent} card={t.tokens.card} backdrop={t.tokens.hero} borderColor={borderColor} />
              <Text style={[styles.optionName, { color: isSelected ? textColor : subColor }]} numberOfLines={1}>
                {t.name}
              </Text>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          onPress={() => select(
            { themeChoice: 'custom' },
            { accent: customAccent, backdrop: customBackdrop }
          )}
          activeOpacity={0.8}
          style={[
            styles.option,
            { borderColor: 'transparent' },
            themeChoice === 'custom' && { borderColor: customAccent },
          ]}
        >
          <TripleDots accent={customAccent} card={customCard} backdrop={customBackdrop} borderColor={borderColor} />
          <Text style={[styles.optionName, { color: themeChoice === 'custom' ? textColor : subColor }]} numberOfLines={1}>
            Custom
          </Text>
        </TouchableOpacity>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  option: {
    borderRadius: 12,
    borderWidth: 2,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 5,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
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
