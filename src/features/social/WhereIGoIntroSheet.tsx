// src/features/social/WhereIGoIntroSheet.tsx
//
// The one-time "Show where I go" intro (style C, chosen 2026-11-09): a small
// sheet showing what followers will see, in two short lines. The detail
// (private vs open, hiding a provider) lives in Your circle, not here.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { AppTheme } from '../../constants/theme';
import { FONT_BODY, FONT_DISPLAY, GhostButton, PrimaryButton, Sheet } from '../maintenance/ui';
import { tr } from '../../i18n';
import { useTranslation } from '../../i18n';

interface Props {
  visible: boolean;
  busy: boolean;
  error: string | null;
  onGotIt: () => void;
  onTurnOff: () => void;
  onClose: () => void;
  P: AppTheme;
  errorColour: string;
}

export function WhereIGoIntroSheet({ visible, busy, error, onGotIt, onTurnOff, onClose, P, errorColour }: Props) {
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
  return (
    <Sheet visible={visible} onClose={onClose} P={P}>
      {/* The provider card is a gradient until there is a real provider to show. */}
      <LinearGradient
        colors={['#3F1E36', '#8F4D79', '#4A6B8F']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.preview}
        accessible={false}
      >
        <View style={[styles.face, { backgroundColor: P.accent, borderColor: P.card }]}>
          <Text style={[styles.faceText, { color: P.onAccent }]}>YOU</Text>
        </View>
        <Text style={styles.previewLabel}>{tr('shared.newc.aProviderYouVisit')}</Text>
      </LinearGradient>
      <Text style={[styles.title, { color: P.text }]}>{tr('shared.newc.yourFollowersCanSeeWhereYou')}</Text>
      <Text style={[styles.body, { color: P.sub }]}>
        {tr('shared.newc.fromNowOnYourFaceShows')}
      </Text>
      {error ? <Text style={[styles.body, { color: errorColour }]}>{error}</Text> : null}
      <View style={styles.buttons}>
        <PrimaryButton label={tr('common.gotIt')} onPress={onGotIt} disabled={busy} P={P} style={styles.grow} />
        <GhostButton label={tr('shared.newc.turnItOff')} onPress={onTurnOff} disabled={busy} P={P} style={styles.grow} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  preview: { height: 110, borderRadius: 18, padding: 12, justifyContent: 'space-between' },
  face: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignSelf: 'flex-end', alignItems: 'center', justifyContent: 'center' },
  faceText: { fontSize: 8, fontWeight: '700' },
  previewLabel: { fontFamily: FONT_DISPLAY, fontSize: 15, color: '#FFFFFF' },
  title: { fontFamily: FONT_BODY, fontSize: 20, fontWeight: '700' },
  body: { fontFamily: FONT_BODY, fontSize: 14, lineHeight: 20 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  grow: { flex: 1 },
});
