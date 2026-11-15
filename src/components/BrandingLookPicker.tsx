// src/components/BrandingLookPicker.tsx
//
// Branding → Looks: a rail of finished combinations. Each card is drawn from
// the Look's own parts — its colour set and hero finish behind its name in its
// own font, then its content colour, accent and card corners — so the card is
// the Look, not a picture of one.

import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import ProfileHeroBackdrop from './ProfileHeroBackdrop';
import { BRANDING_LOOKS, resolveLook, type BrandingLook } from '../constants/brandingLooks';
import { PAGE_STYLES } from '../constants/pageStyles';
import { PROVIDER_FONTS, resolveProviderFontFamily, resolveProviderFontScale } from '../constants/providerFonts';
import { isDarkColor, withAlpha } from '../constants/providerThemes';

interface Props {
  /** The Look whose parts all match what's on screen, if any. */
  selectedKey: string | null;
  onChoose: (look: BrandingLook) => void;
  isLocked?: (look: BrandingLook) => boolean;
  onLockedPress?: () => void;
  textColor: string;
  subColor: string;
  borderColor: string;
}

export default function BrandingLookPicker({
  selectedKey,
  onChoose,
  isLocked,
  onLockedPress,
  textColor,
  subColor,
  borderColor,
}: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
      {BRANDING_LOOKS.map(look => {
        const selected = selectedKey === look.key;
        const locked = isLocked?.(look) ?? false;
        const parts = lookParts(look);
        return (
          <TouchableOpacity
            key={look.key}
            style={[styles.option, locked && styles.locked]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              if (locked) onLockedPress?.();
              else onChoose(look);
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${look.name}: ${look.description}. ${parts}${locked ? ', locked' : ''}`}
          >
            <View style={[styles.frame, { borderColor: selected ? textColor : borderColor }, selected && styles.frameOn]}>
              <LookCard look={look} />
              {locked ? (
                <View style={styles.badge}>
                  <Ionicons name="lock-closed" size={12} color="#FFFFFF" />
                </View>
              ) : selected ? (
                <View style={styles.badge}>
                  <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                </View>
              ) : null}
            </View>
            <Text style={[styles.name, { color: selected ? textColor : subColor }]} numberOfLines={1}>{look.name}</Text>
            <Text style={[styles.description, { color: subColor }]} numberOfLines={2}>{look.description}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/** "Spa · Tenor Sans": the page style and font, for the screen reader. */
function lookParts(look: BrandingLook): string {
  const style = PAGE_STYLES.find(s => s.key === look.pageStyle)?.name ?? '';
  const font = PROVIDER_FONTS.find(f => f.key === look.font)?.name ?? '';
  return [style, font].filter(Boolean).join(' · ');
}

function LookCard({ look }: { look: BrandingLook }) {
  const r = resolveLook(look);
  const heroInk = isDarkColor(r.gradient[0]) ? '#FFFFFF' : '#26201E';
  const sheetInk = isDarkColor(r.sheetColor) ? '#F2EDEA' : '#26201E';
  const corner = r.shape === 'square' ? 0 : 8;
  const accentInk = isDarkColor(r.accentColor) ? '#FFFFFF' : '#1B2740';
  return (
    <View style={card.root}>
      <View style={card.hero}>
        <ProfileHeroBackdrop colors={r.gradient} finish={r.finish} style={StyleSheet.absoluteFill} />
        <Text
          style={[
            card.heroName,
            {
              color: heroInk,
              fontFamily: resolveProviderFontFamily(r.font),
              fontSize: 17 * resolveProviderFontScale(r.font),
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {look.name}
        </Text>
      </View>
      <View style={[card.body, { backgroundColor: r.sheetColor }]}>
        <View style={[card.pill, { backgroundColor: r.accentColor, borderRadius: r.shape === 'square' ? 0 : 7 }]}>
          <Text style={[card.pillText, { color: accentInk }]} numberOfLines={1}>
            {(PAGE_STYLES.find(s => s.key === r.pageStyle)?.name ?? '').toUpperCase()}
          </Text>
        </View>
        <View style={[card.serviceCard, { borderRadius: corner, borderColor: withAlpha(sheetInk, 0.12) }]}>
          <View style={[card.thumb, { backgroundColor: withAlpha(r.accentColor, 0.35), borderRadius: Math.max(0, corner - 3) }]} />
          <View style={card.lines}>
            <View style={[card.line, { backgroundColor: withAlpha(sheetInk, 0.22) }]} />
            <View style={[card.line, card.lineShort, { backgroundColor: withAlpha(sheetInk, 0.14) }]} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { gap: 12, paddingVertical: 4, paddingRight: 4 },
  option: { width: 128 },
  locked: { opacity: 0.6 },
  frame: { borderWidth: 1.5, borderRadius: 16, overflow: 'hidden' },
  frameOn: { borderWidth: 2.5 },
  badge: {
    position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  name: { fontFamily: 'BakbakOne-Regular', fontSize: 13, marginTop: 8 },
  description: { fontSize: 11, lineHeight: 14, marginTop: 2 },
});

const card = StyleSheet.create({
  root: { height: 168 },
  hero: { height: 84, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, overflow: 'hidden' },
  heroName: { textAlign: 'center' },
  body: { flex: 1, paddingHorizontal: 9, paddingTop: 9, gap: 7 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3 },
  pillText: { fontSize: 8, fontWeight: '700', letterSpacing: 1 },
  serviceCard: {
    flexDirection: 'row', alignItems: 'center', gap: 6, padding: 5,
    backgroundColor: 'rgba(255,255,255,0.75)', borderWidth: StyleSheet.hairlineWidth,
  },
  thumb: { width: 20, height: 20 },
  lines: { flex: 1, gap: 4 },
  line: { height: 4, borderRadius: 2, width: '90%' },
  lineShort: { width: '55%' },
});
