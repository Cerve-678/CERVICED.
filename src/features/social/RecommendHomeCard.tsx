// src/features/social/RecommendHomeCard.tsx
//
// Home's Recommend ask (style A, chosen 2026-11-09): a card in the feed, not
// a pop-up. Shown by useCircleMoment for a recent visit that wasn't rated.

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AppTheme } from '../../constants/theme';
import { FONT_BODY, FONT_DISPLAY, GhostButton, PrimaryButton, hapticLight } from '../maintenance/ui';
import { initialsFor } from './presentation';
import { visitWhenLabel } from './circleMoments';

const HEART = '#FF2D78';

interface Props {
  providerName: string;
  bookingDate: string;
  busy: boolean;
  error: string | null;
  onRecommend: () => void;
  onBookAgain: () => void;
  onNotNow: () => void;
  P: AppTheme;
  errorColour: string;
}

export function RecommendHomeCard({
  providerName, bookingDate, busy, error, onRecommend, onBookAgain, onNotNow, P, errorColour,
}: Props) {
  return (
    <View style={[styles.card, { backgroundColor: P.card, borderColor: P.accent }]}>
      <View style={styles.top}>
        <View style={styles.logoWrap}>
          <View style={[styles.logo, { backgroundColor: P.secondary }]}>
            <Text style={[styles.logoText, { color: P.secondaryText }]}>{initialsFor(providerName)}</Text>
          </View>
          <View style={[styles.heart, { borderColor: P.card }]}>
            <Ionicons name="heart" size={9} color="#FFFFFF" />
          </View>
        </View>
        <View style={styles.copy}>
          <Text style={[styles.label, { color: P.sub }]} numberOfLines={1}>
            {`${visitWhenLabel(bookingDate, new Date())} · ${providerName}`.toUpperCase()}
          </Text>
          <Text style={[styles.title, { color: P.text }]}>How was it?</Text>
          <Text style={[styles.body, { color: P.sub }]}>Recommend them to the people who follow you.</Text>
        </View>
        <TouchableOpacity
          onPress={() => { hapticLight(); onNotNow(); }}
          style={styles.close}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Not now"
          activeOpacity={0.6}
        >
          <Ionicons name="close" size={18} color={P.sub} />
        </TouchableOpacity>
      </View>
      {error ? <Text style={[styles.error, { color: errorColour }]}>{error}</Text> : null}
      <View style={styles.buttons}>
        <PrimaryButton label="Recommend" icon="heart" onPress={onRecommend} disabled={busy} P={P} style={styles.grow} />
        <GhostButton label="Book again" onPress={onBookAgain} disabled={busy} P={P} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1.5,
    padding: 16,
    gap: 12,
    marginBottom: 16,
    shadowColor: '#3F1E36',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoWrap: { width: 52, height: 52 },
  logo: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontFamily: FONT_DISPLAY, fontSize: 15 },
  heart: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    backgroundColor: HEART,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0 },
  label: { fontFamily: FONT_DISPLAY, fontSize: 10, letterSpacing: 1.4 },
  title: { fontFamily: FONT_BODY, fontSize: 17, fontWeight: '700', marginTop: 2 },
  body: { fontFamily: FONT_BODY, fontSize: 13, lineHeight: 18, marginTop: 2 },
  close: { alignSelf: 'flex-start', width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginTop: -6, marginRight: -6 },
  error: { fontFamily: FONT_BODY, fontSize: 13 },
  buttons: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
});
