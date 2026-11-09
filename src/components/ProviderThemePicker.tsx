import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import {
  PROVIDER_THEMES,
  SHEET_OPTIONS,
  THEME_COLLECTIONS,
} from '../constants/providerThemes';
import ColourWheelPicker from './ColourWheelPicker';

// The three colours Custom builds a set from, in the order they're offered.
type CustomPart = 'accent' | 'card' | 'backdrop';
const CUSTOM_PARTS: { key: CustomPart; label: string }[] = [
  { key: 'accent', label: 'Accent' },
  { key: 'card', label: 'Card' },
  { key: 'backdrop', label: 'Backdrop' },
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
  /** Only these sets (by key) can be picked; the rest, and Custom, show locked
   *  and call onLockedPress instead. Leave out for every option. */
  unlockedThemes?: readonly string[] | undefined;
  onLockedPress?: () => void;
  /** Colours found in the provider's own logo and background photo, offered
   *  as one-tap swatches in Custom. */
  photoColours?: readonly string[];
  photoColoursLoading?: boolean;
  /** Pick any photo to take colours from. Leave out to hide the button. */
  onChoosePhoto?: () => void;
  /** Forwarded from the colour square/bar, so the screen can stop scrolling
   *  while a finger drags on them. */
  onColourDraggingChange?: (dragging: boolean) => void;
}

/** One theme option's swatch: a small gradient chip (the real backdrop blend)
 *  plus the accent as a dot overlaid on it, so the picker shows what the
 *  profile will actually look like instead of three disconnected dots. */
const ThemeSwatch: React.FC<{ accent: string; gradient: [string, string]; borderColor: string; locked?: boolean }> = (
  { accent, gradient, borderColor, locked }
) => (
  <View style={[styles.swatchChip, { borderColor }]}>
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
    {locked ? (
      <View style={styles.lockBadge}>
        <Ionicons name="lock-closed" size={10} color="#FFFFFF" />
      </View>
    ) : (
      <View style={[styles.accentDot, { backgroundColor: accent, borderColor }]} />
    )}
  </View>
);

const ProviderThemePicker: React.FC<ProviderThemePickerProps> = ({
  value, onChange, onColorsResolved, textColor, subColor, borderColor, sepColor, unlockedThemes, onLockedPress,
  photoColours = [], photoColoursLoading = false, onChoosePhoto, onColourDraggingChange,
}) => {
  const [editingPart, setEditingPart] = useState<CustomPart>('accent');
  const { themeChoice, customBackdrop, customCard, customAccent, sheetColor } = value;
  const isUnlocked = (key: string) => !unlockedThemes || unlockedThemes.includes(key);
  const customLocked = !!unlockedThemes;
  // What they can pick comes first, both the rail and its place in the rail,
  // so it isn't behind every locked set.
  const unlockedFirst = (a: string, b: string) => Number(isUnlocked(b)) - Number(isUnlocked(a));
  const collections = THEME_COLLECTIONS
    .map(collection => ({
      ...collection,
      themes: PROVIDER_THEMES.filter(t => t.collection === collection.key).sort((a, b) => unlockedFirst(a.key, b.key)),
    }))
    .filter(collection => collection.themes.length > 0)
    .sort((a, b) => unlockedFirst(a.themes[0]!.key, b.themes[0]!.key));

  const pressLocked = () => {
    Haptics.selectionAsync().catch(() => {});
    onLockedPress?.();
  };

  const select = (patch: Partial<ThemeSelection>, resolved: { accent: string; backdrop: string }) => {
    Haptics.selectionAsync().catch(() => {});
    onChange({ ...value, ...patch });
    onColorsResolved?.(resolved);
  };

  return (
    <View>
      {/* Preset sets, one swipeable rail per collection */}
      {collections.map(collection => {
        const { themes } = collection;
        const allLocked = !themes.some(t => isUnlocked(t.key));
        return (
          <View key={collection.key} style={styles.collection}>
            <View style={styles.collectionHead}>
              {allLocked && <Ionicons name="lock-closed" size={10} color={subColor} />}
              <Text style={[styles.collectionName, { color: textColor }]}>{collection.name.toUpperCase()}</Text>
              <Text style={[styles.collectionDesc, { color: subColor }]} numberOfLines={1}>{collection.description}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {themes.map(t => {
                const isSelected = themeChoice === t.key;
                const locked = !isUnlocked(t.key);
                return (
                  <TouchableOpacity
                    key={t.key}
                    onPress={() => {
                      if (locked) { pressLocked(); return; }
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
                    accessibilityLabel={`${t.name}: ${t.description}${locked ? ', locked' : ''}`}
                    style={[
                      styles.option,
                      { borderColor: 'transparent' },
                      isSelected && { borderColor: t.tokens.accent },
                      locked && styles.lockedOption,
                    ]}
                  >
                    <ThemeSwatch accent={t.tokens.accent} gradient={t.tokens.gradient} borderColor={borderColor} locked={locked} />
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
          {customLocked && <Ionicons name="lock-closed" size={10} color={subColor} />}
          <Text style={[styles.collectionName, { color: textColor }]}>MAKE YOUR OWN</Text>
          <Text style={[styles.collectionDesc, { color: subColor }]} numberOfLines={1}>Pick each colour yourself</Text>
        </View>
        <View style={styles.rail}>
          <TouchableOpacity
            onPress={() => customLocked
              ? pressLocked()
              : select(
                { themeChoice: 'custom' },
                { accent: customAccent, backdrop: customBackdrop }
              )}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: themeChoice === 'custom' }}
            accessibilityLabel={customLocked ? 'Custom, locked' : 'Custom'}
            style={[
              styles.option,
              { borderColor: 'transparent' },
              themeChoice === 'custom' && { borderColor: customAccent },
              customLocked && styles.lockedOption,
            ]}
          >
            <ThemeSwatch accent={customAccent} gradient={[customBackdrop, customCard]} borderColor={borderColor} locked={customLocked} />
            <Text style={[styles.optionName, { color: themeChoice === 'custom' ? textColor : subColor }]} numberOfLines={1}>
              Custom
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Custom builder: pick which of the three colours to set, then set it
          from the provider's own photos, the shade square and hue bar, or a
          typed hex code. */}
      {themeChoice === 'custom' && !customLocked && (() => {
        const partColour = { accent: customAccent, card: customCard, backdrop: customBackdrop };
        const setPart = (hex: string) => {
          if (editingPart === 'accent') onChange({ ...value, customAccent: hex });
          else if (editingPart === 'card') onChange({ ...value, customCard: hex });
          else onChange({ ...value, customBackdrop: hex });
          onColorsResolved?.({
            accent: editingPart === 'accent' ? hex : customAccent,
            backdrop: editingPart === 'backdrop' ? hex : customBackdrop,
          });
        };
        return (
          <View style={[styles.customPanel, { borderTopColor: sepColor }]}>
            <View style={styles.partRow}>
              {CUSTOM_PARTS.map(part => {
                const active = editingPart === part.key;
                return (
                  <TouchableOpacity
                    key={part.key}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setEditingPart(part.key); }}
                    style={[styles.partChip, { borderColor: active ? textColor : borderColor }, active && styles.partChipOn]}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Edit ${part.label} colour`}
                  >
                    <View style={[styles.partDot, { backgroundColor: partColour[part.key], borderColor }]} />
                    <Text style={[styles.partLabel, { color: active ? textColor : subColor }]}>{part.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {(photoColours.length > 0 || photoColoursLoading || onChoosePhoto) && (
              <>
                <Text style={[styles.rowLabel, { color: subColor }]}>FROM YOUR PHOTOS</Text>
                <View style={styles.swatchRow}>
                  {photoColours.map(c => (
                    <TouchableOpacity
                      key={`photo-${c}`}
                      onPress={() => { Haptics.selectionAsync().catch(() => {}); setPart(c); }}
                      style={[
                        styles.swatch,
                        { backgroundColor: c, borderColor },
                        partColour[editingPart] === c && { borderColor: textColor, borderWidth: 2.5 },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Use ${c} from your photos`}
                    />
                  ))}
                  {photoColoursLoading && <ActivityIndicator size="small" color={subColor} style={styles.swatchSpinner} />}
                  {onChoosePhoto && (
                    <TouchableOpacity
                      onPress={() => { Haptics.selectionAsync().catch(() => {}); onChoosePhoto(); }}
                      style={[styles.choosePhoto, { borderColor }]}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel="Choose a photo to take colours from"
                    >
                      <Ionicons name="image-outline" size={14} color={textColor} />
                      <Text style={[styles.choosePhotoText, { color: textColor }]}>Choose a photo</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}

            <ColourWheelPicker
              value={partColour[editingPart]}
              onChange={setPart}
              onDraggingChange={onColourDraggingChange}
              textColor={textColor}
              subColor={subColor}
              borderColor={borderColor}
            />
          </View>
        );
      })()}

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
  lockedOption: {
    opacity: 0.55,
  },
  lockBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
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
  partRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  partChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  partChipOn: { borderWidth: 2 },
  partDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  partLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 12,
  },
  swatchSpinner: { marginHorizontal: 6 },
  choosePhoto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
  },
  choosePhotoText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 12,
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
