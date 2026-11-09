// src/features/providers/ManageScheduleRows.tsx
//
// Two rows under My Profile → Manage: a quick view of the release day (tap to
// change it in Scheduling & Availability; only for a provider who has one)
// and the Home calendar's view (Full day / List / Week). The screen draws the
// card around them.

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CALENDAR_VIEW_OPTIONS, type CalendarView } from '../provider-bookings/calendarViewPreference';
import type { ReleaseQuickView } from './releaseQuickView';

interface Props {
  /** undefined while the profile hasn't loaded yet (the row holds its
   *  place); null when the provider has no release day (no row at all). */
  release: ReleaseQuickView | null | undefined;
  onOpenRelease: () => void;
  /** null until the saved choice has loaded. */
  calendarView: CalendarView | null;
  onChangeCalendarView: (view: CalendarView) => void;
  textColor: string;
  subTextColor: string;
  accentColor: string;
  /** Fill for the picked chip; the chip's text uses onAccentColor. */
  onAccentColor: string;
  chipBg: string;
  borderColor: string;
}

export function ManageScheduleRows({
  release, onOpenRelease, calendarView, onChangeCalendarView,
  textColor, subTextColor, accentColor, onAccentColor, chipBg, borderColor,
}: Props) {
  return (
    <View>
      {release !== null && (
        <>
          <TouchableOpacity
            style={st.releaseRow}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onOpenRelease();
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={release ? `${release.title}. ${release.lines.join('. ')}. Change in Scheduling.` : 'Release day. Change in Scheduling.'}
          >
            <Ionicons name="calendar-number-outline" size={18} color={accentColor} />
            <View style={st.releaseText}>
              <Text style={[st.label, { color: subTextColor }]}>RELEASE DATE</Text>
              <Text style={[st.title, { color: textColor }]}>{release?.title ?? ' '}</Text>
              {release?.lines.map(line => (
                <Text key={line} style={[st.line, { color: subTextColor }]}>{line}</Text>
              ))}
            </View>
            <Ionicons name="chevron-forward" size={16} color={subTextColor} style={st.chevron} />
          </TouchableOpacity>

          <View style={[st.divider, { backgroundColor: borderColor }]} />
        </>
      )}

      <Text style={[st.label, { color: subTextColor }]}>CALENDAR VIEW</Text>
      <Text style={[st.line, { color: subTextColor }]}>How your calendar on Home opens</Text>
      <View style={st.chips} accessibilityRole="radiogroup">
        {CALENDAR_VIEW_OPTIONS.map(option => {
          const picked = calendarView === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              style={[st.chip, { backgroundColor: picked ? accentColor : chipBg, borderColor }]}
              onPress={() => {
                if (picked) return;
                Haptics.selectionAsync().catch(() => {});
                onChangeCalendarView(option.key);
              }}
              activeOpacity={0.7}
              accessibilityRole="radio"
              accessibilityState={{ selected: picked }}
              accessibilityLabel={`${option.label} view`}
            >
              <Ionicons name={option.icon} size={15} color={picked ? onAccentColor : accentColor} />
              <Text style={[st.chipText, { color: picked ? onAccentColor : textColor }]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  releaseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  releaseText: { flex: 1, gap: 3 },
  chevron: { alignSelf: 'center', opacity: 0.6 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  title: { fontSize: 15, fontWeight: '600' },
  line: { fontSize: 12, lineHeight: 17 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 16 },
  chips: { flexDirection: 'row', gap: 8, marginTop: 10 },
  chip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
});
