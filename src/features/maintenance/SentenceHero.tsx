// src/features/maintenance/SentenceHero.tsx
//
// The top of the Maintenance screen (approved 2026-11-23, canvas board D,
// "Sentence + cards"): one item said in plain words — "Gel infills, due 2 days
// ago." — with one main button and small Done it / Snooze a week / More links.
// The cards below pick which item sits here. Shared copy and actions with the
// landing's NextUpCard; only the look differs.

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { AppTheme } from '../../constants/theme';
import type { TranslationKey, TranslationParams } from '../../i18n';
import type { MaintenanceItem } from '../../types/maintenance';
import { formatShortDayDate } from '../../utils/dateUtils';
import { primaryActionFor, type ItemAction } from './MaintenanceItemCard';
import { intervalText } from './NextUpCard';
import { canSnoozeItem, countdownFor, needsAttention, rhythmLineFor, type PresentedItem } from './presentation';
import { FONT_BODY, FONT_DISPLAY, type SemanticColors, hapticLight, hapticMedium } from './ui';

type T = (key: TranslationKey, params?: TranslationParams) => string;

/** What follows the item's name: ", due 2 days ago." and so on. Built so it
 *  never needs "is"/"are" — titles are the client's own words, singular or
 *  plural. */
export function sentenceTail({ item, view }: PresentedItem, t: T): string {
  if (item.kind === 'event' && item.eventOn) {
    return t('maintenance.hero.eventOn', { date: formatShortDayDate(item.eventOn) });
  }
  const d = view.daysUntilDue;
  switch (view.state) {
    case 'paused': return t('maintenance.hero.paused');
    case 'booked': return t('maintenance.hero.booked');
    case 'unscheduled': return t('maintenance.hero.noDate');
    case 'overdue': return d === -1 ? t('maintenance.hero.yesterday') : t('maintenance.hero.daysAgo', { count: -(d ?? 0) });
    case 'due_today': return t('maintenance.hero.today');
    default:
      if (item.kind === 'takedown' && item.dueOn) return t('maintenance.hero.around', { date: formatShortDayDate(item.dueOn) });
      if (d === 1) return t('maintenance.hero.tomorrow');
      if (d !== null && d >= 14) return t('maintenance.hero.inWeeks', { count: Math.round(d / 7) });
      return t('maintenance.hero.inDays', { count: d ?? 0 });
  }
}

function kickerFor({ item, view }: PresentedItem, t: T): string {
  if (view.state === 'paused') return t('maintenance.hero.kicker.paused');
  if (view.state === 'booked') return t('maintenance.hero.kicker.booked');
  if (item.kind === 'event') return t('maintenance.hero.kicker.event');
  return needsAttention(view.state) ? t('maintenance.hero.kicker.due') : t('maintenance.hero.kicker.later');
}

function supportLine(item: MaintenanceItem, t: T): string | null {
  if (item.kind === 'event' && item.dueOn) return t('maintenance.hero.bookBy', { date: formatShortDayDate(item.dueOn) });
  return intervalText(rhythmLineFor(item), t) ?? item.providerName ?? null;
}

function primaryLabel(item: MaintenanceItem, action: ItemAction, t: T): string {
  switch (action) {
    case 'rebook': return item.providerName
      ? t('maintenance.hero.rebookWith', { provider: item.providerName })
      : t('maintenance.action.rebook');
    case 'find': return t('maintenance.action.find');
    case 'resume': return t('maintenance.action.resume');
  }
}

interface Props {
  presented: PresentedItem;
  P: AppTheme;
  S: SemanticColors;
  t: T;
  busy: boolean;
  onAction: (item: MaintenanceItem, action: ItemAction) => void;
  onDone: (item: MaintenanceItem) => void;
  onSnooze: (item: MaintenanceItem) => void;
  onMore: (item: MaintenanceItem) => void;
}

export function SentenceHero({ presented, P, S, t, busy, onAction, onDone, onSnooze, onMore }: Props) {
  const { item, view } = presented;
  const tone = countdownFor(presented).tone;
  const dot = view.state === 'paused' ? P.sub : tone === 'bad' ? S.bad : tone === 'warn' ? S.warn : tone === 'ok' ? S.ok : P.sub;
  const action = primaryActionFor(item, view);
  const line = supportLine(item, t);
  const canDone = view.state !== 'paused' && view.state !== 'booked';
  const tail = sentenceTail(presented, t);

  const link = (label: string, onPress: () => void) => (
    <TouchableOpacity
      key={label}
      style={[styles.link, busy && styles.dim]}
      onPress={() => { hapticLight(); onPress(); }}
      disabled={busy}
      activeOpacity={0.5}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${item.title}`}
    >
      <Text style={[styles.linkText, { color: P.accentText, textDecorationColor: P.border }]}>{label.toUpperCase()}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.kickRow}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <Text style={[styles.kicker, { color: P.sub }]}>{kickerFor(presented, t).toUpperCase()}</Text>
      </View>
      <Text style={[styles.sentence, { color: P.text }]} accessibilityRole="header">
        <Text style={[styles.hl, { color: P.accentText, textDecorationColor: P.accentDim }]}>{item.title}</Text>
        {tail}
      </Text>
      {line ? <Text style={[styles.line, { color: P.sub }]}>{line}</Text> : null}
      {item.note ? <Text style={[styles.note, { color: P.text }]}>{t('maintenance.item.note', { note: item.note })}</Text> : null}

      <View style={styles.actions}>
        {action ? (
          <TouchableOpacity
            style={[styles.primary, { backgroundColor: P.accent }, busy && styles.dim]}
            onPress={() => { hapticMedium(); onAction(item, action); }}
            disabled={busy}
            activeOpacity={0.75}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator color={P.onAccent} /> : (
              <Text style={[styles.primaryText, { color: P.onAccent }]} numberOfLines={1}>
                {primaryLabel(item, action, t).toUpperCase()}
              </Text>
            )}
          </TouchableOpacity>
        ) : null}
        <View style={styles.links}>
          {canDone ? link(t('maintenance.action.doneIt'), () => onDone(item)) : null}
          {canSnoozeItem(presented) ? link(t('maintenance.action.snooze'), () => onSnooze(item)) : null}
          {link(t('maintenance.hero.more'), () => onMore(item))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, paddingHorizontal: 4, marginTop: 18 },
  kickRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  kicker: { fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: 1.8 },
  sentence: { fontFamily: FONT_DISPLAY, fontSize: 31, lineHeight: 38, letterSpacing: 0.3 },
  hl: { textDecorationLine: 'underline' },
  line: { fontFamily: FONT_BODY, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  note: { fontFamily: FONT_BODY, fontSize: 14, lineHeight: 20, fontStyle: 'italic' },
  actions: { gap: 4, marginTop: 6 },
  primary: { height: 54, borderRadius: 100, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  primaryText: { fontFamily: FONT_DISPLAY, fontSize: 14, letterSpacing: 1.2 },
  links: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
  link: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  linkText: { fontFamily: FONT_DISPLAY, fontSize: 12, letterSpacing: 1.1, textDecorationLine: 'underline' },
  dim: { opacity: 0.5 },
});
