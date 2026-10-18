// src/features/beauty-profile/BeautyLanding.tsx
//
// The Beauty Profile landing: still two doors (approved Concept B, "Two
// doors"), now in the Beauty Card layout (approved 2026-10-18). My Profile is
// the filled card and leads with the client's own answers in big type;
// Maintenance sits under it as countdown stubs. Each door opens its own full
// view. On first run the Maintenance section carries the setup invitation.

import React, { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from '../../i18n';
import type { TranslationKey } from '../../i18n/types';
import { ThemedBackground } from '../../components/ThemedBackground';
import type { BeautyData } from '../../types/beautyProfile';
import { CATEGORY_LABELS, CATEGORY_ORDER, type BeautyProfileStats } from '../../utils/beautyProfileStats';
import { dateToYMD } from '../../utils/dateUtils';
import { countdownFor, groupMaintenanceItems, landingStubs, type CountdownUnit } from '../maintenance/presentation';
import type { MaintenanceState } from '../maintenance/useMaintenance';
import { FONT_BODY, FONT_DISPLAY, semanticColors, hapticLight, ui } from '../maintenance/ui';
import { CARD_TRAITS, highlightCategory, type HighlightLabels } from './highlights';

interface Props {
  profile: BeautyData;
  stats: BeautyProfileStats;
  maintenance: MaintenanceState;
  onBack: () => void;
  onOpenMaintenance: () => void;
  onOpenSetup: () => void;
  onOpenProfile: () => void;
  onOpenHealth: () => void;
}

const COUNTDOWN_UNIT: Record<CountdownUnit, TranslationKey> = {
  daysOver: 'maintenance.countdown.daysOver',
  dayOver:  'maintenance.countdown.dayOver',
  today:    'maintenance.countdown.today',
  day:      'maintenance.countdown.day',
  days:     'maintenance.countdown.days',
  weeks:    'maintenance.countdown.weeks',
  booked:   'maintenance.countdown.booked',
  bookNow:  'maintenance.countdown.bookNow',
  noDate:   'maintenance.countdown.noDate',
};

export function BeautyLanding({
  profile, stats, maintenance, onBack, onOpenMaintenance, onOpenSetup, onOpenProfile, onOpenHealth,
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
  const stubs = useMemo(() => landingStubs(groups), [groups]);
  const activeCount = maintenance.items.filter(i => !i.paused).length;
  const firstRun = !maintenance.loading && !maintenance.error
    && maintenance.items.length === 0 && !maintenance.settings?.setupCompletedAt;

  const labels = useMemo<HighlightLabels>(() => ({
    scalp: condition => t('beautyProfile.card.scalp', { condition }),
    medicalNote: t('beautyProfile.card.medicalNote'),
    photosOn: t('beautyProfile.photosOn'),
    photosOff: t('beautyProfile.photosOff'),
  }), [t]);
  const traits = useMemo(
    () => CARD_TRAITS.map(key => highlightCategory(key, profile, labels)),
    [profile, labels],
  );

  const health = stats.byCategory.health;
  const allergies = profile.allergies;
  const healthLine = !health.started
    ? t('beautyProfile.card.addHealth')
    : allergies.length === 1 && allergies[0] === 'None known'
      ? t('beautyProfile.card.noAllergies')
      : allergies.length > 0
        ? t(allergies.length === 1 ? 'beautyProfile.card.allergiesOne' : 'beautyProfile.card.allergies', { count: allergies.length })
        : t('beautyProfile.card.medicalOnly');

  const blank = CATEGORY_ORDER.filter(k => k !== 'health' && k !== 'consent' && !stats.byCategory[k].started);

  const go = (fn: () => void) => () => { hapticLight(); fn(); };
  const onSoft = { color: P.onAccent, opacity: 0.72 };

  // ── My Profile: the Beauty Card ─────────────────────────────────────────
  const beautyCard = (
    <TouchableOpacity
      style={[styles.bcard, { backgroundColor: P.accent }]}
      onPress={go(onOpenProfile)}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${t('beautyProfile.myProfile')}, ${stats.isEmpty ? 'NEW' : t('beautyProfile.percentComplete', { percent: stats.overallPercent })}`}
    >
      <View pointerEvents="none" style={[styles.halo, { borderColor: P.onAccent }]} />
      <View style={styles.rowBetween}>
        <Text style={[styles.kicker, { color: P.onAccent }]}>{t('beautyProfile.myProfile').toUpperCase()}</Text>
        <Text style={[styles.kicker, onSoft]}>{stats.isEmpty ? 'NEW' : `${stats.overallPercent}%`}</Text>
      </View>

      {stats.isEmpty ? (
        <View style={{ gap: 6 }}>
          <Text style={[styles.newTitle, { color: P.onAccent }]}>{t('beautyProfile.card.newTitle').toUpperCase()}</Text>
          <Text style={[styles.body, onSoft]}>{t('beautyProfile.card.newSub')}</Text>
        </View>
      ) : (
        <View style={styles.traits}>
          {traits.map(h => (
            <View key={h.key} style={styles.trait}>
              <Text style={[styles.traitLabel, onSoft]}>{CATEGORY_LABELS[h.key]}</Text>
              {h.lead ? (
                <>
                  <Text
                    style={[styles.traitValue, { color: P.onAccent }, h.lead.length > 9 && styles.traitValueSm]}
                    numberOfLines={2}
                  >
                    {h.lead.toUpperCase()}
                  </Text>
                  {h.details[0] ? <Text style={[styles.traitSub, onSoft]} numberOfLines={1}>{h.details[0]}</Text> : null}
                </>
              ) : (
                <Text style={[styles.traitAdd, onSoft]}>+ {t('beautyProfile.card.add').toUpperCase()}</Text>
              )}
            </View>
          ))}
        </View>
      )}

      <View style={[styles.cardFoot, { borderTopColor: isDarkMode ? 'rgba(27,39,64,0.16)' : 'rgba(255,255,255,0.18)' }]}>
        <TouchableOpacity
          style={styles.badge}
          onPress={go(onOpenHealth)}
          activeOpacity={0.5}
          accessibilityRole="button"
          accessibilityLabel={`${t('beautyProfile.health.title')}, ${healthLine}`}
          hitSlop={8}
        >
          <Ionicons name={health.started ? 'shield-checkmark-outline' : 'shield-outline'} size={15} color={P.onAccent} />
          <Text style={[styles.badgeText, { color: P.onAccent }]}>{healthLine}</Text>
        </TouchableOpacity>
        <View style={styles.goRight}>
          <Text style={[styles.go, { color: P.onAccent }]}>{t('maintenance.card.open').toUpperCase()}</Text>
          <Ionicons name="chevron-forward" size={13} color={P.onAccent} />
        </View>
      </View>
    </TouchableOpacity>
  );

  // ── Maintenance: countdown stubs ────────────────────────────────────────
  const maintenanceBody = () => {
    if (maintenance.loading && maintenance.items.length === 0) {
      return (
        <View style={[ui.card, styles.quiet, { backgroundColor: P.card, borderColor: P.border }]}>
          <ActivityIndicator color={P.accentText} />
        </View>
      );
    }
    if (maintenance.error) {
      return (
        <TouchableOpacity
          style={[ui.card, styles.quiet, { backgroundColor: P.card, borderColor: P.border }]}
          onPress={go(() => { void maintenance.reload(); })}
          activeOpacity={0.5}
          accessibilityRole="button"
        >
          <Text style={[ui.body, { color: P.text }]}>{t('maintenance.error.load')}</Text>
          <Text style={[styles.go, { color: P.accentText }]}>{t('maintenance.tryAgain').toUpperCase()}</Text>
        </TouchableOpacity>
      );
    }
    if (firstRun) {
      return (
        <View style={[ui.card, styles.quiet, { backgroundColor: P.card, borderColor: P.border }]}>
          <Text style={[styles.ctaTitle, { color: P.text }]}>{t('maintenance.firstRun.title')}</Text>
          <Text style={[styles.body, { color: P.sub }]}>{t('maintenance.firstRun.note')}</Text>
          <TouchableOpacity
            style={[styles.ctaBtn, { backgroundColor: P.accent }]}
            onPress={go(onOpenSetup)}
            activeOpacity={0.75}
            accessibilityRole="button"
          >
            <Text style={[styles.ctaBtnText, { color: P.onAccent }]}>{t('maintenance.firstRun.cta').toUpperCase()}</Text>
            <Ionicons name="chevron-forward" size={14} color={P.onAccent} />
          </TouchableOpacity>
        </View>
      );
    }
    if (stubs.length === 0) {
      return (
        <TouchableOpacity
          style={[ui.card, styles.quiet, { backgroundColor: P.card, borderColor: P.border }]}
          onPress={go(onOpenMaintenance)}
          activeOpacity={0.5}
          accessibilityRole="button"
        >
          <Text style={[styles.ctaTitle, { color: P.text }]}>{t('maintenance.card.allClear')}</Text>
        </TouchableOpacity>
      );
    }
    return (
      <View style={styles.stubs}>
        {stubs.map(p => {
          const c = countdownFor(p);
          const tone = c.tone === 'bad' ? S.bad : c.tone === 'warn' ? S.warn : c.tone === 'ok' ? S.ok : P.text;
          const unit = t(COUNTDOWN_UNIT[c.unit]).toUpperCase();
          return (
            <TouchableOpacity
              key={p.item.id}
              style={[ui.card, styles.stub, { backgroundColor: P.card, borderColor: c.tone === 'bad' ? S.bad : P.border }]}
              onPress={go(onOpenMaintenance)}
              activeOpacity={0.5}
              accessibilityRole="button"
              accessibilityLabel={`${p.item.title}, ${c.value !== null ? `${c.value} ` : ''}${unit}`}
            >
              {c.value !== null
                ? <Text style={[styles.stubNum, { color: tone }]}>{c.value}</Text>
                : <Text style={[styles.stubWord, { color: tone }]} numberOfLines={1}>{unit}</Text>}
              {c.value !== null && (
                <Text style={[styles.stubUnit, { color: c.tone === 'mute' ? P.sub : tone }]} numberOfLines={1}>{unit}</Text>
              )}
              <Text style={[styles.stubTitle, { color: P.text }]} numberOfLines={2}>{p.item.title}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  // ── What to do next on the profile ──────────────────────────────────────
  const nudge = !health.started ? (
    <TouchableOpacity
      style={[styles.nudge, { backgroundColor: S.warnDim }]}
      onPress={go(onOpenHealth)}
      activeOpacity={0.5}
      accessibilityRole="button"
    >
      <Ionicons name="shield-outline" size={20} color={S.warn} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.nudgeTitle, { color: P.text }]}>{t('beautyProfile.health.title').toUpperCase()}</Text>
        <Text style={[styles.nudgeSub, { color: P.sub }]}>{t('beautyProfile.health.notStarted')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={P.sub} />
    </TouchableOpacity>
  ) : !stats.isEmpty && blank.length > 0 ? (
    <TouchableOpacity
      style={[styles.nudge, { backgroundColor: P.accentDim }]}
      onPress={go(onOpenProfile)}
      activeOpacity={0.5}
      accessibilityRole="button"
    >
      <Ionicons name="add" size={20} color={P.accentText} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.nudgeTitle, { color: P.text }]}>{t('beautyProfile.card.finishTitle').toUpperCase()}</Text>
        <Text style={[styles.nudgeSub, { color: P.sub }]} numberOfLines={2}>
          {t('beautyProfile.card.finishSub', { sections: blank.map(k => CATEGORY_LABELS[k]).join(', ') })}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={P.sub} />
    </TouchableOpacity>
  ) : null;

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

        {beautyCard}

        <View style={styles.sectionHead}>
          <Text style={[styles.kicker, { color: P.sub }]}>{t('maintenance.title').toUpperCase()}</Text>
          {activeCount > 0 && (
            <TouchableOpacity onPress={go(onOpenMaintenance)} activeOpacity={0.5} accessibilityRole="button" hitSlop={8}>
              <Text style={[styles.go, { color: P.accentText }]}>
                {t('maintenance.landing.seeAll', { count: activeCount }).toUpperCase()} ›
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {maintenanceBody()}

        {nudge}
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
  kicker: { fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: 1.6 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  body: { fontFamily: FONT_BODY, fontSize: 13, lineHeight: 18 },
  go: { fontFamily: FONT_DISPLAY, fontSize: 12, letterSpacing: 1.2 },
  goRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  bcard: { borderRadius: 24, padding: 18, paddingBottom: 16, gap: 16, overflow: 'hidden' },
  halo: { position: 'absolute', right: -60, top: -60, width: 200, height: 200, borderRadius: 100, borderWidth: 28, opacity: 0.12 },
  newTitle: { fontFamily: FONT_DISPLAY, fontSize: 26, lineHeight: 30, letterSpacing: 0.5 },
  traits: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  trait: { width: '50%', paddingRight: 10 },
  traitLabel: { fontFamily: FONT_DISPLAY, fontSize: 10, letterSpacing: 1.5 },
  traitValue: { fontFamily: FONT_DISPLAY, fontSize: 24, lineHeight: 27, letterSpacing: 0.5, marginTop: 3 },
  traitValueSm: { fontSize: 17, lineHeight: 21 },
  traitSub: { fontFamily: FONT_BODY, fontSize: 12, marginTop: 2 },
  traitAdd: { fontFamily: FONT_DISPLAY, fontSize: 14, letterSpacing: 1, marginTop: 6 },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 12, gap: 10 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  badgeText: { fontFamily: FONT_BODY, fontSize: 12, fontWeight: '700', flexShrink: 1 },

  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 },
  quiet: { padding: 16, gap: 10 },
  ctaTitle: { fontFamily: FONT_DISPLAY, fontSize: 18, letterSpacing: 1, lineHeight: 22 },
  ctaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 100, paddingVertical: 13 },
  ctaBtnText: { fontFamily: FONT_DISPLAY, fontSize: 13, letterSpacing: 1.2 },
  stubs: { flexDirection: 'row', gap: 8 },
  stub: { flex: 1, padding: 12, gap: 4, minWidth: 0 },
  stubNum: { fontFamily: FONT_DISPLAY, fontSize: 30, lineHeight: 32 },
  stubWord: { fontFamily: FONT_DISPLAY, fontSize: 15, lineHeight: 32, letterSpacing: 0.8 },
  stubUnit: { fontFamily: FONT_DISPLAY, fontSize: 10, letterSpacing: 1.2 },
  stubTitle: { fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: '700', lineHeight: 16, marginTop: 4 },

  nudge: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16 },
  nudgeTitle: { fontFamily: FONT_DISPLAY, fontSize: 12, letterSpacing: 1 },
  nudgeSub: { fontFamily: FONT_BODY, fontSize: 12, lineHeight: 16, marginTop: 2 },
});
