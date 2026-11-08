// src/features/beauty-profile/BeautyMapLanding.tsx
//
// The Beauty Profile landing, "Map of you" (approved 2026-11-08). From the
// top:
// - Maintenance's big card (concept C) while something is due, with Book /
//   Done it / Snooze +7 days. With nothing due it folds into a slim
//   "Maintenance · All clear" strip under the map instead.
// - The body map (Portrait + hands by default; "Change figure" offers the
//   other three). Due dots on the pins are off unless the client turns them on.
// - Strips: Health & Safety, Maintenance (when folded) and Circle.
// - The picked area's panel: its headline answer and each answer, every row
//   opening that category's editor. Skin tone is never shown.
// Replaces the Beauty Card landing (BeautyLanding.tsx), which is gone.

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FocusAwareStatusBar } from '../../components/FocusAwareStatusBar';
import { ThemedBackground } from '../../components/ThemedBackground';
import { TodoMark } from '../../components/TodoMark';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation, type TranslationKey } from '../../i18n';
import type { BeautyData, CategoryKey } from '../../types/beautyProfile';
import type { MaintenanceItem } from '../../types/maintenance';
import type { BeautyProfileStats } from '../../utils/beautyProfileStats';
import type { BeautyTodoField, BeautyTodoItem } from '../../utils/beautyProfileTodo';
import { dateToYMD } from '../../utils/dateUtils';
import { FONT_BODY, FONT_DISPLAY, hapticLight, semanticColors, ui } from '../maintenance/ui';
import { nextUpFrom } from '../maintenance/presentation';
import type { MaintenanceState } from '../maintenance/useMaintenance';
import { NextUpCard } from '../maintenance/NextUpCard';
import { highlightCategory, type HighlightLabels } from './highlights';
import { AREA_CATEGORY, AREA_PANEL_LABEL, areaRows, maintenanceForMap, type FigurePrefs, type MapArea } from './bodyMap';
import { BodyMap } from './BodyFigure';
import { FigureSheet } from './FigureSheet';

const TODO_LABEL: Record<BeautyTodoField, TranslationKey> = {
  hairType: 'beautyProfile.todo.hairType',
  skinType: 'beautyProfile.todo.skinType',
  skinConcerns: 'beautyProfile.todo.skinConcerns',
  styleVibe: 'beautyProfile.todo.styleVibe',
  allergies: 'beautyProfile.todo.allergies',
  treatmentHistory: 'beautyProfile.todo.treatmentHistory',
};

export interface CircleSummary {
  /** Null until the sharing settings have loaded. */
  isPrivate: boolean | null;
  requests: number;
}

interface Props {
  profile: BeautyData;
  stats: BeautyProfileStats;
  maintenance: MaintenanceState;
  figurePrefs: FigurePrefs;
  onFigurePrefsChange: (next: FigurePrefs) => void;
  circle: CircleSummary;
  onBack: () => void;
  /** Opens one category's editor, ready to answer. */
  onEditCategory: (key: CategoryKey) => void;
  onOpenHealth: () => void;
  /** Every category, including the ones not on the map (personalisation, consent). */
  onOpenAllProfile: () => void;
  onOpenMaintenance: () => void;
  onOpenSetup: () => void;
  onOpenCircle: () => void;
  onBook: (item: MaintenanceItem) => void;
  onDone: (item: MaintenanceItem) => void;
  onSnooze: (item: MaintenanceItem) => void;
  busyItemId: string | null;
  /** What's still to do (beautyProfileTodo) — the same list behind the red "!" on the Settings row. */
  todo: BeautyTodoItem[];
  onOpenTodoField: (field: BeautyTodoField) => void;
  onOpenAccountDetails: () => void;
}

export function BeautyMapLanding({
  profile, stats, maintenance, figurePrefs, onFigurePrefsChange, circle, onBack, onEditCategory,
  onOpenHealth, onOpenAllProfile, onOpenMaintenance, onOpenSetup, onOpenCircle, onBook, onDone,
  onSnooze, busyItemId, todo, onOpenTodoField, onOpenAccountDetails,
}: Props) {
  const { theme, isDarkMode, palette: P } = useTheme();
  const S = semanticColors(isDarkMode);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [area, setArea] = useState<MapArea>('hair');
  const [figureSheet, setFigureSheet] = useState(false);
  const go = (fn: () => void) => () => { hapticLight(); fn(); };

  const today = dateToYMD(new Date());
  const visibleItems = useMemo(
    () => maintenance.items.filter((i) => i.kind !== 'event' || (i.eventOn ?? today) >= today),
    [maintenance.items, today],
  );
  const { groups, dots } = useMemo(
    () => maintenanceForMap(visibleItems, today, maintenance.coverage),
    [visibleItems, today, maintenance.coverage],
  );
  const nextUp = useMemo(() => nextUpFrom(groups), [groups]);
  const firstRun = !maintenance.loading && !maintenance.error
    && maintenance.items.length === 0 && !maintenance.settings?.setupCompletedAt;

  const labels = useMemo<HighlightLabels>(() => ({
    scalp: (condition) => t('beautyProfile.card.scalp', { condition }),
    medicalNote: t('beautyProfile.card.medicalNote'),
    photosOn: t('beautyProfile.photosOn'),
    photosOff: t('beautyProfile.photosOff'),
  }), [t]);

  // ── Health & Safety line (same wording as before) ─────────────────────────
  const health = stats.byCategory.health;
  const allergies = profile.allergies;
  const healthLine = !health.started
    ? t('beautyProfile.card.addHealth')
    : allergies.length === 1 && allergies[0] === 'None known'
      ? t('beautyProfile.card.noAllergies')
      : allergies.length > 0
        ? t(allergies.length === 1 ? 'beautyProfile.card.allergiesOne' : 'beautyProfile.card.allergies', { count: allergies.length })
        : t('beautyProfile.card.medicalOnly');

  // ── Maintenance strip, when the big card is folded ────────────────────────
  const maintenanceStrip = () => {
    let right: React.ReactNode;
    let onPress = onOpenMaintenance;
    if (maintenance.loading && maintenance.items.length === 0) {
      right = <ActivityIndicator size="small" color={P.sub} />;
    } else if (maintenance.error) {
      right = <Text style={[styles.stripRight, { color: P.accentText }]}>{t('maintenance.tryAgain')}</Text>;
      onPress = () => { void maintenance.reload(); };
    } else if (firstRun) {
      right = <Text style={[styles.stripRight, { color: P.accentText }]}>{t('maintenance.strip.setUp')}</Text>;
      onPress = onOpenSetup;
    } else {
      right = <Text style={[styles.stripRight, { color: P.sub }]}>{t('maintenance.strip.allClear')}</Text>;
    }
    return (
      <TouchableOpacity
        style={[styles.strip, { backgroundColor: P.surface }]}
        onPress={go(onPress)}
        activeOpacity={0.5}
        accessibilityRole="button"
        accessibilityLabel={t('maintenance.title')}
      >
        <Ionicons name="repeat" size={15} color={P.accentText} />
        <Text style={[styles.stripTitle, { color: P.text }]}>{t('maintenance.title').toUpperCase()}</Text>
        <View style={styles.stripEnd}>{right}</View>
        <Ionicons name="chevron-forward" size={14} color={P.sub} />
      </TouchableOpacity>
    );
  };

  const circleLine = circle.requests > 0
    ? (circle.requests === 1 ? t('beautyProfile.circle.requestsOne') : t('beautyProfile.circle.requests', { count: circle.requests }))
    : circle.isPrivate === null
      ? ''
      : t(circle.isPrivate ? 'beautyProfile.circle.private' : 'beautyProfile.circle.open');

  // ── The picked area's panel ──────────────────────────────────────────────
  const category = AREA_CATEGORY[area];
  const lead = highlightCategory(category, profile, labels).lead;
  const rows = areaRows(area, profile);

  // ── Still to fill in ─────────────────────────────────────────────────────
  const todoFields = todo.filter((i): i is BeautyTodoField => i !== 'dob');
  const todoNames = todoFields.map((f) => t(TODO_LABEL[f])).join(', ');

  return (
    <ThemedBackground style={styles.bg}>
      <FocusAwareStatusBar barStyle={theme.statusBar} />
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
          <Text style={[styles.title, { color: P.text }]} numberOfLines={1}>{t('profile.forYou.beauty.title')}</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={go(() => setFigureSheet(true))} activeOpacity={0.5} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.link, { color: P.accentText }]}>{t('beautyProfile.figure.change').toUpperCase()}</Text>
          </TouchableOpacity>
        </View>

        {nextUp.due ? (
          <NextUpCard
            nextUp={nextUp}
            compact
            onOpenAll={onOpenMaintenance}
            onBook={onBook}
            onDone={onDone}
            onSnooze={onSnooze}
            busyItemId={busyItemId}
            P={P}
            t={t}
          />
        ) : null}

        <BodyMap
          figure={figurePrefs.figure}
          area={area}
          onPick={setArea}
          P={P}
          S={S}
          dots={figurePrefs.dueDots ? dots : undefined}
        />

        <View style={styles.strips}>
          <TouchableOpacity
            style={[styles.strip, { backgroundColor: P.surface }]}
            onPress={go(onOpenHealth)}
            activeOpacity={0.5}
            accessibilityRole="button"
            accessibilityLabel={`${t('beautyProfile.health.title')}, ${healthLine}`}
          >
            <Ionicons name={health.started ? 'shield-checkmark-outline' : 'warning-outline'} size={15} color={S.warn} />
            <Text style={[styles.stripTitle, { color: P.text }]}>{t('beautyProfile.health.title').toUpperCase()}</Text>
            <View style={styles.stripEnd}>
              <Text style={[styles.stripRight, { color: P.sub }]} numberOfLines={1}>{healthLine}</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={P.sub} />
          </TouchableOpacity>

          {nextUp.due ? null : maintenanceStrip()}

          <TouchableOpacity
            style={[styles.strip, { backgroundColor: P.surface }]}
            onPress={go(onOpenCircle)}
            activeOpacity={0.5}
            accessibilityRole="button"
            accessibilityLabel={`${t('beautyProfile.circle.title')}${circleLine ? `, ${circleLine}` : ''}`}
          >
            <Ionicons name="people-outline" size={15} color={P.accentText} />
            <Text style={[styles.stripTitle, { color: P.text }]}>{t('beautyProfile.circle.title').toUpperCase()}</Text>
            <View style={styles.stripEnd}>
              {circle.requests > 0 ? <View style={[styles.reqDot, { backgroundColor: S.bad }]} /> : null}
              <Text style={[styles.stripRight, { color: P.sub }]} numberOfLines={1}>{circleLine}</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={P.sub} />
          </TouchableOpacity>
        </View>

        {todoFields.length > 0 && (
          <TouchableOpacity
            style={[styles.nudge, { backgroundColor: P.accentDim }]}
            onPress={go(() => onOpenTodoField(todoFields[0]!))}
            activeOpacity={0.5}
            accessibilityRole="button"
            accessibilityLabel={t('beautyProfile.todo.a11y', { fields: todoNames })}
          >
            <TodoMark size={20} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.nudgeTitle, { color: P.text }]}>{t('beautyProfile.todo.title').toUpperCase()}</Text>
              <Text style={[styles.nudgeSub, { color: P.sub }]}>{todoNames}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={P.sub} />
          </TouchableOpacity>
        )}
        {todo.includes('dob') && (
          <TouchableOpacity
            style={[styles.nudge, { backgroundColor: P.accentDim }]}
            onPress={go(onOpenAccountDetails)}
            activeOpacity={0.5}
            accessibilityRole="button"
            accessibilityLabel={`${t('beautyProfile.todo.dob.title')}, ${t('beautyProfile.todo.dob.sub')}`}
          >
            <TodoMark size={20} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.nudgeTitle, { color: P.text }]}>{t('beautyProfile.todo.dob.title').toUpperCase()}</Text>
              <Text style={[styles.nudgeSub, { color: P.sub }]}>{t('beautyProfile.todo.dob.sub')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={P.sub} />
          </TouchableOpacity>
        )}

        <View style={[ui.card, styles.panel, { backgroundColor: P.card, borderColor: P.border }]}>
          <Text style={[styles.kicker, { color: P.sub }]}>{AREA_PANEL_LABEL[area]}</Text>
          <TouchableOpacity onPress={go(() => onEditCategory(category))} activeOpacity={0.6} accessibilityRole="button">
            <Text
              style={[styles.lead, { color: lead ? P.text : P.accentText }, (lead?.length ?? 0) > 14 && styles.leadSm]}
              numberOfLines={2}
            >
              {(lead ?? `+ ${t('beautyProfile.card.add')}`).toUpperCase()}
            </Text>
          </TouchableOpacity>
          {rows.map((row) => (
            <TouchableOpacity
              key={row.label}
              style={[styles.row, { borderTopColor: P.sep }]}
              onPress={go(() => onEditCategory(category))}
              activeOpacity={0.5}
              accessibilityRole="button"
              accessibilityLabel={`${row.label}, ${row.value ?? t('beautyProfile.card.add')}`}
            >
              <Text style={[styles.rowLabel, { color: P.sub }]}>{row.label.toUpperCase()}</Text>
              <Text style={[styles.rowValue, { color: row.value ? P.text : P.accentText }]} numberOfLines={2}>
                {row.value ?? t('beautyProfile.card.add')}
              </Text>
              <Ionicons name="chevron-forward" size={13} color={P.sub} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity onPress={go(onOpenAllProfile)} activeOpacity={0.5} accessibilityRole="button" style={styles.allLink}>
          <Text style={[styles.link, { color: P.accentText }]}>
            {t('beautyProfile.map.seeAll', { percent: stats.overallPercent }).toUpperCase()} ›
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <FigureSheet
        visible={figureSheet}
        prefs={figurePrefs}
        onChange={onFigurePrefsChange}
        onClose={() => setFigureSheet(false)}
        P={P}
        t={t}
      />
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  scroll: { paddingHorizontal: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  circ: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: FONT_DISPLAY, fontSize: 24, letterSpacing: 1, flexShrink: 1 },
  link: { fontFamily: FONT_DISPLAY, fontSize: 11.5, letterSpacing: 1.2 },
  kicker: { fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: 1.6 },

  strips: { gap: 6 },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 100, paddingVertical: 9, paddingHorizontal: 14 },
  stripTitle: { fontFamily: FONT_DISPLAY, fontSize: 12, letterSpacing: 0.6 },
  stripEnd: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minWidth: 0 },
  stripRight: { fontFamily: FONT_BODY, fontSize: 12, flexShrink: 1, textAlign: 'right' },
  reqDot: { width: 8, height: 8, borderRadius: 4 },

  nudge: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16 },
  nudgeTitle: { fontFamily: FONT_DISPLAY, fontSize: 12, letterSpacing: 1 },
  nudgeSub: { fontFamily: FONT_BODY, fontSize: 12, lineHeight: 16, marginTop: 2 },

  // A touch more lift than ui.card, as in the mockup's .zp.
  panel: { borderRadius: 20, padding: 16, shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } },
  lead: { fontFamily: FONT_DISPLAY, fontSize: 28, lineHeight: 31, letterSpacing: 0.5, marginTop: 4, marginBottom: 8 },
  leadSm: { fontSize: 21, lineHeight: 25 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 11 },
  rowLabel: { width: 108, fontFamily: FONT_DISPLAY, fontSize: 10.5, letterSpacing: 0.8 },
  rowValue: { flex: 1, fontFamily: FONT_BODY, fontSize: 14 },
  allLink: { alignSelf: 'center', paddingVertical: 6 },
});
