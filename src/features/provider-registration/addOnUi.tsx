// Small pieces shared by the provider add-on screens (AddOnLibrarySection,
// AddOnEditorModal, ServiceAddOnsField). Colours come in as a palette so
// they follow whichever chrome theme InfoReg is showing (its own branding in
// edit mode, the app default on first sign-up).
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { withAlpha } from '../../constants/providerThemes';
import { ADD_ON_EXTRA_TIME_CHOICES } from './addOnLibrary';
import { formatAddOnExtraTime } from '../bookings/addOnTime';

export interface AddOnPalette {
  bg: string;
  surface: string;
  card: string;
  accent: string;
  onAccent: string;
  text: string;
  sub: string;
  border: string;
  isDark: boolean;
}

export const tapSelect = () => { Haptics.selectionAsync().catch(() => {}); };
export const tapLight = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };
export const tapMedium = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); };
export const tapWarn = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}); };

export const ADD_ON_FONTS = {
  display: 'BakbakOne-Regular',
  body: 'Jura-VariableFont_wght',
} as const;

/** "£10" or "£12.50", the way prices read across the provider screens. */
export function formatAddOnPrice(price: number): string {
  return Number.isInteger(price) ? `£${price}` : `£${price.toFixed(2)}`;
}

/** "+15 min · £10"-style meta line, or just the price with no extra time. */
export function addOnMetaLine(price: number, extraMinutes: number): string {
  const time = formatAddOnExtraTime(extraMinutes);
  return time ? `${formatAddOnPrice(price)} · ${time}` : formatAddOnPrice(price);
}

export function AddOnChip({
  label,
  active,
  onPress,
  palette,
  accessibilityLabel,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  palette: AddOnPalette;
  accessibilityLabel?: string;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => { tapSelect(); onPress(); }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        chipStyles.chip,
        { borderColor: palette.border, backgroundColor: palette.card },
        active && { backgroundColor: withAlpha(palette.accent, 0.16), borderColor: palette.accent },
      ]}
    >
      <Text style={[chipStyles.chipText, { color: active ? palette.accent : palette.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** None / +10 / +15 / +30 / +45 / +1 hr. A saved value outside the quick
 *  picks still shows, as its own selected chip. */
export function ExtraTimeChips({
  value,
  onChange,
  palette,
}: {
  value: number;
  onChange: (minutes: number) => void;
  palette: AddOnPalette;
}) {
  const choices: number[] = [...ADD_ON_EXTRA_TIME_CHOICES];
  if (!choices.includes(value)) choices.push(value);
  return (
    <View style={chipStyles.row}>
      {choices.map(minutes => (
        <AddOnChip
          key={minutes}
          label={minutes === 0 ? 'None' : formatAddOnExtraTime(minutes)}
          accessibilityLabel={minutes === 0 ? 'No extra time' : `${formatAddOnExtraTime(minutes)} extra`}
          active={value === minutes}
          onPress={() => onChange(minutes)}
          palette={palette}
        />
      ))}
    </View>
  );
}

export function TickBox({ on, palette }: { on: boolean; palette: AddOnPalette }) {
  return (
    <View
      style={[
        chipStyles.box,
        { borderColor: on ? palette.accent : palette.border, backgroundColor: on ? palette.accent : 'transparent' },
      ]}
    >
      {on ? <Text style={[chipStyles.tick, { color: palette.onAccent }]}>✓</Text> : null}
    </View>
  );
}

export const chipStyles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { fontFamily: ADD_ON_FONTS.body, fontWeight: '700', fontSize: 13 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: { fontSize: 13, fontWeight: '800' },
});
