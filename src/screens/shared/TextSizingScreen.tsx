import React from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { useDisplaySettings } from '../../contexts/DisplaySettingsContext';
import { useTranslation } from '../../i18n';
import { ThemedBackground } from '../../components/ThemedBackground';
import { TEXT_SCALE_STEPS, FONT_OPTIONS } from '../../utils/displaySettings';

// New shared screen: pick a text size + body font, with a live preview.
// @react-native-community/slider is NOT a dependency (checked package.json),
// so rather than add a native dependency, the size control is a stepped track
// — four discrete stops (Small → Larger) — which gives the same "smooth,
// simple" feel and maps 1:1 onto the persisted scale steps.

export default function TextSizingScreen({ navigation }: any) {
  const { theme, palette: P } = useTheme();
  const insets = useSafeAreaInsets();
  const { textScale, fontChoice, setTextScale, setFontChoice } = useDisplaySettings();
  const { t } = useTranslation();

  const activeIndex = TEXT_SCALE_STEPS.findIndex((s) => s.value === textScale);
  const safeIndex = activeIndex < 0 ? 1 : activeIndex;

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={theme.statusBar} translucent />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.backArrow, { color: P.text }]}>{'←'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.title, { color: P.text }]}>{t('textSizing.title')}</Text>
        <Text style={[styles.subtitle, { color: P.sub }]}>
          {t('textSizing.subtitle')}
        </Text>

        {/* Live preview. These deliberately carry NO inline scale/font: the
            global Text wrapper (fontScaleClamp) applies the chosen size to every
            explicit fontSize and the chosen body font to any text with no
            family — so this card renders exactly as the rest of the app will.
            The heading keeps BakbakOne to show that titles are unaffected by the
            body-font choice; the body has no family, so it reflects the pick. */}
        <Text style={[styles.section, { color: P.accentText }]}>{t('textSizing.section.preview')}</Text>
        <View style={[styles.previewCard, { backgroundColor: P.card, borderColor: P.border }]}>
          <Text style={[styles.previewHeading, { color: P.text, fontSize: 22 }]}>
            {t('textSizing.preview.heading')}
          </Text>
          <Text style={[styles.previewBody, { color: P.sub, fontSize: 15 }]}>
            {t('textSizing.preview.body')}
          </Text>
        </View>

        {/* Text size stepped control */}
        <Text style={[styles.section, { color: P.accentText }]}>{t('textSizing.section.textSize')}</Text>
        <View style={[styles.sizeCard, { backgroundColor: P.card, borderColor: P.border }]}>
          <View style={styles.track}>
            {TEXT_SCALE_STEPS.map((step, i) => {
              const selected = i === safeIndex;
              return (
                <TouchableOpacity
                  key={step.label}
                  style={styles.trackSegment}
                  activeOpacity={0.7}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); setTextScale(step.value); }}
                >
                  <View style={[styles.trackLine, { backgroundColor: i <= safeIndex ? P.accent : P.border }]} />
                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor: selected ? P.accent : P.card,
                        borderColor: i <= safeIndex ? P.accent : P.border,
                      },
                      selected && styles.dotSelected,
                    ]}
                  />
                  <Text
                    style={[
                      styles.stepLabel,
                      { color: selected ? P.accentText : P.sub, fontWeight: selected ? '700' : '500' },
                    ]}
                  >
                    {step.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Font picker */}
        <Text style={[styles.section, { color: P.accentText }]}>{t('textSizing.section.font')}</Text>
        {FONT_OPTIONS.map((opt) => {
          const selected = opt.key === fontChoice;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.fontRow,
                { backgroundColor: P.card, borderColor: selected ? P.accent : P.border },
                selected && { borderWidth: 1.5 },
              ]}
              activeOpacity={0.7}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setFontChoice(opt.key); }}
            >
              <View style={{ flex: 1 }}>
                {/* Pin each sample to its own face — including the Default row to
                    'System' — so the global wrapper's body-font injection (which
                    only fills text with NO family) can't make one row render in
                    the currently-selected font instead of the one it names. */}
                <Text style={[styles.fontSample, { color: P.text, fontFamily: opt.family ?? 'System' }]}>
                  {opt.label}
                </Text>
                <Text style={[styles.fontNote, { color: P.sub }]}>{opt.note}</Text>
              </View>
              <View
                style={[
                  styles.radio,
                  { borderColor: selected ? P.accent : P.border },
                  selected && { backgroundColor: P.accent },
                ]}
              >
                {selected && <Text style={[styles.radioTick, { color: P.onAccent }]}>{'✓'}</Text>}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 24 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  backBtn: {},
  backArrow: { fontSize: 22, fontWeight: '900' },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 28, letterSpacing: 1, marginBottom: 6 },
  subtitle: { fontSize: 14, marginBottom: 28, lineHeight: 20 },
  // BakbakOne so these caps labels stay branded (and immune to the app-wide
  // body-font choice, which only fills text with no explicit family).
  section: { fontFamily: 'BakbakOne-Regular', fontSize: 12, letterSpacing: 2, marginBottom: 12, marginTop: 8 },

  previewCard: { borderRadius: 14, borderWidth: 0.5, padding: 18, marginBottom: 20 },
  previewHeading: { fontFamily: 'BakbakOne-Regular', marginBottom: 8 },
  previewBody: {},

  sizeCard: { borderRadius: 14, borderWidth: 0.5, padding: 18, marginBottom: 20 },
  track: { flexDirection: 'row', alignItems: 'flex-start' },
  trackSegment: { flex: 1, alignItems: 'center' },
  trackLine: { position: 'absolute', top: 9, left: 0, right: 0, height: 2 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  dotSelected: { transform: [{ scale: 1.25 }] },
  stepLabel: { fontSize: 12, marginTop: 12 },

  fontRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 0.5,
    padding: 16,
    marginBottom: 10,
  },
  fontSample: { fontSize: 18, fontWeight: '600', marginBottom: 3 },
  fontNote: { fontSize: 12 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  radioTick: { fontSize: 13, fontWeight: '900' },
});
