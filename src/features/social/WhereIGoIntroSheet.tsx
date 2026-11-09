// src/features/social/WhereIGoIntroSheet.tsx
//
// The one-time "Show where I go" intro (style C, chosen 2026-11-09): a small
// sheet showing what followers will see, in two short lines. The detail
// (private vs open, hiding a provider) lives in Your circle, not here.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { AppTheme } from '../../constants/theme';
import { FONT_BODY, FONT_DISPLAY, GhostButton, PrimaryButton, Sheet } from '../maintenance/ui';

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
  return (
    <Sheet visible={visible} onClose={onClose} P={P}>
      {/* What a follower sees: your face on a provider's card. */}
      <View style={[styles.preview, { backgroundColor: P.accentDim }]} accessible={false}>
        <View style={styles.faces}>
          <View style={[styles.face, { backgroundColor: P.secondary, borderColor: P.card }]}>
            <Text style={[styles.faceText, { color: P.secondaryText }]}>AK</Text>
          </View>
          <View style={[styles.face, styles.overlap, { backgroundColor: P.accent, borderColor: P.card }]}>
            <Text style={[styles.faceText, { color: P.onAccent }]}>YOU</Text>
          </View>
        </View>
        <Text style={[styles.previewLabel, { color: P.text }]}>A provider you visit</Text>
      </View>
      <Text style={[styles.title, { color: P.text }]}>Your followers can see where you go</Text>
      <Text style={[styles.body, { color: P.sub }]}>
        From now on, your face shows on the providers you visit. Never what you had done.
      </Text>
      {error ? <Text style={[styles.body, { color: errorColour }]}>{error}</Text> : null}
      <View style={styles.buttons}>
        <PrimaryButton label="Got it" onPress={onGotIt} disabled={busy} P={P} style={styles.grow} />
        <GhostButton label="Turn it off" onPress={onTurnOff} disabled={busy} P={P} style={styles.grow} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  preview: { height: 110, borderRadius: 18, padding: 12, justifyContent: 'space-between' },
  faces: { flexDirection: 'row', alignSelf: 'flex-end' },
  face: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  overlap: { marginLeft: -8 },
  faceText: { fontSize: 8, fontWeight: '700' },
  previewLabel: { fontFamily: FONT_DISPLAY, fontSize: 15 },
  title: { fontFamily: FONT_BODY, fontSize: 20, fontWeight: '700' },
  body: { fontFamily: FONT_BODY, fontSize: 14, lineHeight: 20 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  grow: { flex: 1 },
});
