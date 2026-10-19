// src/features/maintenance/MaintenanceItemCard.tsx
//
// One maintenance item. A solid icon circle + "FROM BOOKING" marks an item a
// completed booking made; a dashed outline circle + "MINE" marks one the client
// added — the words repeat the icon so the difference never relies on shape
// alone.

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AppTheme } from '../../constants/theme';
import { getMaintenanceServiceType } from '../../constants/maintenanceServiceTypes';
import type { MaintenanceItem } from '../../types/maintenance';
import type { TranslationKey, TranslationParams } from '../../i18n';
import { formatShortDayDate } from '../../utils/dateUtils';
import type { ItemPresentation } from './presentation';
import {
  FONT_BODY, FONT_DISPLAY, GhostButton, Pill, PrimaryButton, ProgressBar,
  type PillTone, type SemanticColors, ui, hapticLight,
} from './ui';

type T = (key: TranslationKey, params?: TranslationParams) => string;

export type ItemAction = 'rebook' | 'find' | 'resume';

function iconFor(item: MaintenanceItem): keyof typeof Ionicons.glyphMap {
  if (item.kind === 'event') return 'flag-outline';
  if (item.kind === 'takedown') return 'cut-outline';
  switch (getMaintenanceServiceType(item.typeKey)?.searchCategory) {
    case 'NAILS': return 'diamond-outline';
    case 'LASHES': return 'sparkles-outline';
    case 'BROWS': return 'eye-outline';
    case 'AESTHETICS': return 'water-outline';
    case 'HAIR': return 'cut-outline';
    default: return 'calendar-outline';
  }
}

export function itemPill(item: MaintenanceItem, view: ItemPresentation, t: T): { text: string; tone: PillTone } {
  const d = view.daysUntilDue ?? 0;
  switch (view.state) {
    case 'paused': return { text: t('maintenance.pill.paused'), tone: 'mute' };
    case 'booked': return { text: t('maintenance.pill.booked'), tone: 'ok' };
    case 'unscheduled': return { text: t('maintenance.pill.noDate'), tone: 'mute' };
    case 'overdue':
      if (item.kind === 'event') return { text: t('maintenance.pill.bookNow'), tone: 'warn' };
      return { text: t(-d === 1 ? 'maintenance.pill.overdueOne' : 'maintenance.pill.overdue', { count: -d }), tone: 'bad' };
    case 'due_today':
      if (item.kind === 'event') return { text: t('maintenance.pill.bookNow'), tone: 'accent' };
      if (item.kind === 'takedown') return { text: t('maintenance.pill.takedown'), tone: 'warn' };
      return { text: t('maintenance.pill.dueToday'), tone: 'accent' };
    case 'due_soon':
      if (item.kind === 'takedown') return { text: t('maintenance.pill.takedown'), tone: 'warn' };
      return { text: t(d === 1 ? 'maintenance.pill.dueTomorrow' : 'maintenance.pill.dueIn', { count: d }), tone: 'accent' };
    case 'on_track':
      return d < 14
        ? { text: t('maintenance.pill.inDays', { count: d }), tone: 'mute' }
        : { text: t('maintenance.pill.inWeeks', { count: Math.round(d / 7) }), tone: 'mute' };
  }
}

function subline(item: MaintenanceItem, t: T): string {
  const who = item.providerName ?? t('maintenance.item.noProvider');
  if (item.kind === 'event' && item.eventOn && item.dueOn) {
    return t('maintenance.item.eventSub', { date: formatShortDayDate(item.eventOn), bookBy: formatShortDayDate(item.dueOn) });
  }
  if (item.kind === 'takedown' && item.dueOn) {
    return t('maintenance.item.takedownSub', { date: formatShortDayDate(item.dueOn) });
  }
  if (item.repeatWeeks) {
    return t(item.repeatWeeks === 1 ? 'maintenance.item.everyWeek' : 'maintenance.item.everyWeeks', { who, count: item.repeatWeeks });
  }
  return t('maintenance.item.onDate', { who, date: item.dueOn ? formatShortDayDate(item.dueOn) : '—' });
}

export function primaryActionFor(item: MaintenanceItem, view: ItemPresentation): ItemAction | null {
  if (view.state === 'paused') return 'resume';
  if (view.state === 'booked') return null;
  if (item.kind === 'service' && item.providerId) return 'rebook';
  return 'find';
}

interface Props {
  item: MaintenanceItem;
  view: ItemPresentation;
  P: AppTheme;
  S: SemanticColors;
  t: T;
  highlighted?: boolean;
  busy?: boolean;
  onAction: (item: MaintenanceItem, action: ItemAction) => void;
  onMenu: (item: MaintenanceItem) => void;
}

function MaintenanceItemCardImpl({ item, view, P, S, t, highlighted, busy, onAction, onMenu }: Props) {
  const pill = itemPill(item, view, t);
  const action = primaryActionFor(item, view);
  const fromBooking = item.origin === 'booking';
  const overdue = view.state === 'overdue' && item.kind !== 'event';

  return (
    <View
      style={[
        ui.card, styles.card,
        { backgroundColor: P.card, borderColor: highlighted ? P.accent : P.border, opacity: view.state === 'paused' ? 0.62 : 1 },
      ]}
    >
      <View style={styles.top}>
        <View
          style={[
            styles.ico,
            fromBooking
              ? { backgroundColor: P.accentDim }
              : { borderWidth: 1.5, borderStyle: 'dashed', borderColor: P.accentText },
          ]}
        >
          <Ionicons name={iconFor(item)} size={18} color={P.accentText} />
        </View>
        <View style={styles.main}>
          <Text style={[styles.title, { color: P.text }]} numberOfLines={2}>{item.title}</Text>
          <Text style={[styles.sub, { color: P.sub }]} numberOfLines={2}>{subline(item, t)}</Text>
          {item.note && (
            <Text style={[styles.note, { color: P.text }]} numberOfLines={2}>{t('maintenance.item.note', { note: item.note })}</Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => { hapticLight(); onMenu(item); }}
          style={styles.more}
          activeOpacity={0.5}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('maintenance.item.menuA11y', { title: item.title })}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={P.sub} />
        </TouchableOpacity>
      </View>

      {view.progressPercent !== null && item.kind !== 'event' && (
        <ProgressBar percent={view.progressPercent} colour={overdue ? S.bad : P.accentText} track={P.sep} />
      )}

      <View style={styles.foot}>
        <Pill text={pill.text} tone={pill.tone} P={P} S={S} />
        <View style={styles.src}>
          <Ionicons name={fromBooking ? 'calendar-outline' : 'person-outline'} size={11} color={P.sub} />
          <Text style={[styles.srcText, { color: P.sub }]}>
            {(fromBooking ? t('maintenance.origin.booking') : t('maintenance.origin.mine')).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        {action === 'rebook' && (
          <PrimaryButton small P={P} label={t('maintenance.action.rebook')} disabled={busy} onPress={() => onAction(item, 'rebook')} />
        )}
        {action === 'find' && (
          <GhostButton small P={P} label={t('maintenance.action.find')} disabled={busy} onPress={() => onAction(item, 'find')} />
        )}
        {action === 'resume' && (
          <GhostButton small P={P} label={t('maintenance.action.resume')} disabled={busy} onPress={() => onAction(item, 'resume')} />
        )}
      </View>
    </View>
  );
}

export const MaintenanceItemCard = React.memo(MaintenanceItemCardImpl);

const styles = StyleSheet.create({
  card: { padding: 14, gap: 10 },
  top: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  ico: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, minWidth: 0 },
  title: { fontFamily: FONT_DISPLAY, fontSize: 15, letterSpacing: 0.8, lineHeight: 19 },
  sub: { fontFamily: FONT_BODY, fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  note: { fontFamily: FONT_BODY, fontSize: 12.5, marginTop: 4, lineHeight: 17, fontStyle: 'italic' },
  more: { padding: 2 },
  foot: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  src: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  srcText: { fontFamily: FONT_DISPLAY, fontSize: 10, letterSpacing: 1.2 },
});
