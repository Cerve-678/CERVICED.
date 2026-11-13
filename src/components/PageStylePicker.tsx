// src/components/PageStylePicker.tsx
//
// Branding → Page Style: a rail of small drawings of the profile, one per
// style, in the provider's own colours. Each drawing shows what that style
// changes — the logo frame, the heading voice and the card surface — rather
// than a screenshot, so it stays right for every colour set.

import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { PAGE_STYLES, type PageStyle, type PageStyleKey } from '../constants/pageStyles';
import { blend, isDarkColor, withAlpha } from '../constants/providerThemes';

interface Props {
  value: PageStyleKey;
  onChange: (key: PageStyleKey) => void;
  /** Link-only providers get Classic only; the rest show locked. */
  isLocked?: (key: PageStyleKey) => boolean;
  onLockedPress?: () => void;
  gradient: readonly string[];
  accent: string;
  sheet: string;
  textColor: string;
  subColor: string;
  borderColor: string;
}

export default function PageStylePicker({
  value,
  onChange,
  isLocked,
  onLockedPress,
  gradient,
  accent,
  sheet,
  textColor,
  subColor,
  borderColor,
}: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
    >
      {PAGE_STYLES.map(style => {
        const selected = value === style.key;
        const locked = isLocked?.(style.key) ?? false;
        return (
          <TouchableOpacity
            key={style.key}
            style={[styles.option, locked && styles.locked]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              if (locked) onLockedPress?.();
              else onChange(style.key);
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${style.name}: ${style.description}${locked ? ', locked' : ''}`}
          >
            <View style={[styles.frame, { borderColor: selected ? textColor : borderColor }, selected && styles.frameOn]}>
              <MiniProfile style={style} gradient={gradient} accent={accent} sheet={sheet} />
              {locked ? (
                <View style={styles.lock}>
                  <Ionicons name="lock-closed" size={12} color="#FFFFFF" />
                </View>
              ) : null}
            </View>
            <Text style={[styles.name, { color: selected ? textColor : subColor }]}>{style.name}</Text>
            <Text style={[styles.description, { color: subColor }]} numberOfLines={3}>{style.description}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const MINI_HEADING: Record<PageStyleKey, { lead?: string; text: string }> = {
  classic: { text: 'Services' },
  cover: { text: 'services' },
  arch: { lead: 'The', text: 'Menu' },
  framed: { text: 'Services' },
  scrapbook: { lead: 'THE', text: 'menu' },
  spa: { text: 'SERVICES' },
  glossy: { text: 'services' },
};

/** A tiny drawing of the profile top and one section in this style. */
function MiniProfile({
  style,
  gradient,
  accent,
  sheet,
}: {
  style: PageStyle;
  gradient: readonly string[];
  accent: string;
  sheet: string;
}) {
  const ink = isDarkColor(sheet) ? '#F2EDEA' : '#26201E';
  const line = withAlpha(ink, 0.18);
  const heroColours = (gradient.length >= 2 ? [gradient[0], gradient[1]] : [accent, sheet]) as [string, string];
  const heading = MINI_HEADING[style.key];

  const logo = (() => {
    switch (style.logo) {
      case 'arch':
        return <View style={[mini.logo, mini.logoArch, { backgroundColor: blend(accent, '#FFFFFF', 0.5) }]} />;
      case 'polaroid':
        return (
          <View style={mini.polaroid}>
            <View style={[mini.polaroidPhoto, { backgroundColor: blend(accent, '#FFFFFF', 0.5) }]} />
          </View>
        );
      case 'doubleRing':
        return (
          <View style={mini.doubleRing}>
            <View style={[mini.logo, { backgroundColor: blend(accent, '#FFFFFF', 0.5) }]} />
          </View>
        );
      case 'glossRing':
        return (
          <LinearGradient colors={['#FFFFFF', blend(accent, '#FFFFFF', 0.45), '#FFFFFF']} style={mini.glossRing}>
            <View style={[mini.logo, mini.logoNoRim, { backgroundColor: blend(accent, '#FFFFFF', 0.5) }]} />
          </LinearGradient>
        );
      default:
        return <View style={[mini.logo, { backgroundColor: blend(accent, '#FFFFFF', 0.5) }]} />;
    }
  })();

  const headingNode = (() => {
    switch (style.heading) {
      case 'bigLower':
        return <Text style={[mini.bigLower, { color: ink }]}>{heading.text}</Text>;
      case 'scriptPair':
        return (
          <View style={mini.pair}>
            <Text style={[mini.script, { color: ink }]}>{heading.lead}</Text>
            <Text style={[mini.serif, { color: ink }]}>{heading.text}</Text>
          </View>
        );
      case 'capsScript':
        return (
          <View style={mini.pairLeft}>
            <Text style={[mini.caps, { color: accent }]}>{heading.lead}</Text>
            <Text style={[mini.capsScript, { color: accent }]}>{heading.text}</Text>
          </View>
        );
      case 'spacedCaps':
        return <Text style={[mini.spaced, { color: withAlpha(ink, 0.7) }]}>{heading.text}</Text>;
      case 'bubbly':
        return <Text style={[mini.bubbly, { color: accent }]}>{heading.text}</Text>;
      case 'legend':
        return null;
      default:
        return <Text style={[mini.plain, { color: ink }]}>{heading.text}</Text>;
    }
  })();

  const card = (key: number) => {
    const base = [mini.card];
    switch (style.cards) {
      case 'none':
        return <View key={key} style={[mini.card, mini.cardNone, { borderBottomColor: line }]}><View style={[mini.bar, { backgroundColor: line }]} /></View>;
      case 'flat':
        return <View key={key} style={[mini.card, { backgroundColor: '#FFFFFF', borderRadius: 2 }]}><View style={[mini.bar, { backgroundColor: line }]} /></View>;
      case 'outline':
        return <View key={key} style={[mini.card, { borderWidth: 1, borderColor: withAlpha(accent, 0.6), borderRadius: 0 }]}><View style={[mini.bar, { backgroundColor: line }]} /></View>;
      case 'paper':
        return <View key={key} style={[mini.card, mini.paper]}><View style={[mini.bar, { backgroundColor: line }]} /></View>;
      case 'gloss':
        return (
          <View key={key} style={[mini.card, { backgroundColor: blend(accent, '#FFFFFF', 0.82), borderRadius: 10, borderWidth: 1, borderColor: withAlpha(accent, 0.35) }]}>
            <View style={mini.shine} />
            <View style={[mini.bar, { backgroundColor: withAlpha(ink, 0.25) }]} />
          </View>
        );
      default:
        return <View key={key} style={[...base, mini.frosted]}><View style={[mini.bar, { backgroundColor: line }]} /></View>;
    }
  };

  return (
    <View style={[mini.root, { backgroundColor: sheet }]}>
      <LinearGradient colors={heroColours} style={mini.hero}>
        {style.hero === 'cover' ? (
          <>
            <Text style={mini.coverName} numberOfLines={1}>Name</Text>
            <View style={mini.pillRow}>
              <View style={mini.pill} />
              <View style={mini.pill} />
            </View>
          </>
        ) : style.hero === 'masthead' ? (
          // Arch: the name on top, the arched logo beside the About.
          <>
            <Text style={mini.mastName} numberOfLines={1}>Name</Text>
            <View style={mini.sideRow}>
              <View style={mini.smallLogo}>{logo}</View>
              <View style={mini.sideLines}>
                <View style={mini.heroBar} />
                <View style={[mini.heroBar, mini.heroBarShort]} />
              </View>
            </View>
          </>
        ) : style.hero === 'sideBySide' ? (
          // Framed: the logo left, the name and About right.
          <View style={mini.sideRow}>
            <View style={mini.smallLogo}>{logo}</View>
            <View style={mini.sideLines}>
              <Text style={mini.sideName} numberOfLines={1}>Name</Text>
              <View style={mini.heroBar} />
              <View style={[mini.heroBar, mini.heroBarShort]} />
            </View>
          </View>
        ) : style.hero === 'spa' ? (
          // Spa: a quiet line, the name spaced out, the ringed logo.
          <>
            <Text style={mini.spaName} numberOfLines={1}>N A M E</Text>
            {logo}
          </>
        ) : style.hero === 'poster' ? (
          <>
            {logo}
            <Text style={mini.posterName} numberOfLines={1}>Name</Text>
          </>
        ) : logo}
      </LinearGradient>
      <View style={mini.body}>
        {style.policies === 'band' ? (
          <View style={[mini.band, { backgroundColor: accent }]} />
        ) : null}
        {style.heading === 'legend' ? (
          <View style={[mini.legendBox, { borderColor: withAlpha(accent, 0.6) }]}>
            <Text style={[mini.legend, { color: accent, backgroundColor: sheet }]}>Services</Text>
            <View style={[mini.bar, { backgroundColor: line, marginTop: 6 }]} />
            <View style={[mini.bar, mini.barShort, { backgroundColor: line }]} />
          </View>
        ) : (
          <>
            {headingNode}
            {card(0)}
            {card(1)}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { gap: 12, paddingVertical: 4, paddingRight: 4 },
  option: { width: 116 },
  locked: { opacity: 0.6 },
  frame: { borderWidth: 1.5, borderRadius: 16, overflow: 'hidden' },
  frameOn: { borderWidth: 2.5 },
  lock: {
    position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  name: { fontFamily: 'BakbakOne-Regular', fontSize: 13, marginTop: 8 },
  description: { fontSize: 11, lineHeight: 14, marginTop: 2 },
});

const mini = StyleSheet.create({
  root: { height: 180 },
  hero: { height: 76, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, paddingHorizontal: 9, paddingTop: 7, gap: 5 },
  logo: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)' },
  logoNoRim: { borderWidth: 0 },
  logoArch: { borderRadius: 3, borderTopLeftRadius: 15, borderTopRightRadius: 15, height: 34 },
  polaroid: { backgroundColor: '#FFFFFF', padding: 3, paddingBottom: 9, transform: [{ rotate: '-4deg' }] },
  polaroidPhoto: { width: 28, height: 28 },
  doubleRing: { padding: 3, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)' },
  glossRing: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  mastName: { fontFamily: 'Prata-Regular', fontSize: 15, color: '#FFFFFF', marginBottom: 2 },
  sideRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  smallLogo: { transform: [{ scale: 0.75 }] },
  sideLines: { flex: 1, gap: 4, alignItems: 'center' },
  sideName: { fontFamily: 'Prata-Regular', fontSize: 12, color: '#FFFFFF' },
  heroBar: { height: 4, width: '90%', borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.7)' },
  heroBarShort: { width: '60%' },
  spaName: { fontFamily: 'TenorSans_400Regular', fontSize: 9, letterSpacing: 2, color: '#FFFFFF', marginBottom: 3 },
  posterName: { fontFamily: 'Prata-Regular', fontSize: 14, color: '#FFFFFF', marginTop: 2 },
  coverName: { fontFamily: 'Syne_700Bold', fontSize: 22, color: '#FFFFFF', letterSpacing: -0.5 },
  pillRow: { flexDirection: 'row', gap: 4, marginTop: 3 },
  pill: { width: 24, height: 7, borderRadius: 4, backgroundColor: '#FFFFFF' },
  plain: { fontFamily: 'BakbakOne-Regular', fontSize: 11 },
  bigLower: { fontFamily: 'Syne_700Bold', fontSize: 17, letterSpacing: -0.5, lineHeight: 19 },
  pair: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 2 },
  pairLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  script: { fontFamily: 'PinyonScript_400Regular', fontSize: 15, lineHeight: 20 },
  serif: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 12, lineHeight: 16 },
  caps: { fontFamily: 'BebasNeue_400Regular', fontSize: 15, lineHeight: 17 },
  capsScript: { fontFamily: 'Sacramento_400Regular', fontSize: 16, lineHeight: 19 },
  spaced: { fontFamily: 'TenorSans_400Regular', fontSize: 7, letterSpacing: 2.2, textAlign: 'center', marginTop: 2 },
  bubbly: { fontFamily: 'Shrikhand_400Regular', fontSize: 13, textAlign: 'center' },
  legendBox: { borderWidth: 1, marginTop: 8, paddingHorizontal: 6, paddingTop: 10, paddingBottom: 8 },
  legend: {
    position: 'absolute', top: -8, alignSelf: 'center', fontFamily: 'Limelight_400Regular',
    fontSize: 10, paddingHorizontal: 4,
  },
  card: { height: 22, borderRadius: 8, justifyContent: 'center', paddingHorizontal: 6, overflow: 'hidden' },
  frosted: { backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(60,40,40,0.14)' },
  cardNone: { borderRadius: 0, borderBottomWidth: 1, height: 18 },
  paper: {
    backgroundColor: '#FFFFFF', borderRadius: 6,
    shadowColor: '#26201E', shadowOpacity: 0.18, shadowRadius: 3, shadowOffset: { width: 0, height: 2 },
    overflow: 'visible',
  },
  shine: { position: 'absolute', top: 2, left: 6, right: 6, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.7)' },
  bar: { height: 4, borderRadius: 2, width: '70%' },
  barShort: { width: '45%', marginTop: 4 },
  band: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 26, borderTopLeftRadius: 30, borderTopRightRadius: 10 },
});
