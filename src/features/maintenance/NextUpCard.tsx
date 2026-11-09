// src/features/maintenance/NextUpCard.tsx
//
// The big Maintenance card (approved 2026-11-08, from concept C): NEXT UP, a
// huge countdown, the item, its interval line, then Book / Done it / Snooze
// +7 days. Acting on it moves the item's date, so the next item steps
// forward on the next render. With nothing due it reads ALL CLEAR.
//
// Shared by the Beauty Profile landing (compact, above the map, only while
// something is due) and the Maintenance screen (always).

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { AppTheme } from '../../constants/theme';
import type { TranslationKey, TranslationParams } from '../../i18n';
import type { MaintenanceItem } from '../../types/maintenance';
import {
  canSnoozeItem,
  countdownFor,
  rhythmLineFor,
  type CountdownUnit,
  type NextUp,
  type PresentedItem,
  type RhythmLine,
} from './presentation';
import { FONT_BODY, FONT_DISPLAY, hapticLight, hapticMedium } from './ui';

type T = (key: TranslationKey, params?: TranslationParams) => string;

export const COUNTDOWN_UNIT: Record<CountdownUnit, TranslationKey> = {
  daysOver: 'maintenance.countdown.daysOver',
  dayOver: 'maintenance.countdown.dayOver',
  today: 'maintenance.countdown.today',
  day: 'maintenance.countdown.day',
  days: 'maintenance.countdown.days',
  weeks: 'maintenance.countdown.weeks',
  booked: 'maintenance.countdown.booked',
  bookNow: 'maintenance.countdown.bookNow',
  noDate: 'maintenance.countdown.noDate',
};

/** 3.5 → "3½": learned gaps are read to the half week. */
function weeksText(weeks: number): string {
  return Number.isInteger(weeks) ? String(weeks) : `${Math.floor(weeks)}½`;
}

export function intervalText(line: RhythmLine, t: T): string | null {
  if (!line) return null;
  const weeks = weeksText(line.weeks);
  switch (line.kind) {
    case 'learned': return t('maintenance.rhythm.learned', { from: line.from, weeks });
    case 'provider': return t('maintenance.rhythm.provider', { provider: line.provider, weeks });
    case 'client': return t('maintenance.rhythm.client', { weeks });
  }
}

interface Props {
  nextUp: NextUp;
  P: AppTheme;
  t: T;
  /** Landing size: smaller number, plus "ALL ›" into the Maintenance screen. */
  compact?: boolean;
  onOpenAll?: () => void;
  onBook: (item: MaintenanceItem) => void;
  onDone: (item: MaintenanceItem) => void;
  onSnooze: (item: MaintenanceItem) => void;
  /** The item mid-request, so its buttons can't be pressed twice. */
  busyItemId: string | null;
}

export function NextUpCard({ nextUp, P, t, compact, onOpenAll, onBook, onDone, onSnooze, busyItemId }: Props) {
  const on = { color: P.onAccent };
  const soft = { color: P.onAccent, opacity: 0.8 };

  const header = (kicker: string) => (
    <View style={styles.top}>
      <Text style={[styles.kicker, soft]}>{kicker.toUpperCase()}</Text>
      {compact && onOpenAll ? (
        <TouchableOpacity onPress={() => { hapticLight(); onOpenAll(); }} activeOpacity={0.5} hitSlop={10} accessibilityRole="button">
          <Text style={[styles.kicker, on]}>{t('maintenance.next.all').toUpperCase()} ›</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const shell = (children: React.ReactNode) => (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {/* The second card peeking out underneath: the next item waiting. */}
      <View pointerEvents="none" style={[styles.under, { backgroundColor: P.accent }]} />
      <View style={[styles.card, compact && styles.cardCompact, { backgroundColor: P.accent }]}>{children}</View>
    </View>
  );

  const due = nextUp.due;
  if (!due) {
    const up = nextUp.upcoming;
    const upCount = up ? countdownFor(up) : null;
    return shell(
      <>
        {header(t('maintenance.next.allClear'))}
        <Text style={[styles.clear, on, compact && styles.clearCompact]}>{t('maintenance.next.nothingDue')}</Text>
        <Text style={[styles.line, soft]}>
          {up && upCount
            ? t('maintenance.next.upcoming', {
                title: up.item.title,
                when: `${upCount.value ?? ''} ${t(COUNTDOWN_UNIT[upCount.unit])}`.trim(),
              })
            : t('maintenance.next.empty')}
        </Text>
      </>,
    );
  }

  return shell(<DueBody p={due} P={P} t={t} compact={compact} header={header} onBook={onBook} onDone={onDone} onSnooze={onSnooze} busy={busyItemId === due.item.id} />);
}

function DueBody({
  p, P, t, compact, header, onBook, onDone, onSnooze, busy,
}: {
  p: PresentedItem;
  P: AppTheme;
  t: T;
  compact: boolean | undefined;
  header: (kicker: string) => React.ReactNode;
  onBook: (item: MaintenanceItem) => void;
  onDone: (item: MaintenanceItem) => void;
  onSnooze: (item: MaintenanceItem) => void;
  busy: boolean;
}) {
  const { item } = p;
  const c = countdownFor(p);
  const unit = t(COUNTDOWN_UNIT[c.unit]).toUpperCase();
  const interval = intervalText(rhythmLineFor(item), t);
  const snooze = canSnoozeItem(p);
  const on = { color: P.onAccent };
  const soft = { color: P.onAccent, opacity: 0.85 };

  const solid = (label: string, onPress: () => void) => (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: P.onAccent, borderColor: P.onAccent }, busy && styles.dim]}
      onPress={() => { hapticMedium(); onPress(); }}
      disabled={busy}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${item.title}`}
    >
      <Text style={[styles.btnText, { color: P.accent }]}>{label.toUpperCase()}</Text>
    </TouchableOpacity>
  );

  return (
    <>
      {header(t('maintenance.next.title'))}
      <View style={styles.bigRow} accessible accessibilityLabel={`${c.value !== null ? `${c.value} ` : ''}${unit}`}>
        {c.value !== null ? <Text style={[styles.big, on, compact && styles.bigCompact]}>{c.value}</Text> : null}
        <Text style={[c.value !== null ? styles.unit : styles.unitAlone, on]}>{unit}</Text>
      </View>
      <Text style={[styles.title, on]} numberOfLines={2}>{item.title}</Text>
      {interval ? <Text style={[styles.line, soft]}>{interval}</Text> : null}
      <View style={[styles.actions, compact && styles.actionsCompact]}>
        {busy ? <ActivityIndicator color={P.onAccent} style={styles.busy} /> : null}
        {solid(t('maintenance.action.book'), () => onBook(item))}
        {solid(t('maintenance.action.doneIt'), () => onDone(item))}
        {snooze ? (
          <TouchableOpacity
            style={[styles.btn, { borderColor: P.onAccent }, busy && styles.dim]}
            onPress={() => { hapticLight(); onSnooze(item); }}
            disabled={busy}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={`${t('maintenance.action.snoozeWeek')}, ${item.title}`}
          >
            <Text style={[styles.btnText, on]}>{t('maintenance.action.snoozeWeek').toUpperCase()}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 10 },
  // The mockup's compact card (.focus.cp) is tighter so the map stays near the top.
  wrapCompact: { marginTop: 4, marginBottom: 14 },
  cardCompact: { borderRadius: 24, paddingVertical: 14, paddingHorizontal: 16 },
  actionsCompact: { marginTop: 10 },
  under: { position: 'absolute', left: 14, right: 14, bottom: -9, height: 24, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, opacity: 0.45 },
  card: {
    borderRadius: 28,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: 1.5 },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 10 },
  big: { fontFamily: FONT_DISPLAY, fontSize: 64, lineHeight: 68 },
  bigCompact: { fontSize: 44, lineHeight: 48 },
  unit: { fontFamily: FONT_DISPLAY, fontSize: 14, letterSpacing: 1.4 },
  unitAlone: { fontFamily: FONT_DISPLAY, fontSize: 30, letterSpacing: 1.2, lineHeight: 36 },
  title: { fontFamily: FONT_DISPLAY, fontSize: 22, letterSpacing: 0.8, lineHeight: 26, marginTop: 6 },
  line: { fontFamily: FONT_BODY, fontSize: 13, lineHeight: 18, marginTop: 2 },
  clear: { fontFamily: FONT_DISPLAY, fontSize: 40, letterSpacing: 0.8, lineHeight: 46, marginTop: 8 },
  clearCompact: { fontSize: 32, lineHeight: 38 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, alignItems: 'center' },
  btn: { borderRadius: 100, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  btnText: { fontFamily: FONT_DISPLAY, fontSize: 12, letterSpacing: 1 },
  dim: { opacity: 0.5 },
  busy: { marginRight: 4 },
});
