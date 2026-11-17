// src/features/beauty-profile/BeautyProfileLanding.tsx
//
// The Beauty Profile landing, design C "Hello" (owner, 2026-11-17; boards on
// the demure canvas, plum set). From the top:
// - "Hello {first name}", with Your circle behind the sharing button.
// - Your look: their style answer, and a ring of how complete the profile is.
// - Your Beauty Profile: a card per area in a mosaic (a tall dark Hair card,
//   Skin, Lashes & brows, a wide Nails card, Makeup, and Health & Safety,
//   dashed with "Finish this" until it's started). Each opens its editor.
// - Maintenance schedule: the next four items on a timeline, Book on the
//   ones that are due, the whole list one tap away.
// - Still to fill in, and Suited to you, as before.
// Replaces the "Map of you" body map (BeautyMapLanding), which is gone with
// its figure picker.

import React, { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { FocusAwareStatusBar } from '../../components/FocusAwareStatusBar';
import { ThemedBackground } from '../../components/ThemedBackground';
import { TodoMark } from '../../components/TodoMark';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation, type TranslationKey } from '../../i18n';
import type { BeautyData, CategoryKey } from '../../types/beautyProfile';
import type { MaintenanceItem } from '../../types/maintenance';
import type { BeautyProfileStats } from '../../utils/beautyProfileStats';
import type { BeautyTodoField, BeautyTodoItem } from '../../utils/beautyProfileTodo';
import { dateToYMD, toLocalDate } from '../../utils/dateUtils';
import { FONT_BODY, FONT_DISPLAY, hapticLight, semanticColors } from '../maintenance/ui';
import { groupMaintenanceItems, needsAttention, type PresentedItem } from '../maintenance/presentation';
import type { MaintenanceState } from '../maintenance/useMaintenance';
import { highlightCategory, type HighlightLabels } from './highlights';
import { allSuitedIdeas, type SuitedIdea } from './suitedIdeas';

// Design C's plum set, light and dark (the client hat's plum / blue-grey).
const L = {
  card: '#FBF8FA', tint: '#EBDCE6', warm: '#F1E9D9',
  dark: '#3F1E36', darkInk: '#FBF2F8', darkSoft: '#D2B5C8', darkDisc: '#5A3550',
  deep: '#7A4A6C', track: '#EADFE6', ink: '#1E1019', soft: '#64525E', soft2: '#54434F',
  btn: '#3F1E36', btnInk: '#FFFFFF', future: '#A8A2B0',
};
const D: typeof L = {
  card: '#21181F', tint: '#35242F', warm: '#2E2A22',
  dark: '#E5ECF4', darkInk: '#151013', darkSoft: '#56606C', darkDisc: '#CBD6E3',
  deep: '#E5ECF4', track: '#33282F', ink: '#F4EDF2', soft: '#B4A5AF', soft2: '#C9BAC4',
  btn: '#E5ECF4', btnInk: '#151013', future: '#6E6670',
};

const TODO_LABEL: Record<BeautyTodoField, TranslationKey> = {
  hairType: 'beautyProfile.todo.hairType',
  skinType: 'beautyProfile.todo.skinType',
  skinConcerns: 'beautyProfile.todo.skinConcerns',
  styleVibe: 'beautyProfile.todo.styleVibe',
  allergies: 'beautyProfile.todo.allergies',
  treatmentHistory: 'beautyProfile.todo.treatmentHistory',
};

/** How many maintenance items the schedule shows before "See all". */
const SCHEDULE_ROWS = 4;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export interface CircleSummary {
  /** Null until the sharing settings have loaded. */
  isPrivate: boolean | null;
  requests: number;
}

interface Props {
  /** Their first name, for "Hello". Empty falls back to "Hello there". */
  firstName: string;
  profile: BeautyData;
  stats: BeautyProfileStats;
  maintenance: MaintenanceState;
  circle: CircleSummary;
  onBack: () => void;
  /** Opens one category's editor, ready to answer. */
  onEditCategory: (key: CategoryKey) => void;
  /** Every category, including the ones without a card (personalisation, consent). */
  onOpenAllProfile: () => void;
  onOpenMaintenance: () => void;
  onOpenSetup: () => void;
  onOpenCircle: () => void;
  onBook: (item: MaintenanceItem) => void;
  busyItemId: string | null;
  /** What's still to do (beautyProfileTodo): the same list behind the red "!" on the Settings row. */
  todo: BeautyTodoItem[];
  onOpenTodoField: (field: BeautyTodoField) => void;
  onOpenAccountDetails: () => void;
  /** Opens Search for one of the "Suited to you" ideas. */
  onFindIdea: (idea: SuitedIdea) => void;
}

/** The date column of a schedule row: "DUE / NOW" for anything that needs
 *  them, otherwise the due date as month over day. */
function dateStub({ item, view }: PresentedItem): { top: string; big: string } {
  if (needsAttention(view.state)) return { top: 'DUE', big: view.state === 'due_soon' ? 'SOON' : 'NOW' };
  if (!item.dueOn) return { top: '', big: '–' };
  const date = toLocalDate(item.dueOn);
  return { top: MONTHS[date.getMonth()] ?? '', big: String(date.getDate()) };
}

export function BeautyProfileLanding({
  firstName, profile, stats, maintenance, circle, onBack, onEditCategory, onOpenAllProfile,
  onOpenMaintenance, onOpenSetup, onOpenCircle, onBook, busyItemId, todo, onOpenTodoField,
  onOpenAccountDetails, onFindIdea,
}: Props) {
  const { theme, isDarkMode, palette: P } = useTheme();
  const C = isDarkMode ? D : L;
  const S = semanticColors(isDarkMode);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const go = (fn: () => void) => () => { hapticLight(); fn(); };

  const labels = useMemo<HighlightLabels>(() => ({
    scalp: (condition) => t('beautyProfile.card.scalp', { condition }),
    medicalNote: t('beautyProfile.card.medicalNote'),
    photosOn: t('beautyProfile.photosOn'),
    photosOff: t('beautyProfile.photosOff'),
  }), [t]);
  const card = (key: CategoryKey) => highlightCategory(key, profile, labels);
  const look = card('general');
  const hair = card('hair');
  const skin = card('skin');
  const lashes = card('lashesBrows');
  const nails = card('nails');
  const makeup = card('makeup');

  // ── Health & Safety (same wording as before) ──────────────────────────────
  const health = stats.byCategory.health;
  const allergies = profile.allergies;
  const healthLine = !health.started
    ? t('beautyProfile.card.addHealth')
    : allergies.length === 1 && allergies[0] === 'None known'
      ? t('beautyProfile.card.noAllergies')
      : allergies.length > 0
        ? t(allergies.length === 1 ? 'beautyProfile.card.allergiesOne' : 'beautyProfile.card.allergies', { count: allergies.length })
        : t('beautyProfile.card.medicalOnly');

  // ── Maintenance schedule ──────────────────────────────────────────────────
  const today = dateToYMD(new Date());
  const groups = useMemo(
    () => groupMaintenanceItems(
      maintenance.items.filter((i) => i.kind !== 'event' || (i.eventOn ?? today) >= today),
      today,
      maintenance.coverage,
    ),
    [maintenance.items, maintenance.coverage, today],
  );
  const scheduled = [...groups.needsAttention, ...groups.comingUp];
  const rows = scheduled.slice(0, SCHEDULE_ROWS);
  const upToDate = scheduled.filter((p) => !needsAttention(p.view.state)).length;
  const firstRun = !maintenance.loading && !maintenance.error
    && maintenance.items.length === 0 && !maintenance.settings?.setupCompletedAt;

  const todoFields = todo.filter((i): i is BeautyTodoField => i !== 'dob');
  const todoNames = todoFields.map((f) => t(TODO_LABEL[f])).join(', ');
  const ideas = useMemo(() => allSuitedIdeas(profile, 2).slice(0, 4), [profile]);

  const percent = Math.max(0, Math.min(100, Math.round(stats.overallPercent)));
  const RING = 104;
  const STROKE = 9;
  const radius = (RING - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;

  /** A card's headline, or "+ Add" in the accent when it's empty. */
  const headline = (lead: string | null, style: object, colour: string, addColour: string) => (
    <Text style={[styles.cardLead, style, { color: lead ? colour : addColour }]} numberOfLines={2}>
      {(lead ?? `+ ${t('beautyProfile.card.add')}`).toUpperCase()}
    </Text>
  );

  return (
    <ThemedBackground style={styles.bg}>
      <FocusAwareStatusBar barStyle={theme.statusBar} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <TouchableOpacity
            style={[styles.circ, { backgroundColor: C.card }]}
            onPress={go(onBack)}
            activeOpacity={0.5}
            accessibilityRole="button"
            accessibilityLabel={t('maintenance.back')}
          >
            <Ionicons name="chevron-back" size={18} color={C.ink} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.circ, { backgroundColor: C.card }]}
            onPress={go(onOpenCircle)}
            activeOpacity={0.5}
            accessibilityRole="button"
            accessibilityLabel={circle.requests > 0
              ? `${t('beautyProfile.circle.title')}, ${circle.requests === 1 ? t('beautyProfile.circle.requestsOne') : t('beautyProfile.circle.requests', { count: circle.requests })}`
              : t('beautyProfile.circle.title')}
          >
            <Ionicons name={circle.isPrivate ? 'lock-closed-outline' : 'people-outline'} size={17} color={C.ink} />
            {circle.requests > 0 ? <View style={[styles.reqDot, { backgroundColor: S.bad, borderColor: C.card }]} /> : null}
          </TouchableOpacity>
        </View>

        <View style={styles.helloRow} accessible accessibilityRole="header">
          <Text style={[styles.hello, { color: C.ink }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
            {t('beautyProfile.hello.title', { name: firstName.trim() || t('beautyProfile.hello.there') }).toUpperCase()}
          </Text>
          <Ionicons name="sparkles" size={26} color={C.deep} style={styles.sparkle} />
        </View>

        {/* Your look, and how complete the profile is. */}
        <View style={[styles.lookCard, { backgroundColor: C.card }]}>
          <TouchableOpacity style={styles.lookText} onPress={go(() => onEditCategory('general'))} activeOpacity={0.6} accessibilityRole="button">
            <Text style={[styles.cap, { color: C.soft }]}>{t('beautyProfile.hello.look').toUpperCase()}</Text>
            {headline(look.lead, styles.lookLead, C.ink, C.deep)}
            <Text style={[styles.small, { color: C.soft }]}>{t('beautyProfile.hello.lookSub')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={go(onOpenAllProfile)}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={t('beautyProfile.hello.ringA11y', { percent })}
          >
            <View style={{ width: RING, height: RING }}>
              <Svg width={RING} height={RING}>
                <Circle cx={RING / 2} cy={RING / 2} r={radius} stroke={C.track} strokeWidth={STROKE} fill="none" />
                <Circle
                  cx={RING / 2}
                  cy={RING / 2}
                  r={radius}
                  stroke={C.deep}
                  strokeWidth={STROKE}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${(circumference * percent) / 100} ${circumference}`}
                  transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
                />
              </Svg>
              <View style={styles.ringCentre} pointerEvents="none">
                <Text style={[styles.ringNumber, { color: C.ink }]}>{percent}%</Text>
                <Text style={[styles.cap, styles.ringCap, { color: C.soft }]}>{t('beautyProfile.hello.complete').toUpperCase()}</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHead}>
          <Text style={[styles.h2, { color: C.ink }]} accessibilityRole="header">{t('profile.forYou.beauty.title').toUpperCase()}</Text>
          <TouchableOpacity onPress={go(onOpenAllProfile)} hitSlop={10} accessibilityRole="button">
            <Text style={[styles.small, { color: C.soft }]}>{t('beautyProfile.hello.seeAll')}</Text>
          </TouchableOpacity>
        </View>

        {/* The mosaic: tall Hair beside Skin over Lashes & brows. */}
        <View style={styles.mosaicRow}>
          <TouchableOpacity
            style={[styles.tile, styles.hairTile, { backgroundColor: C.dark }]}
            onPress={go(() => onEditCategory('hair'))}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${t('beautyProfile.hello.hair')}, ${hair.lead ?? t('beautyProfile.card.add')}`}
          >
            <View style={[styles.disc, { backgroundColor: C.darkDisc }]}>
              <Ionicons name="cut-outline" size={17} color={C.darkInk} />
            </View>
            <Text style={[styles.cap, { color: C.darkSoft }]}>{t('beautyProfile.hello.hair').toUpperCase()}</Text>
            {headline(hair.lead, styles.leadBig, C.darkInk, C.darkSoft)}
            <View style={styles.hairDetails}>
              {hair.details.slice(0, 3).map((detail) => (
                <Text key={detail} style={[styles.small, { color: C.darkInk }]} numberOfLines={1}>{detail}</Text>
              ))}
            </View>
          </TouchableOpacity>
          <View style={styles.column}>
            <TouchableOpacity
              style={[styles.tile, styles.flexTile, { backgroundColor: C.tint }]}
              onPress={go(() => onEditCategory('skin'))}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`${t('beautyProfile.hello.skin')}, ${skin.lead ?? t('beautyProfile.card.add')}`}
            >
              <Ionicons name="water-outline" size={19} color={C.ink} />
              <Text style={[styles.cap, { color: C.soft2 }]}>{t('beautyProfile.hello.skin').toUpperCase()}</Text>
              {headline(skin.lead, styles.leadMid, C.ink, C.deep)}
              {skin.details.length > 0 ? (
                <Text style={[styles.tiny, { color: C.soft2 }]} numberOfLines={2}>{skin.details.slice(0, 2).join(' · ')}</Text>
              ) : null}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tile, styles.flexTile, { backgroundColor: C.warm }]}
              onPress={go(() => onEditCategory('lashesBrows'))}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`${t('beautyProfile.hello.lashes')}, ${lashes.lead ?? t('beautyProfile.card.add')}`}
            >
              <Ionicons name="eye-outline" size={19} color={C.ink} />
              <Text style={[styles.cap, { color: C.soft2 }]}>{t('beautyProfile.hello.lashes').toUpperCase()}</Text>
              {headline(lashes.lead, styles.leadMid, C.ink, C.deep)}
              {lashes.details.length > 0 ? (
                <Text style={[styles.tiny, { color: C.soft2 }]} numberOfLines={2}>{lashes.details.slice(0, 2).join(' · ')}</Text>
              ) : null}
            </TouchableOpacity>
          </View>
        </View>

        {/* Nails, wide. */}
        <TouchableOpacity
          style={[styles.tile, styles.nailsTile, { backgroundColor: C.card }]}
          onPress={go(() => onEditCategory('nails'))}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${t('beautyProfile.hello.nails')}, ${nails.lead ?? t('beautyProfile.card.add')}`}
        >
          <View style={styles.nailBars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {[26, 34, 38, 32].map((h, i) => (
              <View key={i} style={[styles.nailBar, { height: h, backgroundColor: C.deep }]} />
            ))}
          </View>
          <View style={styles.flex}>
            <Text style={[styles.cap, { color: C.soft }]}>{t('beautyProfile.hello.nails').toUpperCase()}</Text>
            {headline(nails.lead && nails.details[0] ? `${nails.lead} · ${nails.details[0]}` : nails.lead, styles.leadMid, C.ink, C.deep)}
          </View>
        </TouchableOpacity>

        {/* Makeup beside Health & Safety. */}
        <View style={styles.mosaicRow}>
          <TouchableOpacity
            style={[styles.tile, styles.flexTile, { backgroundColor: C.card }]}
            onPress={go(() => onEditCategory('makeup'))}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${t('beautyProfile.hello.makeup')}, ${makeup.lead ?? t('beautyProfile.card.add')}`}
          >
            <Ionicons name="color-palette-outline" size={19} color={C.ink} />
            <Text style={[styles.cap, { color: C.soft }]}>{t('beautyProfile.hello.makeup').toUpperCase()}</Text>
            {headline(makeup.lead, styles.leadMid, C.ink, C.deep)}
            {makeup.details.length > 0 ? (
              <Text style={[styles.tiny, { color: C.soft }]} numberOfLines={2}>{makeup.details.slice(0, 2).join(' · ')}</Text>
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tile,
              styles.flexTile,
              health.started ? { backgroundColor: C.card } : [styles.dashed, { borderColor: C.deep }],
            ]}
            onPress={go(() => onEditCategory('health'))}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${t('beautyProfile.health.title')}, ${health.started ? healthLine : t('beautyProfile.hello.finish')}`}
          >
            <Ionicons name="shield-checkmark-outline" size={19} color={health.started ? C.ink : C.deep} />
            <Text style={[styles.cap, { color: C.soft }]}>{t('beautyProfile.health.title').toUpperCase()}</Text>
            <Text style={[styles.cardLead, styles.leadSmall, { color: C.ink }]} numberOfLines={2}>
              {(health.started ? healthLine : t('beautyProfile.hello.finish')).toUpperCase()}
            </Text>
            <Text style={[styles.tiny, { color: C.soft }]} numberOfLines={2}>{t('beautyProfile.hello.healthPrivate')}</Text>
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
            <View style={styles.flex}>
              <Text style={[styles.nudgeTitle, { color: P.text }]}>{t('beautyProfile.todo.title').toUpperCase()}</Text>
              <Text style={[styles.small, { color: P.sub }]}>{todoNames}</Text>
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
            <View style={styles.flex}>
              <Text style={[styles.nudgeTitle, { color: P.text }]}>{t('beautyProfile.todo.dob.title').toUpperCase()}</Text>
              <Text style={[styles.small, { color: P.sub }]}>{t('beautyProfile.todo.dob.sub')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={P.sub} />
          </TouchableOpacity>
        )}

        {/* Maintenance schedule. */}
        <View style={styles.scheduleHead}>
          <Text style={[styles.h1, { color: C.ink }]} accessibilityRole="header">
            {t('beautyProfile.hello.schedule').toUpperCase()}
          </Text>
          {scheduled.length > 0 ? (
            <Text style={[styles.small, { color: C.soft }]}>
              {t('beautyProfile.hello.scheduleSub', { done: upToDate, total: scheduled.length })}
            </Text>
          ) : null}
        </View>
        <View style={[styles.scheduleCard, { backgroundColor: C.card }]}>
          {maintenance.loading && maintenance.items.length === 0 ? (
            <ActivityIndicator style={styles.scheduleMessage} color={C.soft} />
          ) : maintenance.error ? (
            <TouchableOpacity style={styles.scheduleMessage} onPress={go(() => { void maintenance.reload(); })} accessibilityRole="button">
              <Text style={[styles.small, { color: C.deep }]}>{t('maintenance.tryAgain')}</Text>
            </TouchableOpacity>
          ) : rows.length === 0 ? (
            <TouchableOpacity
              style={styles.scheduleMessage}
              onPress={go(firstRun ? onOpenSetup : onOpenMaintenance)}
              activeOpacity={0.6}
              accessibilityRole="button"
            >
              <Text style={[styles.rowName, { color: C.ink }]}>
                {t(firstRun ? 'beautyProfile.hello.scheduleEmpty' : 'beautyProfile.hello.scheduleClear')}
              </Text>
              <Text style={[styles.small, { color: C.deep }]}>
                {t(firstRun ? 'maintenance.strip.setUp' : 'beautyProfile.hello.scheduleOpen')} ›
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              {rows.map((presented, index) => {
                const { item, view } = presented;
                const stub = dateStub(presented);
                const due = needsAttention(view.state);
                const booked = view.state === 'booked';
                const dot = due ? S.bad : booked ? C.deep : C.future;
                const note = booked
                  ? t('beautyProfile.hello.booked', { provider: item.providerName ?? t('maintenance.rebook.yourProvider') })
                  : item.repeatWeeks
                    ? t('beautyProfile.hello.every', { weeks: item.repeatWeeks })
                    : '';
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.row}
                    onPress={go(onOpenMaintenance)}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel={[item.title, due ? t('beautyProfile.hello.dueA11y') : `${stub.top} ${stub.big}`, note].filter(Boolean).join(', ')}
                  >
                    <View style={styles.dateCol}>
                      <Text style={[styles.cap, styles.dateTop, { color: C.soft }]}>{stub.top}</Text>
                      <Text style={[styles.dateBig, { color: C.ink }]}>{stub.big}</Text>
                    </View>
                    <View style={styles.rail}>
                      <View
                        style={[
                          styles.railLine,
                          { backgroundColor: C.track },
                          index === 0 && styles.railLineFirst,
                          index === rows.length - 1 && styles.railLineLast,
                        ]}
                      />
                      <View style={[styles.railDot, { backgroundColor: dot, borderColor: C.card }]} />
                    </View>
                    <View style={styles.rowBody}>
                      <View style={styles.flex}>
                        <Text style={[styles.rowName, { color: C.ink }]} numberOfLines={1}>{item.title}</Text>
                        {note ? <Text style={[styles.small, { color: C.soft }]} numberOfLines={1}>{note}</Text> : null}
                      </View>
                      {due ? (
                        <TouchableOpacity
                          style={[styles.bookBtn, { backgroundColor: C.btn }]}
                          onPress={go(() => onBook(item))}
                          disabled={busyItemId === item.id}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel={`${t('beautyProfile.hello.book')} ${item.title}`}
                        >
                          {busyItemId === item.id ? (
                            <ActivityIndicator size="small" color={C.btnInk} />
                          ) : (
                            <Text style={[styles.bookText, { color: C.btnInk }]}>{t('beautyProfile.hello.book')}</Text>
                          )}
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity style={styles.seeAll} onPress={go(onOpenMaintenance)} hitSlop={8} accessibilityRole="button">
                <Text style={[styles.small, { color: C.deep }]}>{t('beautyProfile.hello.scheduleOpen')} ›</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {ideas.length > 0 && (
          <View style={[styles.suited, { backgroundColor: C.card }]}>
            <View style={styles.suitedHead}>
              <Ionicons name="sparkles-outline" size={14} color={C.deep} />
              <Text style={[styles.cap, { color: C.soft }]}>{t('beautyProfile.suited.title').toUpperCase()}</Text>
            </View>
            <Text style={[styles.small, { color: C.soft }]}>{t('beautyProfile.suited.sub')}</Text>
            {ideas.map((idea) => (
              <TouchableOpacity
                key={`${idea.category}-${idea.label}`}
                style={[styles.ideaRow, { borderTopColor: C.track }]}
                onPress={go(() => onFindIdea(idea))}
                activeOpacity={0.5}
                accessibilityRole="button"
                accessibilityLabel={`${idea.label}, ${idea.because}. ${t('beautyProfile.suited.find')}`}
              >
                <View style={styles.flex}>
                  <Text style={[styles.ideaLabel, { color: C.ink }]}>{idea.label}</Text>
                  <Text style={[styles.tiny, { color: C.soft }]} numberOfLines={1}>{idea.because}</Text>
                </View>
                <Text style={[styles.cap, { color: C.deep }]}>{t('beautyProfile.suited.find').toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  scroll: { paddingHorizontal: 14, gap: 10 },
  flex: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  circ: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  reqDot: { position: 'absolute', top: 6, right: 6, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },

  helloRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 6, marginTop: 4 },
  hello: { fontFamily: FONT_DISPLAY, fontSize: 46, lineHeight: 50, flexShrink: 1 },
  sparkle: { marginLeft: 6, marginBottom: 10 },

  cap: { fontFamily: FONT_DISPLAY, fontSize: 9.5, letterSpacing: 1.8 },
  small: { fontFamily: FONT_BODY, fontSize: 12.5, lineHeight: 17 },
  tiny: { fontFamily: FONT_BODY, fontSize: 11.5, lineHeight: 15 },
  h1: { fontFamily: FONT_DISPLAY, fontSize: 36, lineHeight: 40 },
  h2: { fontFamily: FONT_DISPLAY, fontSize: 20, letterSpacing: 0.3 },

  lookCard: { borderRadius: 28, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  lookText: { flex: 1, gap: 7 },
  lookLead: { fontSize: 26, lineHeight: 30 },
  ringCentre: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  ringNumber: { fontFamily: FONT_DISPLAY, fontSize: 24 },
  ringCap: { fontSize: 8, marginTop: 2 },

  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 6, paddingTop: 10 },

  mosaicRow: { flexDirection: 'row', gap: 10 },
  column: { flex: 1, gap: 10 },
  tile: { borderRadius: 26, padding: 14, gap: 4 },
  flexTile: { flex: 1 },
  hairTile: { flex: 1, minHeight: 280, padding: 16, gap: 8 },
  disc: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  hairDetails: { marginTop: 'auto', gap: 5 },
  cardLead: { fontFamily: FONT_DISPLAY },
  leadBig: { fontSize: 28, lineHeight: 31 },
  leadMid: { fontSize: 17, lineHeight: 21 },
  leadSmall: { fontSize: 15, lineHeight: 19 },
  nailsTile: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16 },
  nailBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  nailBar: { width: 13, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  dashed: { borderWidth: 1.5, borderStyle: 'dashed' },

  nudge: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18 },
  nudgeTitle: { fontFamily: FONT_DISPLAY, fontSize: 12, letterSpacing: 1 },

  scheduleHead: { paddingHorizontal: 6, paddingTop: 18, gap: 6 },
  scheduleCard: { borderRadius: 28, paddingVertical: 8, paddingHorizontal: 16 },
  scheduleMessage: { paddingVertical: 18, gap: 4, alignItems: 'flex-start' },
  row: { flexDirection: 'row', gap: 12, alignItems: 'stretch', minHeight: 64 },
  dateCol: { width: 46, paddingVertical: 12, alignItems: 'center' },
  dateTop: { fontSize: 8.5 },
  dateBig: { fontFamily: FONT_DISPLAY, fontSize: 19, lineHeight: 23 },
  rail: { width: 12, alignItems: 'center' },
  railLine: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  railLineFirst: { top: 26 },
  railLineLast: { bottom: '60%' },
  railDot: { marginTop: 20, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  rowName: { fontFamily: FONT_BODY, fontSize: 15, fontWeight: '700' },
  bookBtn: { minHeight: 36, minWidth: 64, paddingHorizontal: 14, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  bookText: { fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: '700' },
  seeAll: { alignSelf: 'flex-end', paddingVertical: 10 },

  suited: { borderRadius: 26, padding: 16, gap: 6, marginTop: 6 },
  suitedHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ideaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 11 },
  ideaLabel: { fontFamily: FONT_DISPLAY, fontSize: 13.5, letterSpacing: 0.4 },
});
