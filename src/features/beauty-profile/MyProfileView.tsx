// src/features/beauty-profile/MyProfileView.tsx
//
// "My Profile" inside Beauty Profile: one quiet completeness line, a Health &
// Safety row, and a two-column mosaic of tiles, each led by the client's own
// headline answer (Beauty Card layout, 2026-10-18). Tapping a tile swaps to that
// category (selectedCategory — screen state owned by BeautyProfileScreen, so
// SAVE PROFILE stays one transaction). Every number comes from
// computeBeautyProfileStats; its three counting rules are unchanged.

import React, { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from '../../i18n';
import { ThemedBackground } from '../../components/ThemedBackground';
import type { BeautyData, CategoryKey } from '../../types/beautyProfile';
import {
  CATEGORY_LABELS, CATEGORY_ORDER, type BeautyProfileStats,
} from '../../utils/beautyProfileStats';
import { ALLERGENS } from './options';
import { semanticColors } from '../maintenance/ui';
import { CategoryEditor } from './CategoryEditor';
import { highlightCategory, leadingCategory, type CategoryHighlight, type HighlightLabels } from './highlights';

/** Categories whose answers the maintenance suggestions read
 *  (src/utils/maintenanceSuggestions.ts). Skin feeds only via skin TYPE. */
export const FEEDS_MAINTENANCE: ReadonlySet<CategoryKey> = new Set(['hair', 'skin', 'nails', 'lashesBrows']);

const SUCCESS = '#34C759';

interface Props {
  draft: BeautyData;
  setDraft: React.Dispatch<React.SetStateAction<BeautyData>>;
  stats: BeautyProfileStats;
  editing: boolean;
  saving: boolean;
  selectedCategory: CategoryKey | null;
  onBack: () => void;
  onOpenCategory: (key: CategoryKey) => void;
  onCloseCategory: () => void;
  onToggleEdit: () => void;
  onSave: () => void;
}

export function MyProfileView({
  draft, setDraft, stats, editing, saving, selectedCategory,
  onBack, onOpenCategory, onCloseCategory, onToggleEdit, onSave,
}: Props) {
  const { theme, isDarkMode, palette: P } = useTheme();
  const S = semanticColors(isDarkMode);
  const tapLight = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const labels = useMemo<HighlightLabels>(() => ({
    scalp: condition => t('beautyProfile.card.scalp', { condition }),
    medicalNote: t('beautyProfile.card.medicalNote'),
    photosOn: t('beautyProfile.photosOn'),
    photosOff: t('beautyProfile.photosOff'),
  }), [t]);

  const editToggle = (
    <TouchableOpacity onPress={() => { tapLight(); onToggleEdit(); }} activeOpacity={0.5} accessibilityRole="button">
      <Text style={[styles.editToggle, { color: P.accentText }]}>
        {editing ? t('beautyProfile.cancel') : t('beautyProfile.edit')}
      </Text>
    </TouchableOpacity>
  );

  const saveButton = editing && (
    <TouchableOpacity
      style={[styles.saveBtn, { backgroundColor: P.accent, borderColor: P.accent }]}
      onPress={onSave /* fires its own Medium haptic */}
      disabled={saving}
      activeOpacity={0.75}
      accessibilityRole="button"
    >
      {saving
        ? <ActivityIndicator color={P.onAccent} />
        : <Text style={[styles.saveBtnText, { color: P.onAccent }]}>{t('beautyProfile.save').toUpperCase()}</Text>}
    </TouchableOpacity>
  );

  const scrollStyle = [styles.scroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 100 }];

  // ── Focused single category ──────────────────────────────────────────────
  if (selectedCategory) {
    const cat = stats.byCategory[selectedCategory];
    const isHealth = selectedCategory === 'health';
    return (
      <ThemedBackground style={styles.bg}>
        <StatusBar barStyle={theme.statusBar} />
        <ScrollView contentContainerStyle={scrollStyle} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={onCloseCategory} activeOpacity={0.5} accessibilityRole="button">
              <Text style={[styles.focusBack, { color: P.accentText }]}>← {t('beautyProfile.allCategories').toUpperCase()}</Text>
            </TouchableOpacity>
            {editToggle}
          </View>
          <View style={styles.focusTitleRow}>
            <Text style={[styles.focusTitle, { color: P.text }]}>{CATEGORY_LABELS[selectedCategory]}</Text>
            <Text style={[styles.focusPct, { color: P.accentText }]}>{cat.complete ? '✓' : `${cat.percent}%`}</Text>
          </View>
          <View style={[styles.track, { backgroundColor: P.sep }]}>
            <View style={[styles.fill, { width: `${cat.percent}%`, backgroundColor: cat.complete ? SUCCESS : P.accent }]} />
          </View>
          <Text style={[styles.focusFieldsCount, { color: P.sub }]}>
            {isHealth
              ? `${draft.allergies.length} of ${ALLERGENS.length} allergens flagged · ${draft.medicalNotes ? 'medical notes on file' : 'no medical notes'} · always shared`
              : cat.fieldsTotal > 0
                ? `${cat.fieldsSet} of ${cat.fieldsTotal} fields set · ${cat.selections} selection${cat.selections === 1 ? '' : 's'}`
                : 'Always shared with your provider'}
          </Text>
          <CategoryEditor category={selectedCategory} draft={draft} editing={editing} setDraft={setDraft} P={P} />
          {saveButton}
        </ScrollView>
      </ThemedBackground>
    );
  }

  // ── Tile view ────────────────────────────────────────────────────────────
  const health = stats.byCategory.health;
  const lead = leadingCategory(stats, CATEGORY_ORDER);
  const tiles = CATEGORY_ORDER.filter(k => k !== 'health').map(k => highlightCategory(k, draft, labels));

  // Two columns, each tile placed in whichever is shorter so far. Weights are
  // a rough height estimate: the filled lead tile is tallest, an unstarted
  // tile is just a label and "+ Add".
  const weight = (h: CategoryHighlight) =>
    h.key === lead ? 3 : h.lead === null ? 1 : h.details.length > 0 ? 2 : 1.5;
  const columns: [CategoryHighlight[], CategoryHighlight[]] = [[], []];
  const heights: [number, number] = [0, 0];
  for (const h of tiles) {
    const col = heights[0] <= heights[1] ? 0 : 1;
    columns[col].push(h);
    heights[col] += weight(h);
  }

  const renderTile = (h: CategoryHighlight) => {
    const c = stats.byCategory[h.key];
    const strong = h.key === lead;
    const empty = h.lead === null;
    const fg = strong ? P.onAccent : P.text;
    const soft = strong ? { color: P.onAccent, opacity: 0.72 } : { color: P.sub };
    const count = h.key === 'consent' ? '' : c.complete ? '✓' : c.started ? `${c.fieldsSet}/${c.fieldsTotal}` : '';
    return (
      <TouchableOpacity
        key={h.key}
        style={[
          styles.tile,
          strong ? { backgroundColor: P.accent }
            : empty ? [styles.tileEmpty, { borderColor: P.border }]
            : { backgroundColor: P.accentDim },
        ]}
        onPress={() => onOpenCategory(h.key)}
        activeOpacity={0.5}
        accessibilityRole="button"
        accessibilityLabel={`${CATEGORY_LABELS[h.key]}, ${h.lead ?? t('beautyProfile.notStarted')}`}
      >
        <View style={styles.tileHead}>
          <View style={styles.tileLabelRow}>
            <Text style={[styles.tileLabel, soft]} numberOfLines={2}>{CATEGORY_LABELS[h.key]}</Text>
            {FEEDS_MAINTENANCE.has(h.key) && <Ionicons name="sync" size={10} color={strong ? P.onAccent : P.accentText} />}
          </View>
          {count ? <Text style={[styles.tileLabel, soft]}>{count}</Text> : null}
        </View>
        {empty ? (
          <Text style={[styles.tileAdd, { color: P.accentText }]}>+ {t('beautyProfile.card.add').toUpperCase()}</Text>
        ) : (
          <>
            <Text style={[styles.tileValue, { color: fg }, h.lead!.length > 9 && styles.tileValueSm]} numberOfLines={2}>
              {h.lead!.toUpperCase()}
            </Text>
            {h.details.length > 0 && (
              <Text style={[styles.tileDetail, soft]} numberOfLines={3}>{h.details.join(' · ')}</Text>
            )}
          </>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <ThemedBackground style={styles.bg}>
      <StatusBar barStyle={theme.statusBar} />
      <ScrollView contentContainerStyle={scrollStyle} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              style={[styles.circ, { backgroundColor: P.card, borderColor: P.border }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onBack(); }}
              activeOpacity={0.5}
              accessibilityRole="button"
              accessibilityLabel={t('maintenance.back')}
            >
              <Ionicons name="chevron-back" size={18} color={P.accentText} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: P.text }]}>{t('beautyProfile.myProfile')}</Text>
          </View>
          {editToggle}
        </View>

        <View style={styles.completeRow}>
          <Text style={[styles.completeText, { color: P.text }]}>
            {stats.isEmpty ? 'NEW' : t('beautyProfile.percentComplete', { percent: stats.overallPercent })}
          </Text>
          <Text style={[styles.completeSub, { color: P.sub }]}>
            {stats.isEmpty
              ? t('beautyProfile.startAny')
              : t('beautyProfile.sectionsStarted', { started: stats.categoriesStarted, total: stats.categoriesTotal })}
          </Text>
        </View>
        <View style={[styles.track, { backgroundColor: P.sep, height: 7, marginBottom: 14 }]}>
          <View style={[styles.fill, { width: `${stats.overallPercent}%`, backgroundColor: P.accentText }]} />
        </View>

        <TouchableOpacity
          style={[styles.hs, { borderColor: P.border, backgroundColor: health.started ? S.okDim : S.warnDim }]}
          onPress={() => onOpenCategory('health') /* openCategory fires the haptic */}
          activeOpacity={0.5}
          accessibilityRole="button"
        >
          <Ionicons name="shield-checkmark-outline" size={22} color={health.started ? S.ok : S.warn} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.hsTitle, { color: P.text }]}>{CATEGORY_LABELS.health}</Text>
            <Text style={[styles.hsSub, { color: P.sub }]} numberOfLines={2}>
              {health.started
                ? t('beautyProfile.health.onFile', { count: draft.allergies.length })
                : t('beautyProfile.health.notStarted')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={P.sub} />
        </TouchableOpacity>

        <View style={styles.mosaic}>
          <View style={styles.mosaicCol}>{columns[0].map(renderTile)}</View>
          <View style={styles.mosaicCol}>{columns[1].map(renderTile)}</View>
        </View>

        <View style={styles.legend}>
          <Ionicons name="sync" size={11} color={P.accentText} />
          <Text style={[styles.legendText, { color: P.sub }]}>{t('beautyProfile.feedsLegend')}</Text>
        </View>

        {saveButton}
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  scroll: { paddingHorizontal: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  circ: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 24, letterSpacing: 1 },
  editToggle: { fontFamily: 'BakbakOne-Regular', fontSize: 14, letterSpacing: 0.5 },
  focusBack: { fontFamily: 'BakbakOne-Regular', fontSize: 13, letterSpacing: 0.5 },

  completeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  completeText: { fontFamily: 'BakbakOne-Regular', fontSize: 22, letterSpacing: 1 },
  completeSub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13 },
  track: { height: 4, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },

  hs: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 14 },
  hsTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 12, letterSpacing: 1 },
  hsSub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, lineHeight: 16, marginTop: 2 },

  mosaic: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  mosaicCol: { flex: 1, gap: 10 },
  tile: { borderRadius: 18, padding: 14, gap: 6 },
  tileEmpty: { borderWidth: 1.5, borderStyle: 'dashed' },
  tileHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 },
  tileLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  tileLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 10, letterSpacing: 1.4 },
  tileValue: { fontFamily: 'BakbakOne-Regular', fontSize: 22, lineHeight: 25 },
  tileValueSm: { fontSize: 16, lineHeight: 19 },
  tileDetail: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, lineHeight: 16 },
  tileAdd: { fontFamily: 'BakbakOne-Regular', fontSize: 12, letterSpacing: 1 },

  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  legendText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 11.5 },

  focusTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 10, marginBottom: 6 },
  focusTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 30, letterSpacing: -0.5, lineHeight: 34 },
  focusPct: { fontFamily: 'BakbakOne-Regular', fontSize: 16 },
  focusFieldsCount: { fontFamily: 'Jura-VariableFont_wght', fontSize: 11, lineHeight: 16, marginTop: 6, marginBottom: 20 },

  saveBtn: { borderRadius: 100, paddingVertical: 15, alignItems: 'center', borderWidth: 1.5, marginTop: 4 },
  saveBtnText: { fontFamily: 'BakbakOne-Regular', fontSize: 14, letterSpacing: 1 },
});
