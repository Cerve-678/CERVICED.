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
      {/* A gradient stands in for a provider until there is a real one to show. */}
      <View style={[styles.preview, { backgroundColor: P.accentDim }]} accessible={false}>
        <View style={styles.faces}>
          <LinearGradient
            colors={['#F5B7D2', '#9A84C5', '#4A6B8F']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.face, { borderColor: P.card }]}
          />
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
  face: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  overlap: { marginLeft: -8 },
  faceText: { fontSize: 8, fontWeight: '700' },
  previewLabel: { fontFamily: FONT_DISPLAY, fontSize: 15 },
  title: { fontFamily: FONT_BODY, fontSize: 20, fontWeight: '700' },
  body: { fontFamily: FONT_BODY, fontSize: 14, lineHeight: 20 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  grow: { flex: 1 },
});
