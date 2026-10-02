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
import type { AppTheme } from '../../constants/theme';
import { LANGUAGE_OPTIONS, REGION_OPTIONS } from '../../utils/displaySettings';
import { formatShortDate } from '../../utils/dateUtils';

// A fixed, unambiguous sample date (14 > 12, so the order is obvious): shown in
// each region's own format so the choice's effect is visible before selecting.
const SAMPLE_DATE = new Date(2026, 9, 14); // 14 October 2026

// Shared screen: pick a display language and a region/locale. Language drives
// the app's UI translation live (via the i18n layer, which reads the same
// `language` from DisplaySettingsContext this screen writes) — choosing one
// re-renders translated screens with no restart. Legal and health-safety copy
// is held in English regardless (see the i18n DO_NOT_TRANSLATE guard). Region
// drives numeric date order app-wide (via dateUtils); currency is never
// localised — all pricing stays GBP (£), as the region footnote states.

interface SelectRowProps {
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
  P: AppTheme;
}

function SelectRow({ title, subtitle, selected, onPress, P }: SelectRowProps) {
  return (
    <TouchableOpacity
      style={[
        styles.row,
        { backgroundColor: P.card, borderColor: selected ? P.accent : P.border },
        selected && { borderWidth: 1.5 },
      ]}
      activeOpacity={0.7}
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: P.text }]}>{title}</Text>
        <Text style={[styles.rowSub, { color: P.sub }]}>{subtitle}</Text>
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
}

export default function LanguageRegionScreen({ navigation }: any) {
  const { theme, palette: P } = useTheme();
  const insets = useSafeAreaInsets();
  const { language, region, setLanguage, setRegion } = useDisplaySettings();
  const { t } = useTranslation();

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

        <Text style={[styles.title, { color: P.text }]}>{t('languageRegion.title')}</Text>
        <Text style={[styles.subtitle, { color: P.sub }]}>
          {t('languageRegion.subtitle')}
        </Text>

        <Text style={[styles.section, { color: P.accentText }]}>{t('languageRegion.section.language')}</Text>
        {LANGUAGE_OPTIONS.map((opt) => (
          <SelectRow
            key={opt.code}
            title={opt.native}
            subtitle={opt.label}
            selected={opt.code === language}
            onPress={() => setLanguage(opt.code)}
            P={P}
          />
        ))}
        <Text style={[styles.footnote, { color: P.sub }]}>
          {t('languageRegion.languageFootnote')}
        </Text>

        <Text style={[styles.section, { color: P.accentText }]}>{t('languageRegion.section.region')}</Text>
        {REGION_OPTIONS.map((opt) => (
          <SelectRow
            key={opt.code}
            title={opt.label}
            // Live example, formatted in THIS region's order, so the effect is
            // visible before selecting. (Currency is covered by the footnote.)
            subtitle={t('languageRegion.regionRowDates', { date: formatShortDate(SAMPLE_DATE, opt.code) })}
            selected={opt.code === region}
            onPress={() => setRegion(opt.code)}
            P={P}
          />
        ))}
        <Text style={[styles.footnote, { color: P.sub }]}>
          {t('languageRegion.regionFootnote', { date: formatShortDate(SAMPLE_DATE, region) })}
        </Text>
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
  footnote: { fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 24 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 0.5,
    padding: 16,
    marginBottom: 10,
  },
  rowTitle: { fontSize: 16, fontWeight: '600', marginBottom: 3 },
  rowSub: { fontSize: 12 },
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
