// src/components/signup/FormKit.tsx
//
// Shared building blocks for the redesigned auth + sign-up screens: a grouped
// form card with hairline separators, a field row with its label inside the
// card, accent section labels, chips and the main pill button. Every value
// comes from the active palette, so these follow light/dark like the rest.
import React, { useRef } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';

export const ERROR_RED = '#DC2626';

/** Text + fill for a met requirement (password rule chips). */
export function useSuccessColors(): { text: string; fill: string } {
  const { isDarkMode } = useTheme();
  return isDarkMode
    ? { text: '#32D74B', fill: 'rgba(50,215,75,0.16)' }
    : { text: '#1E8E3E', fill: 'rgba(52,199,89,0.16)' };
}

/** Big screen title with an optional one-line subtitle. */
export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string | undefined }) {
  const { palette: t } = useTheme();
  return (
    <View style={styles.titleBlock}>
      <Text style={[styles.title, { color: t.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: t.sub }]}>{subtitle}</Text> : null}
    </View>
  );
}

/** White grouped card; puts a hairline between each child. */
export function FormCard({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> | undefined }) {
  const { palette: t } = useTheme();
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }, style]}>
      {rows.map((row, i) => (
        <React.Fragment key={i}>
          {i > 0 && <View style={[styles.separator, { backgroundColor: t.sep }]} />}
          {row}
        </React.Fragment>
      ))}
    </View>
  );
}

/** One field inside a FormCard: small label on top, the input below. */
export function FieldRow({
  label, error, right, children,
}: { label: string; error?: string | null | undefined; right?: React.ReactNode | undefined; children: React.ReactNode }) {
  const { palette: t } = useTheme();
  return (
    <View style={styles.fieldRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.fieldLabel, { color: error ? ERROR_RED : t.sub }]}>{label}</Text>
        {children}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** Text style for a TextInput sitting inside a FieldRow. */
export function useFieldInputStyle(): TextStyle {
  const { palette: t } = useTheme();
  return { fontFamily: 'Jura-VariableFont_wght', fontSize: 16, fontWeight: '600', color: t.text, padding: 0, minHeight: 24 };
}

export interface DobValue { day: string; month: string; year: string }

/**
 * DD / MM / YYYY boxes that move on by themselves: a full day jumps to the
 * month, a full month to the year, and backspace in an empty box goes back.
 * A day of 4–9 or a month of 2–9 can't take a second digit, so it's padded
 * ("4" → "04") and moves on straight away. `onDone` fires only when the
 * year box loses focus, so half-typed dates aren't flagged as invalid.
 */
export function DobField({
  value, onChange, onDone,
}: { value: DobValue; onChange: (next: DobValue) => void; onDone: () => void }) {
  const { palette: t } = useTheme();
  const inputStyle = useFieldInputStyle();
  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);
  const dayRef = useRef<TextInput>(null);

  const setDay = (raw: string) => {
    let day = raw.replace(/[^0-9]/g, '').slice(0, 2);
    if (day.length === 1 && Number(day) > 3) day = `0${day}`;
    onChange({ ...value, day });
    if (day.length === 2) monthRef.current?.focus();
  };
  const setMonth = (raw: string) => {
    let month = raw.replace(/[^0-9]/g, '').slice(0, 2);
    if (month.length === 1 && Number(month) > 1) month = `0${month}`;
    onChange({ ...value, month });
    if (month.length === 2) yearRef.current?.focus();
  };
  const setYear = (raw: string) => {
    const year = raw.replace(/[^0-9]/g, '').slice(0, 4);
    onChange({ ...value, year });
    if (year.length === 4) yearRef.current?.blur();
  };
  const backFrom = (field: 'month' | 'year') => ({ nativeEvent }: { nativeEvent: { key: string } }) => {
    if (nativeEvent.key !== 'Backspace' || value[field] !== '') return;
    (field === 'month' ? dayRef : monthRef).current?.focus();
  };

  const box = (width: number) => [inputStyle, { width }];
  const slash = <Text style={[styles.dobSlash, { color: t.sub }]}>/</Text>;
  return (
    <View style={styles.dobRow}>
      <TextInput
        ref={dayRef} style={box(34)} value={value.day} onChangeText={setDay}
        placeholder="DD" placeholderTextColor={t.sub} keyboardType="number-pad" maxLength={2}
        textContentType="none" accessibilityLabel="Day of birth"
      />
      {slash}
      <TextInput
        ref={monthRef} style={box(34)} value={value.month} onChangeText={setMonth} onKeyPress={backFrom('month')}
        placeholder="MM" placeholderTextColor={t.sub} keyboardType="number-pad" maxLength={2}
        textContentType="none" accessibilityLabel="Month of birth"
      />
      {slash}
      <TextInput
        ref={yearRef} style={box(56)} value={value.year} onChangeText={setYear} onKeyPress={backFrom('year')}
        onBlur={onDone}
        placeholder="YYYY" placeholderTextColor={t.sub} keyboardType="number-pad" maxLength={4}
        textContentType="none" accessibilityLabel="Year of birth"
      />
    </View>
  );
}

/** Accent uppercase label above a group of chips or a card. */
export function SectionLabel({ title, hint, error }: { title: string; hint?: string | undefined; error?: boolean | undefined }) {
  const { palette: t } = useTheme();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.sectionTitle, { color: error ? ERROR_RED : t.accentText }]}>
        {title}{error ? '  — required' : ''}
      </Text>
      {hint ? <Text style={[styles.sectionHint, { color: t.sub }]}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({
  label, selected, onPress, style,
}: { label: string; selected: boolean; onPress: () => void; style?: StyleProp<ViewStyle> | undefined }) {
  const { palette: t } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        selected ? { backgroundColor: t.accent, borderColor: t.accent } : { backgroundColor: t.card, borderColor: t.border },
        style,
      ]}
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.chipText, { color: selected ? t.onAccent : t.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function ChipWrap({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> | undefined }) {
  return <View style={[styles.chipWrap, style]}>{children}</View>;
}

export function PrimaryButton({
  label, onPress, loading, disabled, style,
}: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> | undefined }) {
  const { palette: t } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.primary, { backgroundColor: t.accent, opacity: disabled ? 0.45 : 1 }, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
      accessibilityRole="button"
    >
      {loading ? <ActivityIndicator color={t.onAccent} /> : <Text style={[styles.primaryText, { color: t.onAccent }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  titleBlock: { marginBottom: 20 },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 30, lineHeight: 36, letterSpacing: 0.5 },
  subtitle: { fontFamily: 'Jura-VariableFont_wght', fontSize: 15, lineHeight: 21, marginTop: 4 },
  card: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  fieldLabel: { fontFamily: 'Jura-VariableFont_wght', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  errorText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, color: ERROR_RED, marginTop: 4 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, marginTop: 4 },
  sectionTitle: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  sectionHint: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '600' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 18 },
  chip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 100, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '700' },
  primary: { minHeight: 56, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  dobRow: { flexDirection: 'row', alignItems: 'center' },
  dobSlash: { fontFamily: 'Jura-VariableFont_wght', fontSize: 16, fontWeight: '600', marginHorizontal: 6 },
  primaryText: { fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 1.5 },
});
