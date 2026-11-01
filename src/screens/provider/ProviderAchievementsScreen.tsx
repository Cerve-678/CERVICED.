import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import AchievementSeal from '../../components/AchievementSeal';
import { ThemedBackground } from '../../components/ThemedBackground';
import { useTheme } from '../../contexts/ThemeContext';
import {
  buildAchievementsView,
  type AchievementItem,
} from '../../features/achievements/achievementPresentation';
import { useTranslation } from '../../i18n';
import { getMyProviderAchievements } from '../../services/databaseService';
import type { ProviderAchievements } from '../../types/achievements';
import { reportError } from '../../utils/logger';

interface Props {
  navigation: { goBack: () => void };
}

const SHELF_SEAL_SIZE = 64;
const HERO_SEAL_SIZE = 96;
const SHEET_SEAL_SIZE = 112;

export default function ProviderAchievementsScreen({ navigation }: Props) {
  const { palette: P, isDarkMode, theme } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<ProviderAchievements | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<AchievementItem | null>(null);
  const loadId = useRef(0);

  // Dark mode's `sub` is too faint for small text on the near-black background,
  // so secondary text uses the rose accent there, as the certificate does.
  const secondary = isDarkMode ? P.accentText : P.sub;
  const ink = P.bg;
  const ringTrack = isDarkMode ? 'rgba(175,145,151,0.30)' : 'rgba(126,102,103,0.28)';

  const load = useCallback(async () => {
    const id = ++loadId.current;
    setFailed(false);
    try {
      const next = await getMyProviderAchievements();
      if (id === loadId.current) setData(next);
    } catch (error) {
      reportError(error, 'ProviderAchievementsScreen.load');
      if (id === loadId.current) setFailed(true);
    }
  }, []);

  // Refetch on every visit: this is also when newly met achievements get recorded.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const view = useMemo(() => (data ? buildAchievementsView(data, t) : null), [data, t]);

  const open = useCallback((item: AchievementItem) => {
    Haptics.selectionAsync().catch(() => {});
    setSelected(item);
  }, []);

  return (
    <ThemedBackground style={styles.bg}>
      <StatusBar barStyle={theme.statusBar} translucent />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.nav}>
          <TouchableOpacity
            style={[styles.back, { backgroundColor: P.surface }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
            activeOpacity={0.5}
            accessibilityRole="button"
            accessibilityLabel={t('achievements.back')}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Path d="M15 5l-7 7 7 7" stroke={P.accent} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </TouchableOpacity>
          <Text style={[styles.title, { color: P.accent }]}>{t('achievements.title')}</Text>
        </View>

        {!view && !failed && (
          <View style={styles.state}><ActivityIndicator color={P.accent} /></View>
        )}

        {!view && failed && (
          <View style={styles.state}>
            <Text style={[styles.stateText, { color: P.text }]}>{t('achievements.loadFailed')}</Text>
            <TouchableOpacity
              style={[styles.retry, { backgroundColor: P.accent }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); load(); }}
              activeOpacity={0.75}
            >
              <Text style={[styles.retryText, { color: ink }]}>{t('achievements.retry')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {view && (
          <>
            <View style={styles.hero}>
              {view.latest ? (
                <TouchableOpacity
                  style={styles.heroButton}
                  onPress={() => open(view.latest as AchievementItem)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={view.latest.name}
                >
                  <AchievementSeal size={HERO_SEAL_SIZE} iconPath={view.latest.iconPath} earned share={1} accent={P.accent} ink={ink} mutedIcon={secondary} ringTrack={ringTrack} />
                  <Text style={[styles.sectionLabel, styles.heroLabel, { color: secondary }]}>{t('achievements.latest')}</Text>
                  <Text style={[styles.heroName, { color: P.accent }]}>{view.latest.name}</Text>
                  <Text style={[styles.heroDate, { color: P.text }]}>{view.latest.earnedDate}</Text>
                </TouchableOpacity>
              ) : (
                <Text style={[styles.none, { color: secondary }]}>{t('achievements.none')}</Text>
              )}
              <View style={[styles.summary, { backgroundColor: P.card }]}>
                <Text style={[styles.summaryCount, { color: P.text }]}>{view.summary}</Text>
                <View style={[styles.summaryRule, { backgroundColor: ringTrack }]} />
                <Text style={[styles.summaryPrivate, { color: secondary }]}>{t('achievements.private')}</Text>
              </View>
            </View>

            {view.shelves.map((shelf) => (
              <View key={shelf.key} style={styles.shelf}>
                <View style={styles.shelfHead}>
                  <Text style={[styles.sectionLabel, { color: secondary }]}>{shelf.title}</Text>
                  <Text style={[styles.shelfCount, { color: secondary }]}>{shelf.count}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelfRow}>
                  {shelf.items.map((item) => (
                    <TouchableOpacity
                      key={item.key}
                      style={styles.cell}
                      onPress={() => open(item)}
                      activeOpacity={0.5}
                      accessibilityRole="button"
                      accessibilityLabel={item.progress ? `${item.name}, ${item.progress}` : item.name}
                    >
                      <AchievementSeal size={SHELF_SEAL_SIZE} iconPath={item.iconPath} earned={item.earned} share={item.share} accent={P.accent} ink={ink} mutedIcon={secondary} ringTrack={ringTrack} />
                      <Text style={[styles.cellName, { color: P.text }]} numberOfLines={3}>{item.name}</Text>
                      {!!item.progress && (
                        <Text style={[styles.cellProgress, { color: secondary }]} numberOfLines={2}>{item.progress}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <Modal
        visible={selected !== null}
        animationType="slide"
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setSelected(null)}
      >
        <Pressable
          style={[styles.scrim, { backgroundColor: isDarkMode ? 'rgba(0,0,0,0.55)' : 'rgba(26,24,21,0.52)' }]}
          onPress={() => setSelected(null)}
          accessibilityLabel={t('achievements.done')}
        />
        {selected && (
          <View style={[styles.sheet, { backgroundColor: P.card, paddingBottom: insets.bottom + 24 }]}>
            <View style={[styles.grabber, { backgroundColor: ringTrack }]} />
            <View style={styles.sheetSeal}>
              <AchievementSeal size={SHEET_SEAL_SIZE} iconPath={selected.iconPath} earned={selected.earned} share={selected.share} accent={P.accent} ink={ink} mutedIcon={secondary} ringTrack={ringTrack} />
            </View>
            <Text style={[styles.sheetName, { color: P.accent }]}>{selected.name}</Text>
            {(selected.earnedDate || selected.progress) ? (
              <Text style={[styles.sheetStatus, { color: P.text }]}>
                {selected.earnedDate ? t('achievements.earnedOn', { date: selected.earnedDate }) : selected.progress}
              </Text>
            ) : null}
            <Text style={[styles.sheetHow, { color: secondary }]}>{selected.how}</Text>
            <TouchableOpacity
              style={[styles.done, { backgroundColor: P.accent }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); setSelected(null); }}
              activeOpacity={0.75}
            >
              <Text style={[styles.doneText, { color: ink }]}>{t('achievements.done')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 24 },
  state: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 16 },
  stateText: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  retry: { borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12 },
  retryText: { fontFamily: 'BakbakOne-Regular', fontSize: 15 },
  hero: { alignItems: 'center', marginTop: 18, paddingHorizontal: 16 },
  heroButton: { alignItems: 'center' },
  heroLabel: { marginTop: 10 },
  heroName: { fontFamily: 'Prata-Regular', fontSize: 28, lineHeight: 36, marginTop: 4, textAlign: 'center' },
  heroDate: { fontSize: 14, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  none: { fontSize: 15, lineHeight: 21, textAlign: 'center', paddingVertical: 12 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 100, paddingHorizontal: 16, paddingVertical: 9, marginTop: 14 },
  summaryCount: { fontSize: 13, fontWeight: '700' },
  summaryRule: { width: 1, height: 14 },
  summaryPrivate: { fontSize: 13, fontWeight: '500' },
  shelf: { marginTop: 26 },
  shelfHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 16, marginBottom: 12 },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1.6 },
  shelfCount: { fontSize: 12, fontWeight: '700' },
  shelfRow: { paddingHorizontal: 12, gap: 6 },
  cell: { width: 86, alignItems: 'center' },
  cellName: { fontSize: 12, fontWeight: '700', lineHeight: 15, marginTop: 8, textAlign: 'center' },
  cellProgress: { fontSize: 11, fontWeight: '600', lineHeight: 16, textAlign: 'center' },
  scrim: StyleSheet.absoluteFill,
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, paddingHorizontal: 20, alignItems: 'center' },
  grabber: { width: 40, height: 4, borderRadius: 2 },
  sheetSeal: { marginTop: 20 },
  sheetName: { fontFamily: 'Prata-Regular', fontSize: 28, lineHeight: 36, marginTop: 14, textAlign: 'center' },
  sheetStatus: { fontSize: 15, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  sheetHow: { fontSize: 14, fontWeight: '500', lineHeight: 20, marginTop: 10, maxWidth: 300, textAlign: 'center' },
  done: { alignSelf: 'stretch', height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  doneText: { fontFamily: 'BakbakOne-Regular', fontSize: 16 },
});
