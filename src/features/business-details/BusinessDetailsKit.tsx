/**
 * Shared form primitives for the Business Details screens.
 *
 * These were previously defined inline in ProviderBusinessEmailScreen.tsx.
 * When that 671-line screen was split into a hub + three focused sub-screens,
 * copying Card/Field/ChipGroup into each would have created exactly the kind
 * of duplicate-system drift CLAUDE.md warns about — so they live here once and
 * all three sub-screens import them.
 */
import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';

// ─── Design tokens ────────────────────────────────────────────────────────────
// Kept identical to the values the original Business Details screen used, so
// the split is a pure restructure with no visual drift.
export const CP_DARK = {
  bg: '#1A1815', surface: '#201D1A', card: '#252220',
  accent: '#AF9197',
  // Lighter than `accent` — that muted dusty rose reads as faint/hard to
  // read as the color of standalone TEXT (e.g. the selected RadioGroup
  // label) against near-black cards, even though it's fine as an icon,
  // fill, or border color.
  accentText: '#D9AEB6',
  ice: '#FFFFFF', text: '#F0ECE7',
  // Was #7E6667 — under 3:1 against the near-black card/surface, which is
  // why field notes, toggle/radio descriptions, and card subtitles (all
  // small Jura body text) read as too faint to use for real info text.
  sub: '#9C8788', border: 'rgba(255,255,255,0.08)', danger: '#FF6868',
};
export const CP_LIGHT = {
  bg: '#F5F1EC', surface: '#EDE8E2', card: '#FFFFFF',
  accent: '#5C4033', accentText: '#5C4033', ice: '#FFFFFF', text: '#1C1A18',
  sub: '#8A8680', border: 'rgba(0,0,0,0.08)', danger: '#FF6868',
};
const CP = CP_DARK; // static fallback for StyleSheet.create

// DESIGN_SYSTEM.md: two fonts only. Headings, buttons, labels and section
// titles use BakbakOne; body text, descriptions and inputs use Jura. The
// screen this kit replaced set neither, so its text silently fell back to the
// OS font — visible as a font-face jump when navigating in from
// BusinessProfileScreen, which does set BakbakOne on its title.
const FONT_HEAD = 'BakbakOne-Regular';
const FONT_BODY = 'Jura-VariableFont_wght';

export type Palette = typeof CP_DARK;

/** Single hook so every sub-screen resolves the palette the same way. */
export function useBusinessPalette(): Palette {
  const { isDarkMode } = useTheme();
  return isDarkMode ? CP_DARK : CP_LIGHT;
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  const C = useBusinessPalette();
  // C.card (#FFFFFF light / #252220 dark), not C.surface — matches the white
  // cards on BookingDetailScreen, which is the reference for card treatment.
  return (
    <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
      <Text style={[s.cardTitle, { color: C.text }]}>{title}</Text>
      {sub ? <Text style={[s.cardSub, { color: C.sub }]}>{sub}</Text> : null}
      {children}
    </View>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────

export function Field({ label, value, onChange, placeholder, readOnly, note, keyboardType, multiline }: {
  label: string; value: string; onChange?: (v: string) => void;
  placeholder?: string; readOnly?: boolean; note?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad'; multiline?: boolean;
}) {
  const C = useBusinessPalette();
  return (
    <View style={fSt.wrap}>
      <Text style={[fSt.label, { color: C.sub }]}>{label}</Text>
      {/* Inputs sit ON a white card, so they take C.surface (the tinted step
          down) — C.card here would make the field invisible against it. */}
      <View style={[fSt.box, { backgroundColor: C.surface, borderColor: C.border }, readOnly && { opacity: 0.6 }, multiline && fSt.boxMulti]}>
        <TextInput
          style={[fSt.input, { color: C.text }, multiline && fSt.inputMulti]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={C.sub}
          keyboardType={keyboardType ?? 'default'}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!readOnly}
          multiline={multiline}
          numberOfLines={multiline ? 3 : 1}
        />
        {readOnly && <Ionicons name="lock-closed-outline" size={14} color={C.sub} style={{ marginRight: 12 }} />}
      </View>
      {note ? <Text style={[fSt.note, { color: C.sub }]}>{note}</Text> : null}
    </View>
  );
}

const fSt = StyleSheet.create({
  wrap:       { marginBottom: 18 },
  label:      { fontFamily: FONT_HEAD, fontSize: 11, fontWeight: '600', color: CP.sub, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  box:        { flexDirection: 'row', alignItems: 'center', backgroundColor: CP.surface, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: CP.border },
  boxMulti:   { alignItems: 'flex-start' },
  input:      { flex: 1, fontFamily: FONT_BODY, fontSize: 15, color: CP.text, paddingHorizontal: 14, paddingVertical: 13 },
  inputMulti: { paddingTop: 13, textAlignVertical: 'top', minHeight: 80 },
  note:       { fontFamily: FONT_BODY, fontWeight: '500', fontSize: 11, color: CP.sub, marginTop: 6, lineHeight: 16 },
});

// ─── ToggleRow ────────────────────────────────────────────────────────────────

export function ToggleRow({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  const C = useBusinessPalette();
  return (
    <View style={tgSt.row}>
      <View style={{ flex: 1 }}>
        <Text style={[tgSt.label, { color: C.text }]}>{label}</Text>
        {sub ? <Text style={[tgSt.sub, { color: C.sub }]}>{sub}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={v => { Haptics.selectionAsync().catch(() => {}); onChange(v); }}
        trackColor={{ false: C.border, true: C.accent }}
        thumbColor={C.ice}
      />
    </View>
  );
}

const tgSt = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  label: { fontFamily: FONT_HEAD, fontSize: 14, fontWeight: '600', color: CP.text },
  sub:   { fontFamily: FONT_BODY, fontWeight: '500', fontSize: 12, color: CP.sub, marginTop: 2, lineHeight: 16 },
});

// ─── RadioGroup ───────────────────────────────────────────────────────────────

export function RadioGroup({ options, value, onChange }: { options: { value: string; label: string; sub?: string }[]; value: string; onChange: (v: string) => void }) {
  const C = useBusinessPalette();
  return (
    <View style={{ gap: 8, marginBottom: 4 }}>
      {options.map(opt => {
        const active = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[rdSt.row, { backgroundColor: C.surface, borderColor: active ? C.accent + '60' : C.border }, active && { backgroundColor: C.accent + '12' }]}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(opt.value); }}
            activeOpacity={0.75}
          >
            <View style={[rdSt.dot, { borderColor: active ? C.accent : C.sub }]}>
              {active && <View style={[rdSt.dotFill, { backgroundColor: C.accent }]} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[rdSt.label, { color: active ? C.accentText : C.text }]}>{opt.label}</Text>
              {opt.sub ? <Text style={[rdSt.sub, { color: C.sub }]}>{opt.sub}</Text> : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const rdSt = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: CP.border, backgroundColor: CP.surface },
  dot:     { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: CP.sub, alignItems: 'center', justifyContent: 'center' },
  dotFill: { width: 9, height: 9, borderRadius: 5, backgroundColor: CP.ice },
  label:   { fontFamily: FONT_HEAD, fontSize: 14, fontWeight: '600', color: CP.text },
  sub:     { fontFamily: FONT_BODY, fontWeight: '500', fontSize: 12, color: CP.sub, marginTop: 2 },
});

// ─── ChipGroup ────────────────────────────────────────────────────────────────

export function ChipGroup({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  const C = useBusinessPalette();
  return (
    <View style={chSt.wrap}>
      {options.map(opt => {
        const active = selected.includes(opt);
        return (
          <TouchableOpacity
            key={opt}
            style={[chSt.chip, { backgroundColor: active ? C.accent : C.surface, borderColor: active ? C.accent : C.border }]}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onToggle(opt); }}
            activeOpacity={0.75}
          >
            <Text style={[chSt.label, { color: active ? C.ice : C.sub }]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const chSt = StyleSheet.create({
  wrap:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip:  { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: CP.border, backgroundColor: CP.surface },
  label: { fontFamily: FONT_HEAD, fontSize: 13, color: CP.sub },
});

// ─── Toast ────────────────────────────────────────────────────────────────────

export function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  const C = useBusinessPalette();
  return (
    <View style={[toSt.wrap, { backgroundColor: C.surface, borderColor: type === 'error' ? C.danger + '55' : C.border }]}>
      <Ionicons name={type === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={16} color={type === 'success' ? C.accent : C.danger} />
      <Text style={[toSt.txt, { color: type === 'error' ? C.danger : C.text }]}>{message}</Text>
    </View>
  );
}

const toSt = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: CP.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: CP.border },
  txt:  { fontFamily: FONT_BODY, fontSize: 13, color: CP.ice, flex: 1 },
});

// ─── SectionLabel ─────────────────────────────────────────────────────────────

export function SectionLabel({ text }: { text: string }) {
  const C = useBusinessPalette();
  return <Text style={{ fontFamily: FONT_HEAD, fontSize: 11, fontWeight: '600', color: C.sub, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10, marginTop: 4 }}>{text}</Text>;
}

// ─── SaveButton ───────────────────────────────────────────────────────────────

export function SaveButton({ saving, onPress }: { saving: boolean; onPress: () => void }) {
  const C = useBusinessPalette();
  return (
    <TouchableOpacity
      style={[s.saveBtn, { backgroundColor: C.accent, borderColor: C.ice + '30' }, saving && s.saveBtnDim]}
      onPress={onPress}
      disabled={saving}
      activeOpacity={0.8}
    >
      {saving
        ? <ActivityIndicator color={C.ice} size="small" />
        : <Text style={[s.saveTxt, { color: C.ice }]}>Save Changes</Text>
      }
    </TouchableOpacity>
  );
}

// ─── Shared screen chrome ─────────────────────────────────────────────────────

export const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: CP.bg },
  safe:   { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { flex: 1, fontFamily: FONT_HEAD, fontSize: 22, color: CP.text, letterSpacing: 0.5 },
  closeBtn:    { width: 34, height: 34, borderRadius: 17, backgroundColor: CP.surface, alignItems: 'center', justifyContent: 'center' },

  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },

  card:      { backgroundColor: CP.card, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: CP.border },
  cardTitle: { fontFamily: FONT_HEAD, fontSize: 15, color: CP.text, marginBottom: 4, letterSpacing: 0.3 },
  cardSub:   { fontFamily: FONT_BODY, fontWeight: '500', fontSize: 12, color: CP.sub, lineHeight: 17, marginBottom: 16 },

  saveBtn:    { backgroundColor: CP.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: CP.ice + '30', marginTop: 6, marginBottom: 8 },
  saveBtnDim: { opacity: 0.6 },
  saveTxt:    { fontFamily: FONT_HEAD, fontSize: 15, color: CP.ice, letterSpacing: 0.5 },
});
