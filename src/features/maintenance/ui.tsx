// src/features/maintenance/ui.tsx
//
// Small presentational pieces shared by the Maintenance view, its sheets and
// the setup flow. Every colour comes from useTheme().palette (hat-aware) plus
// the app's existing semantic colours below — no new palette.

import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { AppTheme } from '../../constants/theme';

export const FONT_DISPLAY = 'BakbakOne-Regular';
export const FONT_BODY = 'Jura-VariableFont_wght';

/**
 * Semantic colours, reused from what the app already ships rather than the
 * mockup's unverified red/amber: iOS system red (Colors.danger, with the
 * dark-mode variant AuthScreen uses), the amber NotificationsScreen uses for
 * "needs you, nothing decided", and the de-facto success green.
 */
export interface SemanticColors {
  bad: string;
  badDim: string;
  warn: string;
  warnDim: string;
  ok: string;
  okDim: string;
}

export function semanticColors(isDarkMode: boolean): SemanticColors {
  return isDarkMode
    ? { bad: '#FF453A', badDim: 'rgba(255,69,58,0.16)', warn: '#FF9500', warnDim: 'rgba(255,149,0,0.16)', ok: '#34C759', okDim: 'rgba(52,199,89,0.18)' }
    : { bad: '#FF3B30', badDim: 'rgba(255,59,48,0.12)', warn: '#B86B00', warnDim: 'rgba(255,149,0,0.16)', ok: '#1F8A3D', okDim: 'rgba(52,199,89,0.14)' };
}

export const hapticLight = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };
export const hapticMedium = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); };
export const hapticSelection = () => { Haptics.selectionAsync().catch(() => {}); };
export const hapticSuccess = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); };
export const hapticError = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}); };

export function SectionLabel({ text, P }: { text: string; P: AppTheme }) {
  return <Text style={[ui.label, { color: P.sub }]}>{text}</Text>;
}

export type PillTone = 'accent' | 'bad' | 'warn' | 'ok' | 'mute';

export function Pill({ text, tone, P, S }: { text: string; tone: PillTone; P: AppTheme; S: SemanticColors }) {
  const colours: Record<PillTone, [string, string]> = {
    accent: [P.accentDim, P.accentText],
    bad: [S.badDim, S.bad],
    warn: [S.warnDim, S.warn],
    ok: [S.okDim, S.ok],
    mute: [P.surface, P.sub],
  };
  const [bg, fg] = colours[tone];
  return (
    <View style={[ui.pill, { backgroundColor: bg }]}>
      <Text style={[ui.pillText, { color: fg }]} numberOfLines={1}>{text.toUpperCase()}</Text>
    </View>
  );
}

export function ProgressBar({ percent, colour, track, height = 5 }: { percent: number; colour: string; track: string; height?: number }) {
  return (
    <View style={[ui.bar, { backgroundColor: track, height, borderRadius: height }]}>
      <View style={{ width: `${Math.max(0, Math.min(100, percent))}%`, height: '100%', borderRadius: height, backgroundColor: colour }} />
    </View>
  );
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  P: AppTheme;
  disabled?: boolean | undefined;
  small?: boolean | undefined;
  icon?: keyof typeof Ionicons.glyphMap | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  accessibilityLabel?: string | undefined;
}

export function PrimaryButton({ label, onPress, P, disabled, small, icon, style, accessibilityLabel }: ButtonProps) {
  return (
    <TouchableOpacity
      style={[small ? ui.btnSmall : ui.btn, { backgroundColor: P.accent, borderColor: P.accent, opacity: disabled ? 0.5 : 1 }, style]}
      onPress={() => { hapticMedium(); onPress(); }}
      disabled={disabled}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {icon && <Ionicons name={icon} size={small ? 12 : 15} color={P.onAccent} />}
      <Text style={[small ? ui.btnSmallText : ui.btnText, { color: P.onAccent }]}>{label.toUpperCase()}</Text>
    </TouchableOpacity>
  );
}

export function GhostButton({ label, onPress, P, disabled, small, icon, style, accessibilityLabel, colour }: ButtonProps & { colour?: string }) {
  const fg = colour ?? P.accentText;
  return (
    <TouchableOpacity
      style={[small ? ui.btnSmall : ui.btn, { backgroundColor: 'transparent', borderColor: colour ?? P.border, opacity: disabled ? 0.5 : 1 }, style]}
      onPress={() => { hapticLight(); onPress(); }}
      disabled={disabled}
      activeOpacity={0.55}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {icon && <Ionicons name={icon} size={small ? 12 : 15} color={fg} />}
      <Text style={[small ? ui.btnSmallText : ui.btnText, { color: fg }]}>{label.toUpperCase()}</Text>
    </TouchableOpacity>
  );
}

export function Chip({ label, on, onPress, P }: { label: string; on: boolean; onPress: () => void; P: AppTheme }) {
  return (
    <TouchableOpacity
      style={[ui.chip, { backgroundColor: on ? P.accentDim : P.surface, borderColor: on ? P.accent : P.border }]}
      onPress={() => { hapticSelection(); onPress(); }}
      activeOpacity={0.5}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      <Text style={[ui.chipText, { color: on ? P.text : P.sub }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** "−  6 weeks  +" */
export function WeekStepper({
  value, min, max, onChange, P, unit,
}: { value: number; min: number; max: number; onChange: (n: number) => void; P: AppTheme; unit: (n: number) => string }) {
  const step = (d: number) => {
    const next = Math.max(min, Math.min(max, value + d));
    if (next !== value) { hapticSelection(); onChange(next); }
  };
  return (
    <View style={ui.stepper}>
      <TouchableOpacity
        style={[ui.circ, { backgroundColor: P.card, borderColor: P.border, opacity: value <= min ? 0.4 : 1 }]}
        onPress={() => step(-1)}
        disabled={value <= min}
        activeOpacity={0.5}
        accessibilityRole="button"
        accessibilityLabel="Fewer"
      >
        <Ionicons name="remove" size={16} color={P.accentText} />
      </TouchableOpacity>
      <Text style={[ui.stepValue, { color: P.text }]} accessibilityLiveRegion="polite">{unit(value)}</Text>
      <TouchableOpacity
        style={[ui.circ, { backgroundColor: P.card, borderColor: P.border, opacity: value >= max ? 0.4 : 1 }]}
        onPress={() => step(1)}
        disabled={value >= max}
        activeOpacity={0.5}
        accessibilityRole="button"
        accessibilityLabel="More"
      >
        <Ionicons name="add" size={16} color={P.accentText} />
      </TouchableOpacity>
    </View>
  );
}

export function SwitchRow({
  title, sub, value, onChange, P, disabled,
}: { title: string; sub?: string; value: boolean; onChange: (v: boolean) => void; P: AppTheme; disabled?: boolean }) {
  return (
    <View style={ui.switchRow}>
      <View style={{ flex: 1 }}>
        <Text style={[ui.switchTitle, { color: P.text }]}>{title}</Text>
        {sub ? <Text style={[ui.switchSub, { color: P.sub }]}>{sub}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={v => { hapticSelection(); onChange(v); }}
        disabled={disabled}
        trackColor={{ false: '#D1D1D6', true: P.accent }}
        thumbColor={value ? '#fff' : '#f4f3f4'}
        accessibilityLabel={title}
      />
    </View>
  );
}

/** Inline note with an icon, e.g. the reminders disclaimer. */
export function Note({ text, icon, P }: { text: string; icon: keyof typeof Ionicons.glyphMap; P: AppTheme }) {
  return (
    <View style={[ui.note, { backgroundColor: P.surface }]}>
      <Ionicons name={icon} size={15} color={P.sub} style={{ marginTop: 1 }} />
      <Text style={[ui.noteText, { color: P.sub }]}>{text}</Text>
    </View>
  );
}

/**
 * A plain bottom sheet: RN Modal + backdrop. SafeAreaView is inert inside a
 * Modal (memory: safeareaview-is-inert-inside-a-modal), so the bottom inset is
 * padded by hand.
 */
export function Sheet({
  visible, onClose, P, children,
}: { visible: boolean; onClose: () => void; P: AppTheme; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={ui.sheetWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={ui.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[ui.sheet, { backgroundColor: P.bg, borderColor: P.border, paddingBottom: insets.bottom + 20 }]}>
          <View style={[ui.grab, { backgroundColor: P.border }]} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={ui.sheetBody}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const ui = StyleSheet.create({
  label: { fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: 1.6, marginTop: 8, marginBottom: 2 },
  pill: { borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  pillText: { fontFamily: FONT_DISPLAY, fontSize: 10, letterSpacing: 1.1 },
  bar: { width: '100%', overflow: 'hidden' },
  btn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 100, borderWidth: 1.5, paddingVertical: 14, paddingHorizontal: 18 },
  btnText: { fontFamily: FONT_DISPLAY, fontSize: 14, letterSpacing: 1 },
  btnSmall: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 100, borderWidth: 1, paddingVertical: 7, paddingHorizontal: 12 },
  btnSmallText: { fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: 1 },
  chip: { borderRadius: 100, borderWidth: 1.5, paddingVertical: 8, paddingHorizontal: 14 },
  chipText: { fontFamily: FONT_DISPLAY, fontSize: 12, letterSpacing: 0.6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  circ: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontFamily: FONT_DISPLAY, fontSize: 20, letterSpacing: 1, minWidth: 110, textAlign: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchTitle: { fontFamily: FONT_BODY, fontSize: 14, fontWeight: '700' },
  switchSub: { fontFamily: FONT_BODY, fontSize: 12, marginTop: 2, lineHeight: 16 },
  note: { flexDirection: 'row', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  noteText: { flex: 1, fontFamily: FONT_BODY, fontSize: 12.5, lineHeight: 18 },
  card: { borderRadius: 16, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, maxHeight: '88%', paddingTop: 10 },
  grab: { width: 40, height: 4, borderRadius: 4, alignSelf: 'center', marginBottom: 6 },
  sheetBody: { paddingHorizontal: 16, paddingTop: 6, gap: 14 },
  sheetTitle: { fontFamily: FONT_DISPLAY, fontSize: 20, letterSpacing: 1 },
  body: { fontFamily: FONT_BODY, fontSize: 13, lineHeight: 18 },
  input: { fontFamily: FONT_BODY, fontSize: 15, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 11 },
  inlineError: { fontFamily: FONT_BODY, fontSize: 12.5, lineHeight: 18 },
});
