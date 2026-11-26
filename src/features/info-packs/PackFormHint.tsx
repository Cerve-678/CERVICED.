// Tells a provider, where they're writing about a service or their policies,
// that an Info Pack or a Form can carry that information to clients with
// their booking (user, 2026-11-18: "A + B" from the hints canvas).
//
// First a tip card with Info Pack / Form buttons. Once they close it or use
// it, it's remembered on their account (users.seen_tours, via tourService)
// and only two quiet one-line links stay, so it never shows twice.
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../contexts/AuthContext';
import { recordTourSeen, resolveTourForUser } from '../../services/tourService';
import { isDarkColor } from '../../constants/providerThemes';
import type { TourKey } from '../../utils/coachMarkTours';
import { logger } from '../../utils/logger';
import { tr } from '../../i18n';
import { useTranslation } from '../../i18n';

export type PackFormKind = 'packs' | 'forms';

export interface PackFormHintPalette {
  card: string;
  text: string;
  sub: string;
  border: string;
  accent: string;
  /** Accent used for text on the page background; falls back to `accent`. */
  accentText?: string;
}

/** 'card' until closed or used, then 'lines'. Null while it's being looked
 *  up, so the card never flashes in after the lines. */
export function usePackFormTip(tour: TourKey): { mode: 'card' | 'lines' | null; dismiss: () => void } {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [mode, setMode] = useState<'card' | 'lines' | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    resolveTourForUser(tour, [{ key: 'tip' }], userId)
      .then(decision => { if (alive) setMode(decision.show ? 'card' : 'lines'); })
      .catch(error => {
        logger.error(`[PackFormHint] ${tour} check failed:`, error);
        if (alive) setMode('lines');
      });
    return () => { alive = false; };
  }, [tour, userId]);

  const dismiss = useCallback(() => {
    setMode('lines');
    if (userId) void recordTourSeen(tour, userId);
  }, [tour, userId]);

  return { mode, dismiss };
}

export function PackFormTipCard({
  title, body, note, palette, onOpen, onClose,
}: {
  title: string;
  body: string;
  /** A short line under the buttons, e.g. that pressing one saves first. */
  note?: string;
  palette: PackFormHintPalette;
  onOpen: (kind: PackFormKind) => void;
  onClose: () => void;
}) {
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
  const onAccent = isDarkColor(palette.accent) ? '#FFFFFF' : '#1A1815';
  const accentText = palette.accentText ?? palette.accent;
  const open = (kind: PackFormKind) => {
    Haptics.selectionAsync().catch(() => {});
    onOpen(kind);
  };
  return (
    <View style={[s.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <View style={s.head}>
        <Ionicons name="document-text-outline" size={22} color={accentText} style={{ marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: palette.text }]}>{title}</Text>
          <Text style={[s.body, { color: palette.sub }]}>{body}</Text>
        </View>
        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync().catch(() => {}); onClose(); }}
          hitSlop={10}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={tr('providerBusiness.newp.hideThisTip')}
          style={s.close}
        >
          <Ionicons name="close" size={18} color={palette.sub} />
        </TouchableOpacity>
      </View>
      <View style={s.buttons}>
        <TouchableOpacity
          onPress={() => open('packs')}
          activeOpacity={0.8}
          accessibilityRole="button"
          style={[s.button, { backgroundColor: palette.accent }]}
        >
          <Text style={[s.buttonText, { color: onAccent }]}>INFO PACK</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => open('forms')}
          activeOpacity={0.8}
          accessibilityRole="button"
          style={[s.button, { borderWidth: 1, borderColor: palette.accent }]}
        >
          <Text style={[s.buttonText, { color: accentText }]}>FORM</Text>
        </TouchableOpacity>
      </View>
      {!!note && <Text style={[s.note, { color: palette.sub }]}>{note}</Text>}
    </View>
  );
}

export function PackFormHintLines({
  palette, onOpen,
}: {
  palette: PackFormHintPalette;
  onOpen: (kind: PackFormKind) => void;
}) {
  const accentText = palette.accentText ?? palette.accent;
  const line = (kind: PackFormKind, icon: React.ComponentProps<typeof Ionicons>['name'], lead: string, action: string) => (
    <TouchableOpacity
      key={kind}
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onOpen(kind); }}
      activeOpacity={0.6}
      accessibilityRole="link"
      accessibilityLabel={`${lead} ${action}`}
      style={s.line}
    >
      <Ionicons name={icon} size={16} color={accentText} />
      <Text style={[s.lineText, { color: palette.sub }]}>
        {lead} <Text style={{ color: accentText, fontWeight: '700' }}>{action} →</Text>
      </Text>
    </TouchableOpacity>
  );
  return (
    <View>
      {line('packs', 'document-text-outline', 'Aftercare or what to bring?', 'Send it with their booking')}
      {line('forms', 'clipboard-outline', 'Need answers first?', 'Ask with a Form')}
    </View>
  );
}

/** The card, then the lines, in one place. Opening one from the card counts
 *  as using it. */
export function PackFormHint({
  tour, title, body, note, palette, onOpen,
}: {
  tour: TourKey;
  title: string;
  body: string;
  note?: string;
  palette: PackFormHintPalette;
  /** Return false when nothing opened (say, the service couldn't be saved
   *  yet); the card then stays, since it wasn't really used. */
  onOpen: (kind: PackFormKind) => boolean | void;
}) {
  const tip = usePackFormTip(tour);
  if (tip.mode === 'card') {
    return (
      <PackFormTipCard
        title={title}
        body={body}
        {...(note ? { note } : {})}
        palette={palette}
        onOpen={kind => { if (onOpen(kind) !== false) tip.dismiss(); }}
        onClose={tip.dismiss}
      />
    );
  }
  return tip.mode === 'lines' ? <PackFormHintLines palette={palette} onOpen={kind => { onOpen(kind); }} /> : null;
}

const s = StyleSheet.create({
  // Spaced like the cards around it (Card's marginBottom: 14), so the card
  // under it isn't flush against it (owner, 2026-11-18).
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 12, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '700', fontSize: 14 },
  body: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 18, marginTop: 2 },
  close: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  buttons: { flexDirection: 'row', gap: 8 },
  button: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: 'BakbakOne-Regular', fontSize: 12, letterSpacing: 1 },
  note: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, marginTop: -4 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  lineText: { flex: 1, fontFamily: 'Jura-VariableFont_wght', fontSize: 13 },
});
