// src/features/beauty-profile/MyProfileView.tsx
//
// "My Profile" inside Beauty Profile: one quiet completeness line, a Health &
// Safety row, and 2-up tiles with a ring each. Tapping a tile swaps to that
// category (selectedCategory — screen state owned by BeautyProfileScreen, so
// SAVE PROFILE stays one transaction). Every number comes from
// computeBeautyProfileStats; its three counting rules are unchanged.

import React from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from '../../i18n';
import { ThemedBackground } from '../../components/ThemedBackground';
import type { AppTheme } from '../../constants/theme';
import type { BeautyData, CategoryKey } from '../../types/beautyProfile';
import {
  CATEGORY_LABELS, CATEGORY_ORDER, type BeautyProfileStats, type CategoryStats,
} from '../../utils/beautyProfileStats';
import { ALLERGENS } from './options';
import { CategoryEditor } from './CategoryEditor';

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

function Ring({ percent, label, P, size = 52 }: { percent: number; label: string; P: AppTheme; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={P.sep} strokeWidth={4} />
        <Circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={percent >= 100 ? SUCCESS : P.accentText}
          strokeWidth={4} strokeLinecap="round" strokeDasharray={`${c}`} strokeDashoffset={c * (1 - percent / 100)}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.ringLabelWrap]}>
        <Text style={[styles.ringLabel, { color: P.text }]}>{label}</Text>
      </View>
    </View>
  );
}

export function MyProfileView({
  draft, setDraft, stats, editing, saving, selectedCategory,
  onBack, onOpenCategory, onCloseCategory, onToggleEdit, onSave,
}: Props) {
  const { theme, palette: P } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const editToggle = (
    <TouchableOpacity onPress={onToggleEdit} activeOpacity={0.5} accessibilityRole="button">
      <Text style={[styles.editToggle, { color: P.accentText }]}>
        {editing ? t('beautyProfile.cancel') : t('beautyProfile.edit')}
      </Text>
    </TouchableOpacity>
  );

  const saveButton = editing && (
    <TouchableOpacity
      style={[styles.saveBtn, { backgroundColor: P.accent, borderColor: P.accent }]}
      onPress={onSave}
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
        <StatusBar barStyle={theme.statusBar} translucent />
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
  const tiles = CATEGORY_ORDER.filter(k => k !== 'health');

  const tileDetail = (c: CategoryStats): string => {
    if (c.key === 'consent') return t(draft.photographyConsent ? 'beautyProfile.photosOn' : 'beautyProfile.photosOff');
    return c.started
      ? t('beautyProfile.fieldsSet', { set: c.fieldsSet, total: c.fieldsTotal })
      : t('beautyProfile.notStarted');
  };

  return (
    <ThemedBackground style={styles.bg}>
      <StatusBar barStyle={theme.statusBar} translucent />
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
          style={[styles.hs, { borderColor: P.border, backgroundColor: health.started ? 'rgba(52,199,89,0.12)' : 'rgba(255,214,10,0.2)' }]}
          onPress={() => onOpenCategory('health')}
          activeOpacity={0.5}
          accessibilityRole="button"
        >
          <Ionicons name="shield-checkmark-outline" size={22} color={P.accentText} />
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

        <View style={styles.grid}>
          {tiles.map(key => {
            const c = stats.byCategory[key];
            return (
              <TouchableOpacity
                key={key}
                style={[styles.tile, { backgroundColor: P.card, borderColor: P.border }]}
                onPress={() => onOpenCategory(key)}
                activeOpacity={0.5}
                accessibilityRole="button"
                accessibilityLabel={`${CATEGORY_LABELS[key]}, ${tileDetail(c)}`}
              >
                {FEEDS_MAINTENANCE.has(key) && <View style={[styles.feeds, { backgroundColor: P.accentText }]} />}
                <Ring
                  P={P}
                  percent={key === 'consent' ? 100 : c.percent}
                  label={key === 'consent' ? '✓' : c.started ? `${c.percent}%` : 'NEW'}
                />
                <Text style={[styles.tileLabel, { color: P.text }]} numberOfLines={2}>{CATEGORY_LABELS[key]}</Text>
                <Text style={[styles.tileDetail, { color: P.sub }]} numberOfLines={1}>{tileDetail(c)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.legend}>
          <View style={[styles.legendDot, { backgroundColor: P.accentText }]} />
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

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  tile: {
    width: '48.5%', borderRadius: 16, borderWidth: 1, padding: 14, gap: 8,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  feeds: { position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4 },
  ringLabelWrap: { alignItems: 'center', justifyContent: 'center' },
  ringLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 11 },
  tileLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 1.1 },
  tileDetail: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12 },

  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 11.5 },

  focusTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 10, marginBottom: 6 },
  focusTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 30, letterSpacing: -0.5, lineHeight: 34 },
  focusPct: { fontFamily: 'BakbakOne-Regular', fontSize: 16 },
  focusFieldsCount: { fontFamily: 'Jura-VariableFont_wght', fontSize: 11, lineHeight: 16, marginTop: 6, marginBottom: 20 },

  saveBtn: { borderRadius: 100, paddingVertical: 15, alignItems: 'center', borderWidth: 1.5, marginTop: 4 },
  saveBtnText: { fontFamily: 'BakbakOne-Regular', fontSize: 14, letterSpacing: 1 },
});
