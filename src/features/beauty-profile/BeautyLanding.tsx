// src/features/beauty-profile/BeautyLanding.tsx
//
// The Beauty Profile landing: two peer doors (approved Concept B). Maintenance
// is the filled card, My Profile the quiet one; each opens its own full view.
// On first run the Maintenance card carries the setup invitation instead.

import React, { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from '../../i18n';
import { ThemedBackground } from '../../components/ThemedBackground';
import type { BeautyProfileStats } from '../../utils/beautyProfileStats';
import { dateToYMD } from '../../utils/dateUtils';
import { groupMaintenanceItems } from '../maintenance/presentation';
import { itemPill } from '../maintenance/MaintenanceItemCard';
import type { MaintenanceState } from '../maintenance/useMaintenance';
import { FONT_BODY, FONT_DISPLAY, ProgressBar, semanticColors, hapticLight, ui } from '../maintenance/ui';

interface Props {
  stats: BeautyProfileStats;
  maintenance: MaintenanceState;
  onBack: () => void;
  onOpenMaintenance: () => void;
  onOpenSetup: () => void;
  onOpenProfile: () => void;
  onOpenHealth: () => void;
}

export function BeautyLanding({
  stats, maintenance, onBack, onOpenMaintenance, onOpenSetup, onOpenProfile, onOpenHealth,
}: Props) {
  const { theme, isDarkMode, palette: P } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const S = useMemo(() => semanticColors(isDarkMode), [isDarkMode]);

  const today = dateToYMD(new Date());
  const groups = useMemo(
    () => groupMaintenanceItems(maintenance.items, today, maintenance.coverage),
    [maintenance.items, today, maintenance.coverage],
  );
  const dueCount = groups.summary.overdue + groups.summary.dueSoon;
  const firstRun = !maintenance.loading && !maintenance.error
    && maintenance.items.length === 0 && !maintenance.settings?.setupCompletedAt;

  const go = (fn: () => void) => () => { hapticLight(); fn(); };

  const maintenanceCard = () => {
    if (maintenance.loading && maintenance.items.length === 0) {
      return (
        <View style={[ui.card, styles.door, { backgroundColor: P.accent, borderColor: P.accent }]}>
          <Text style={[styles.kicker, { color: P.onAccent }]}>{t('maintenance.title').toUpperCase()}</Text>
          <ActivityIndicator color={P.onAccent} />
        </View>
      );
    }
    if (maintenance.error) {
      return (
        <TouchableOpacity
          style={[ui.card, styles.door, { backgroundColor: P.card, borderColor: P.border }]}
          onPress={go(() => { void maintenance.reload(); })}
          activeOpacity={0.5}
          accessibilityRole="button"
        >
          <Text style={[styles.kicker, { color: P.sub }]}>{t('maintenance.title').toUpperCase()}</Text>
          <Text style={[ui.body, { color: P.text }]}>{t('maintenance.error.load')}</Text>
          <Text style={[styles.go, { color: P.accentText }]}>{t('maintenance.tryAgain').toUpperCase()}</Text>
        </TouchableOpacity>
      );
    }
    if (firstRun) {
      return (
        <View style={[ui.card, styles.door, { backgroundColor: P.accent, borderColor: P.accent }]}>
          <Text style={[styles.kicker, { color: P.onAccent }]}>{t('maintenance.title').toUpperCase()}</Text>
          <Text style={[styles.ctaTitle, { color: P.onAccent }]}>{t('maintenance.firstRun.title')}</Text>
          <Text style={[styles.body, { color: P.onAccent }]}>{t('maintenance.firstRun.note')}</Text>
          <TouchableOpacity
            style={[styles.ctaBtn, { backgroundColor: P.onAccent }]}
            onPress={go(onOpenSetup)}
            activeOpacity={0.75}
            accessibilityRole="button"
          >
            <Text style={[styles.ctaBtnText, { color: P.accent }]}>{t('maintenance.firstRun.cta').toUpperCase()}</Text>
            <Ionicons name="chevron-forward" size={14} color={P.accent} />
          </TouchableOpacity>
        </View>
      );
    }
    const next = groups.next;
    const total = maintenance.items.filter(i => !i.paused).length;
    return (
      <TouchableOpacity
        style={[ui.card, styles.door, { backgroundColor: P.accent, borderColor: P.accent }]}
        onPress={go(onOpenMaintenance)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${t('maintenance.title')}, ${t('maintenance.card.dueCount', { count: dueCount })}`}
      >
        <Text style={[styles.kicker, { color: P.onAccent }]}>{t('maintenance.title').toUpperCase()}</Text>
        {dueCount > 0 ? (
          <View style={styles.bigRow}>
            <Text style={[styles.big, { color: P.onAccent }]}>{dueCount}</Text>
            <Text style={[styles.bigSmall, { color: P.onAccent }]}>{t('maintenance.card.needYou')}</Text>
          </View>
        ) : (
          <Text style={[styles.ctaTitle, { color: P.onAccent }]}>{t('maintenance.card.allClear')}</Text>
        )}
        {next && (
          <>
            <Text style={[styles.body, { color: P.onAccent }]} numberOfLines={2}>
              {t('maintenance.card.next', { title: next.item.title, when: itemPill(next.item, next.view, t).text.toLowerCase() })}
            </Text>
            {next.view.progressPercent !== null && (
              <ProgressBar
                percent={next.view.progressPercent}
                colour={P.onAccent}
                track={isDarkMode ? 'rgba(27,39,64,0.2)' : 'rgba(255,255,255,0.22)'}
              />
            )}
          </>
        )}
        <View style={styles.goRow}>
          <Text style={[styles.go, { color: P.onAccent }]}>{t('maintenance.card.onSchedule', { count: total }).toUpperCase()}</Text>
          <View style={styles.goRight}>
            <Text style={[styles.go, { color: P.onAccent }]}>{t('maintenance.card.open').toUpperCase()}</Text>
            <Ionicons name="chevron-forward" size={14} color={P.onAccent} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ThemedBackground style={styles.bg}>
      <StatusBar barStyle={theme.statusBar} translucent />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={[styles.circ, { backgroundColor: P.card, borderColor: P.border }]}
            onPress={go(onBack)}
            activeOpacity={0.5}
            accessibilityRole="button"
            accessibilityLabel={t('maintenance.back')}
          >
            <Ionicons name="chevron-back" size={18} color={P.accentText} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: P.text }]}>{t('profile.forYou.beauty.title')}</Text>
        </View>

        {maintenanceCard()}

        <TouchableOpacity
          style={[ui.card, styles.door, { backgroundColor: P.card, borderColor: P.border }]}
          onPress={go(onOpenProfile)}
          activeOpacity={0.5}
          accessibilityRole="button"
        >
          <Text style={[styles.kicker, { color: P.sub }]}>{t('beautyProfile.myProfile').toUpperCase()}</Text>
          <View style={styles.bigRow}>
            <Text style={[styles.big, { color: P.text, fontSize: 44 }]}>{stats.isEmpty ? 'NEW' : `${stats.overallPercent}%`}</Text>
            <Text style={[styles.bigSmall, { color: P.sub }]}>
              {stats.isEmpty
                ? t('beautyProfile.startAny')
                : t('beautyProfile.sectionsStarted', { started: stats.categoriesStarted, total: stats.categoriesTotal })}
            </Text>
          </View>
          <Text style={[styles.body, { color: P.sub }]}>{t('beautyProfile.shapesSuggestions')}</Text>
          <View style={styles.goRow}>
            <Text style={[styles.go, { color: P.accentText }]}>
              {(stats.isEmpty ? t('beautyProfile.start') : t('beautyProfile.editProfile')).toUpperCase()}
            </Text>
            <View style={styles.goRight}>
              <Text style={[styles.go, { color: P.accentText }]}>{t('maintenance.card.open').toUpperCase()}</Text>
              <Ionicons name="chevron-forward" size={14} color={P.accentText} />
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.hs, { backgroundColor: S.warnDim, borderColor: P.border }]}
          onPress={go(onOpenHealth)}
          activeOpacity={0.5}
          accessibilityRole="button"
        >
          <Ionicons name="shield-outline" size={22} color={S.warn} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.hsTitle, { color: P.text }]}>{t('beautyProfile.health.title').toUpperCase()}</Text>
            <Text style={[styles.hsSub, { color: P.sub }]}>{t('beautyProfile.health.shared')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={P.sub} />
        </TouchableOpacity>
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  scroll: { paddingHorizontal: 16, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  circ: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: FONT_DISPLAY, fontSize: 24, letterSpacing: 1 },
  door: { padding: 16, gap: 10 },
  kicker: { fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: 1.6, opacity: 0.85 },
  bigRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  big: { fontFamily: FONT_DISPLAY, fontSize: 38, lineHeight: 42, letterSpacing: 1 },
  bigSmall: { fontFamily: FONT_DISPLAY, fontSize: 14, letterSpacing: 1, paddingBottom: 6, opacity: 0.9, flexShrink: 1 },
  body: { fontFamily: FONT_BODY, fontSize: 13, lineHeight: 18, opacity: 0.9 },
  ctaTitle: { fontFamily: FONT_DISPLAY, fontSize: 20, letterSpacing: 1, lineHeight: 24 },
  ctaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 100, paddingVertical: 13 },
  ctaBtnText: { fontFamily: FONT_DISPLAY, fontSize: 13, letterSpacing: 1.2 },
  goRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  go: { fontFamily: FONT_DISPLAY, fontSize: 12, letterSpacing: 1.2 },
  hs: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  hsTitle: { fontFamily: FONT_DISPLAY, fontSize: 12, letterSpacing: 1 },
  hsSub: { fontFamily: FONT_BODY, fontSize: 12, marginTop: 2 },
});
