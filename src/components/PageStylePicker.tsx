// src/components/PageStylePicker.tsx
//
// Branding → Page Style: a rail of small drawings of the profile, one per
// style, in the provider's own colours. Each drawing shows what that style
// changes — the logo frame, the heading voice and the card surface — rather
// than a screenshot, so it stays right for every colour set.

import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import Svg, { Path } from 'react-native-svg';
import { PAGE_STYLES, type PageStyle, type PageStyleKey } from '../constants/pageStyles';
import { blend, isDarkColor, withAlpha } from '../constants/providerThemes';
import { BowGlyph, ribbonColours, stripeColours } from '../features/providers/heroes/demureOrnaments';
import { VeilBackdrop } from '../features/providers/heroes/SheerHero';
import { PagePattern } from '../features/providers/pageParts';

interface Props {
  value: PageStyleKey;
  onChange: (key: PageStyleKey) => void;
  /** Link-only providers get Classic only; the rest show locked. */
  isLocked?: (key: PageStyleKey) => boolean;
  onLockedPress?: () => void;
  gradient: readonly string[];
  accent: string;
  sheet: string;
  /** The theme's card colour: Gazette's front page is printed on it. */
  cardColour: string;
  textColor: string;
  subColor: string;
  borderColor: string;
  /** Their background photo: on the profile it fills the page behind the
   *  inset sheet, so every thumbnail shows it there too. */
  backgroundImage?: string | null;
}

export default function PageStylePicker({
  value,
  onChange,
  isLocked,
  onLockedPress,
  gradient,
  accent,
  sheet,
  cardColour,
  textColor,
  subColor,
  borderColor,
  backgroundImage = null,
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
              <MiniProfile style={style} gradient={gradient} accent={accent} sheet={sheet} cardColour={cardColour} backgroundImage={backgroundImage} />
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
  arch: { lead: 'The', text: 'Services' },
  framed: { text: 'Services' },
  scrapbook: { lead: 'THE', text: 'services' },
  spa: { text: 'SERVICES' },
  glossy: { text: 'services' },
  editorial: { lead: 'The', text: 'SERVICES' },
  heritage: { lead: 'The', text: 'SERVICES' },
  duet: { lead: 'The', text: 'SERVICES' },
  groovy: { text: 'the services' },
  gallery: { text: 'The Services' },
  apothecary: { text: 'THE SERVICES' },
  snapshot: { text: 'THE SERVICES' },
  signature: { lead: '03', text: 'The Services' },
  quiet: { text: 'THE SERVICES' },
  sheer: { text: 'THE SERVICES' },
  embossed: { text: 'THE SERVICES' },
  callingCard: { text: 'THE SERVICES' },
  boutique: { text: 'The Services' },
  gazette: { text: 'THE SERVICES' },
  novel: { lead: 'CHAPTER III', text: 'The Services' },
  studio: { lead: 'the', text: 'SERVICES' },
  lounge: { text: 'THE SERVICES' },
  softFocus: { text: 'THE SERVICES' },
  hush: { text: 'SERVICES' },
  stripes: { text: 'SERVICES' },
  bow: { text: 'The Services' },
  pure: { text: 'Services' },
  grid: { lead: '03', text: 'Services' },
  slate: { text: 'SERVICES' },
  halo: { text: 'SERVICES' },
  custom: { text: 'Services' },
  posy: { lead: 'the', text: 'Services' },
  riviera: { text: 'Services' },
  noir: { text: 'Services' },
  muse: { lead: 'the', text: 'Services' },
  retreat: { text: 'Services' },
  bonbon: { text: 'Services' },
  ledger: { text: 'Services' },
  portfolio: { text: 'Services' },
  atelier: { text: 'Services' },
  pinboard: { text: 'Services' },
  poster: { lead: 'The', text: 'Services' },
  hibiscus: { lead: 'The', text: 'Services' },
  storefront: { lead: 'The', text: 'Services' },
  orbit: { text: 'S E R V I C E S' },
  typeblock: { text: 'SERVICES' },
  filmstrip: { lead: '03', text: 'SERVICES' },
  receipt: { text: 'SERVICES' },
};

/** A tiny drawing of the profile top and one section in this style. */
function MiniProfile({
  style,
  gradient,
  accent,
  sheet,
  cardColour,
  backgroundImage,
}: {
  style: PageStyle;
  gradient: readonly string[];
  accent: string;
  sheet: string;
  cardColour: string;
  backgroundImage: string | null;
}) {
  // Sheer: on the profile the veil runs down the whole page and every section
  // sits on dark glass (veilPageTheme), so the thumbnail draws it that way too,
  // not as a dark top over a pale page.
  const veilPage = style.veilPage === true;
  const ink = veilPage || isDarkColor(sheet) ? '#F2EDEA' : '#26201E';
  const gazetteInk = isDarkColor(cardColour) ? '#FFFFFF' : '#1F1D1A';
  const line = withAlpha(ink, 0.18);
  const heroColours = (gradient.length >= 2 ? [gradient[0], gradient[1]] : [accent, sheet]) as [string, string];
  const heading = MINI_HEADING[style.key];
  const photoFill = blend(accent, '#FFFFFF', 0.55);

  // The divider the profile draws above a section heading.
  const dividerNode = (() => {
    switch (style.divider) {
      case 'wave':
        return (
          <Svg width={34} height={5} viewBox="0 0 34 5" style={mini.divider}>
            <Path d="M0 2.5 Q4.25 0 8.5 2.5 T17 2.5 T25.5 2.5 T34 2.5" stroke={accent} strokeWidth={1.2} fill="none" />
          </Svg>
        );
      case 'line':
        return <View style={[mini.divider, mini.dividerLine, { backgroundColor: withAlpha(accent, 0.7) }]} />;
      case 'stars':
        return <Text style={[mini.divider, mini.dividerGlyph, { color: accent }]}>✦ ✦ ✦</Text>;
      case 'sparkles':
        return (
          <Svg width={40} height={9} viewBox="0 0 40 9" style={mini.divider}>
            <Path d="M5 5 C 9 1, 31 0, 35 3.5 C 38 6, 30 8.5, 20 8.5 C 10 8.5, 2 7, 6 3" stroke={accent} strokeWidth={0.9} fill="none" />
          </Svg>
        );
      case 'dots':
        return (
          <View style={[mini.divider, mini.dividerDots]}>
            {[0, 1, 2].map(i => <View key={i} style={[mini.dividerDot, { backgroundColor: accent }]} />)}
          </View>
        );
      default:
        return null;
    }
  })();

  // Work first (Posy, Noir): a row of their photos in the style's own layout.
  const photoRow = (() => {
    switch (style.photoLayout) {
      case 'pins':
        return (
          <View style={[mini.photoRow, { alignItems: 'flex-start', gap: 4, paddingVertical: 3 }]}>
            {[25, 18, 28].map((height, i) => (
              <View key={i} style={{ flex: 1, height, borderRadius: 7, backgroundColor: photoFill }} />
            ))}
          </View>
        );
      case 'portfolioWall':
        return (
          <View style={[mini.photoRow, { alignItems: 'center', gap: 3, paddingVertical: 3 }]}>
            {[18, 27, 18].map((height, i) => (
              <View key={i} style={{ flex: 1, height, borderRadius: 3, backgroundColor: photoFill }} />
            ))}
          </View>
        );
      case 'arches':
        return (
          <View style={mini.photoRow}>
            {[0, 1, 2].map(i => <View key={i} style={[mini.archPhoto, { backgroundColor: photoFill }]} />)}
          </View>
        );
      case 'polaroids':
        return (
          <View style={mini.photoRow}>
            {[-4, 3, -2].map((tilt, i) => (
              <View key={i} style={[mini.polaroidPrint, { transform: [{ rotate: `${tilt}deg` }] }]}>
                <View style={[mini.polaroidPrintPhoto, { backgroundColor: photoFill }]} />
              </View>
            ))}
          </View>
        );
      case 'feature':
        return (
          <View style={mini.photoRow}>
            <View style={[mini.featureBig, { backgroundColor: photoFill }]} />
            <View style={mini.featureSide}>
              <View style={[mini.featureSmall, { backgroundColor: photoFill }]} />
              <View style={[mini.featureSmall, { backgroundColor: photoFill }]} />
            </View>
          </View>
        );
      case 'taped':
        return (
          <View style={[mini.photoRow, { justifyContent: 'center', gap: 8, paddingVertical: 4 }]}>
            {[-4, 4].map((tilt, i) => (
              <View key={i} style={[mini.polaroidPrint, { width: 26, transform: [{ rotate: `${tilt}deg` }] }]}>
                <View style={[mini.polaroidPrintPhoto, { backgroundColor: photoFill }]} />
                <View style={mini.tape} />
              </View>
            ))}
          </View>
        );
      case 'swipe':
        return (
          <View style={[mini.photoRow, mini.swipeRow]}>
            {[0, 1, 2, 3].map(i => <View key={i} style={[mini.swipePhoto, { backgroundColor: photoFill }]} />)}
          </View>
        );
      default:
        return (
          <View style={mini.photoRow}>
            <View style={[mini.masonryPhoto, mini.masonryTall, { backgroundColor: photoFill }]} />
            <View style={[mini.masonryPhoto, { backgroundColor: photoFill }]} />
          </View>
        );
    }
  })();

  // A service card's inside in the style's service layout: Posy's tiles (the
  // photo on top), Riviera's wide photo cards, Muse's printed menu line.
  const serviceInside = (() => {
    switch (style.serviceLayout) {
      case 'tiles':
        return (
          <>
            <View style={[mini.tilePhoto, { backgroundColor: photoFill }]} />
            <View style={[mini.bar, { backgroundColor: line }]} />
          </>
        );
      case 'photoCards':
        return (
          <>
            <View style={[mini.photoCardPhoto, { backgroundColor: photoFill }]} />
            <View style={[mini.bar, { backgroundColor: line }]} />
          </>
        );
      case 'pillMenu':
        return (
          <View style={mini.menuLine}>
            <View style={[mini.pillName, { backgroundColor: accent }]} />
            <View style={[mini.bar, mini.menuPrice, { backgroundColor: line }]} />
          </View>
        );
      case 'spotlight':
        return (
          <View style={mini.menuLine}>
            <View style={[mini.plate, { backgroundColor: photoFill }]} />
            <View style={[mini.bar, { flex: 1, backgroundColor: line }]} />
            <View style={[mini.arrowPill, { backgroundColor: accent }]} />
          </View>
        );
      case 'archTiles':
        return (
          <>
            <View style={[mini.archFrame, { backgroundColor: withAlpha(accent, 0.18) }]}>
              <View style={[mini.archFramePhoto, { backgroundColor: photoFill }]} />
            </View>
            <View style={[mini.bar, { backgroundColor: line }]} />
          </>
        );
      case 'menu':
        return (
          <View style={mini.menuLine}>
            <View style={[mini.bar, mini.menuName, { backgroundColor: line }]} />
            <View style={[mini.menuLeader, { borderBottomColor: withAlpha(ink, 0.35) }]} />
            <View style={[mini.bar, mini.menuPrice, { backgroundColor: line }]} />
          </View>
        );
      default:
        return null;
    }
  })();

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
      case 'tilted':
        return <View style={[mini.logo, mini.logoTilted, { backgroundColor: blend(accent, '#FFFFFF', 0.5) }]} />;
      case 'accentRing':
        return (
          <View style={[mini.ring, { borderColor: accent }]}>
            <View style={[mini.logo, { backgroundColor: blend(accent, '#FFFFFF', 0.5) }]} />
          </View>
        );
      case 'rounded':
        return <View style={[mini.logo, mini.logoNoRim, mini.logoRounded, { backgroundColor: blend(accent, '#FFFFFF', 0.5) }]} />;
      case 'sharp':
        return <View style={[mini.logo, mini.logoNoRim, mini.logoSharp, { backgroundColor: blend(accent, '#FFFFFF', 0.5) }]} />;
      case 'mat':
        return (
          <View style={mini.matFrame}>
            <View style={[mini.matPhoto, { backgroundColor: blend(accent, '#FFFFFF', 0.5) }]} />
          </View>
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
      case 'dotCaps':
        return (
          <Text style={[mini.dotLight, { color: ink }]} numberOfLines={1}>
            {heading.lead} <Text style={mini.dotBold}><Text style={{ color: accent }}>.</Text>{heading.text}</Text>
          </Text>
        );
      case 'italicCaps':
        return (
          <View style={mini.stack}>
            <Text style={[mini.italic, { color: accent }]}>{heading.lead}</Text>
            <Text style={[mini.cinzel, { color: ink }]}>{heading.text}</Text>
          </View>
        );
      case 'layered':
        return (
          <View style={mini.stack}>
            <Text style={[mini.vibes, { color: accent }]}>{heading.lead}</Text>
            <Text style={[mini.montserrat, { color: ink }]}>{heading.text}</Text>
          </View>
        );
      case 'groovy':
        return <Text style={[mini.groovy, { color: ink }]}>{heading.text}</Text>;
      case 'serifTitle':
        return <Text style={[mini.serifTitle, { color: ink }]}>{heading.text}</Text>;
      case 'condensed':
        return <Text style={[mini.condensed, { color: ink }]}>{heading.text}</Text>;
      case 'appBold':
        return <Text style={[mini.appBold, { color: ink }]}>{heading.text}</Text>;
      case 'gridIndex':
        return (
          <View style={mini.indexRow}>
            <Text style={[mini.gridNumber, { color: accent }]}>{heading.lead}</Text>
            <Text style={[mini.appBold, { color: ink }]}>{heading.text}</Text>
          </View>
        );
      case 'indexed':
        return (
          <View style={mini.indexRow}>
            <Text style={[mini.indexNumber, { color: accent }]}>{heading.lead}</Text>
            <Text style={[mini.indexTitle, { color: ink }]}>{heading.text}</Text>
          </View>
        );
      case 'labelCaps':
        return <Text style={[mini.labelCaps, { color: ink }]}>{heading.text}</Text>;
      case 'quietCaps':
        return <Text style={[mini.quietCaps, { color: ink }]}>{heading.text}</Text>;
      case 'sheerCaps':
        return <Text style={[mini.sheerCaps, { color: ink }]}>{heading.text}</Text>;
      case 'embossCaps':
        // Paper-coloured caps with a shaded edge, as on the profile.
        return (
          <Text style={[mini.embossCaps, { color: sheet, textShadowColor: withAlpha(isDarkColor(sheet) ? '#000000' : '#463428', 0.45) }]}>
            {heading.text}
          </Text>
        );
      case 'engravedCaps':
        return <Text style={[mini.engravedCaps, { color: ink }]}>{heading.text}</Text>;
      case 'receiptCaps':
        return (
          <View style={{ alignSelf: 'stretch' }}>
            <Text style={[mini.receiptCaps, { color: ink }]}>{heading.text}</Text>
            <View style={[mini.receiptRule, { borderColor: withAlpha(ink, 0.5) }]} />
          </View>
        );
      case 'shopSerif':
        return <Text style={[mini.shopSerif, { color: ink }]}>{heading.text}</Text>;
      case 'newsRule':
        return (
          <View style={[mini.newsRule, { borderColor: ink }]}>
            <Text style={[mini.newsTitle, { color: ink }]}>{heading.text}</Text>
          </View>
        );
      case 'chunkyCaps':
        return (
          <Text style={[mini.chunkyCaps, { color: ink }]}>
            <Text style={[mini.chunkyScript, { color: accent }]}>{heading.lead} </Text>
            {heading.text}
          </Text>
        );
      case 'loungeCaps':
        return <Text style={[mini.loungeCaps, { color: ink }]}>{heading.text}</Text>;
      case 'softCaps':
        return <Text style={[mini.softCaps, { color: ink }]}>{heading.text}</Text>;
      case 'hushRule':
        return (
          <View style={mini.hushRow}>
            <View style={[mini.hushLine, { backgroundColor: line }]} />
            <Text style={[mini.hushCaps, { color: withAlpha(ink, 0.7) }]}>{heading.text}</Text>
            <View style={[mini.hushLine, { backgroundColor: line }]} />
          </View>
        );
      case 'stripeCaps':
        return <Text style={[mini.stripeCaps, { color: ink }]}>{heading.text}</Text>;
      case 'bowSerif':
        return (
          <View style={mini.stack}>
            <BowGlyph width={14} accent={accent} />
            <Text style={[mini.bowTitle, { color: ink }]}>{heading.text}</Text>
          </View>
        );
      case 'twoToneCaps':
        return (
          <View style={{ alignSelf: 'flex-start' }}>
            <Text style={[mini.twoTone, { color: ink }]}>{(heading.lead ?? '').toUpperCase()}</Text>
            <Text style={[mini.twoTone, { color: isDarkColor(sheet) ? blend(accent, '#FFFFFF', 0.5) : accent }]}>{heading.text.toUpperCase()}</Text>
          </View>
        );
      case 'enjoyStack':
        return (
          <View style={mini.stack}>
            <Text style={[mini.enjoyLead, { color: ink }]}>{(heading.lead ?? '').toUpperCase()}</Text>
            <Text style={[mini.enjoyTitle, { color: accent }]}>{heading.text.toUpperCase()}</Text>
          </View>
        );
      case 'slantCaps':
        return (
          <View style={mini.stack}>
            <Text style={[mini.enjoyLead, { color: withAlpha(ink, 0.5) }]}>{(heading.lead ?? '').toUpperCase()}</Text>
            <Text style={[mini.slantTitle, { color: ink }]}>{heading.text.toUpperCase()}</Text>
          </View>
        );
      case 'chapter':
        return (
          <View style={mini.stack}>
            <Text style={[mini.chapterNumber, { color: withAlpha(ink, 0.7) }]}>{heading.lead}</Text>
            <Text style={[mini.chapterTitle, { color: ink }]}>{heading.text}</Text>
          </View>
        );
      case 'custom': {
        // The styles built from Custom's parts: the heading in their own font,
        // drawn the way their style draws it.
        const c = style.custom;
        if (!c) return <Text style={[mini.plain, { color: ink }]}>{heading.text}</Text>;
        const font = { fontFamily: c.headingFont, color: ink };
        switch (c.headingStyle) {
          case 'script':
            return (
              <View style={mini.stack}>
                <Text style={[mini.script, { fontFamily: c.scriptFont ?? 'PinyonScript_400Regular', color: accent }]}>{heading.lead}</Text>
                <Text style={[mini.customCaps, font]}>{heading.text.toUpperCase()}</Text>
              </View>
            );
          case 'caps':
            return <Text style={[mini.customCaps, font]}>{heading.text.toUpperCase()}</Text>;
          case 'numbered':
            return (
              <View style={mini.customRow}>
                <Text style={[mini.customNumber, { color: accent }]}>01</Text>
                <Text style={[mini.customTitle, font]}>{heading.text}</Text>
              </View>
            );
          case 'underlined':
            return (
              <View>
                <Text style={[mini.customTitle, font]}>{heading.text}</Text>
                <View style={[mini.customBar, { backgroundColor: accent }]} />
              </View>
            );
          default:
            return <Text style={[mini.customTitle, font]}>{heading.text}</Text>;
        }
      }
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
      case 'open':
      case 'ruled':
        return <View key={key} style={[mini.card, mini.cardNone, { borderBottomColor: line }]}><View style={[mini.bar, { backgroundColor: line }]} /></View>;
      case 'offset':
      case 'chunky':
        return (
          <View
            key={key}
            style={[
              mini.card,
              mini.hard,
              { borderWidth: style.cards === 'chunky' ? 1.5 : 1, shadowColor: style.cards === 'chunky' ? accent : blend(accent, '#FFFFFF', 0.5) },
            ]}
          >
            <View style={[mini.bar, { backgroundColor: line }]} />
          </View>
        );
      case 'block':
        return <View key={key} style={[mini.card, mini.blockCard]}><View style={[mini.bar, { backgroundColor: line }]} /></View>;
      case 'topRule':
        return <View key={key} style={[mini.card, mini.topRuleCard]}><View style={[mini.bar, { backgroundColor: line }]} /></View>;
      case 'label':
        return <View key={key} style={[mini.card, mini.labelCard]}><View style={[mini.bar, { backgroundColor: line }]} /></View>;
      case 'sheer':
        return <View key={key} style={[mini.card, mini.sheerCard, { borderColor: withAlpha(ink, 0.42) }]}><View style={[mini.bar, { backgroundColor: line }]} /></View>;
      case 'raised':
        return <View key={key} style={[mini.card, mini.raisedCard]}><View style={[mini.bar, { backgroundColor: line }]} /></View>;
      case 'clipped':
        return <View key={key} style={[mini.card, mini.paper, mini.clippedCard]}><View style={[mini.bar, { backgroundColor: line }]} /></View>;
      case 'product':
        return <View key={key} style={[mini.card, mini.productCard]}><View style={[mini.bar, { backgroundColor: line }]} /></View>;
      case 'tabbed':
        return (
          <View key={key}>
            <View style={[mini.studioTab, { backgroundColor: cardColour }]} />
            <View style={[mini.card, { backgroundColor: cardColour, borderRadius: 0 }]}><View style={[mini.bar, { backgroundColor: line }]} /></View>
          </View>
        );
      case 'pages':
        return <View key={key} style={[mini.card, mini.pagesCard]}><View style={[mini.bar, { backgroundColor: line }]} /></View>;
      case 'outlineRound':
        return <View key={key} style={[mini.card, mini.roundCard, { backgroundColor: cardColour, borderWidth: 1, borderColor: isDarkColor(cardColour) ? '#F2EDEA' : '#1F1A1C' }]}><View style={[mini.bar, { backgroundColor: line }]} /></View>;
      case 'stripes': {
        const stripe = stripeColours(accent);
        return (
          <View key={key} style={[mini.stripeBand, { backgroundColor: key % 2 === 0 ? stripe.soft : 'transparent', borderColor: key % 2 === 0 ? stripe.line : 'transparent' }]}>
            {style.openStrips ? (
              // Riviera: the content straight on its strip.
              <View style={[mini.bar, { backgroundColor: line }]} />
            ) : (
              <View style={[mini.card, mini.stripeBox, { backgroundColor: cardColour, borderColor: stripe.line }]}><View style={[mini.bar, { backgroundColor: line }]} /></View>
            )}
          </View>
        );
      }
      case 'grouped':
        return <View key={key} style={[mini.card, mini.groupedCard, { backgroundColor: cardColour }]}><View style={[mini.bar, { backgroundColor: line }]} /></View>;
      case 'receipt':
        return <View key={key} style={[mini.card, { backgroundColor: cardColour, borderRadius: 0, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(ink, 0.2) }]}><View style={[mini.bar, { backgroundColor: line }]} /></View>;
      case 'gridBox':
        return <View key={key} style={[mini.card, mini.gridCard, { backgroundColor: cardColour, borderColor: withAlpha(ink, 0.3) }]}><View style={[mini.bar, { backgroundColor: line }]} /></View>;
      case 'soft':
      case 'bow':
        return <View key={key} style={[mini.card, mini.roundCard, { backgroundColor: cardColour }]}><View style={[mini.bar, { backgroundColor: line }]} /></View>;
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

  // A service card with the style's service layout inside it.
  const serviceCard = (key: number) => {
    const el = card(key);
    if (!serviceInside || !React.isValidElement<{ style?: unknown; children?: React.ReactNode }>(el)) return el;
    return React.cloneElement(el, {
      style: [el.props.style, mini.layoutCard, (style.serviceLayout === 'tiles' || style.serviceLayout === 'archTiles') && mini.tileCard],
      children: serviceInside,
    });
  };
  const pinnedInk = withAlpha(isDarkColor(cardColour) ? '#FFFFFF' : '#26201E', 0.25);

  return (
    <View style={[mini.root, { backgroundColor: sheet }]}>
      {/* As on the profile: their background photo fills the page behind the
          hero and down the sides of the inset sheet. */}
      {backgroundImage ? (
        <>
          <Image source={{ uri: backgroundImage }} style={[StyleSheet.absoluteFill, mini.backgroundPhoto]} resizeMode="cover" fadeDuration={0} />
          <LinearGradient
            colors={['rgba(0,0,0,0.38)', 'rgba(0,0,0,0.18)', 'transparent']}
            locations={[0, 0.35, 0.62]}
            style={StyleSheet.absoluteFill}
          />
        </>
      ) : veilPage ? (
        <LinearGradient colors={heroColours} style={StyleSheet.absoluteFill} />
      ) : null}
      {veilPage ? <VeilBackdrop /> : null}
      <LinearGradient colors={veilPage || backgroundImage ? ['transparent', 'transparent'] : heroColours} style={mini.hero}>
        {style.hero === 'orbitMark' ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 70, height: 70, borderRadius: 35, borderWidth: 1, borderColor: line, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 54, height: 54, borderRadius: 27, borderWidth: 1, borderColor: ink, alignItems: 'center', justifyContent: 'center' }}>{logo}</View>
              <View style={{ position: 'absolute', top: 5, right: 3, width: 7, height: 7, borderRadius: 4, backgroundColor: accent }} />
            </View>
            <Text style={{ color: ink, fontFamily: 'PoiretOne_400Regular', fontSize: 13, marginTop: 5 }}>NAME</Text>
          </View>
        ) : style.hero === 'typeblockMark' ? (
          <View style={{ flex: 1, flexDirection: 'row', padding: 9, gap: 7 }}>
            <View style={{ width: 7, backgroundColor: accent }} />
            <View style={{ flex: 1, justifyContent: 'space-between' }}>
              <View style={{ alignSelf: 'flex-end' }}>{logo}</View>
              <View>
                <Text style={{ color: ink, fontFamily: 'BebasNeue_400Regular', fontSize: 27, lineHeight: 28 }}>YOUR{String.fromCharCode(10)}NAME</Text>
                <View style={{ height: 3, backgroundColor: accent, marginTop: 3 }} />
              </View>
            </View>
          </View>
        ) : style.hero === 'filmstripMark' ? (
          <View style={{ flex: 1, padding: 8, justifyContent: 'center' }}>
            <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: ink, paddingVertical: 4 }}>
              <Text style={{ color: ink, fontSize: 6, letterSpacing: 1, marginBottom: 3 }}>SELECTED WORK  01—02</Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <View style={{ flex: 1, height: 37, backgroundColor: photoFill }} />
                <View style={{ flex: 1, height: 37, backgroundColor: blend(accent, '#FFFFFF', 0.7) }} />
              </View>
            </View>
            <Text style={{ color: ink, fontFamily: 'TenorSans_400Regular', fontSize: 11, marginTop: 6 }}>Your Name</Text>
          </View>
        ) : style.hero === 'posterCover' ? (
          // Poster: a pill, the name in two-tone caps, a taped print.
          <View style={mini.posterCoverHero}>
            <View style={[mini.posterCoverPill, { backgroundColor: blend(accent, '#FFFFFF', isDarkColor(heroColours[0]) ? 0.5 : 0) }]} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={[mini.posterCoverName, { color: isDarkColor(heroColours[0]) ? '#FFF4EE' : '#26201E' }]} numberOfLines={1}>NAME</Text>
                <Text style={[mini.posterCoverName, { color: blend(accent, '#FFFFFF', isDarkColor(heroColours[0]) ? 0.5 : 0) }]} numberOfLines={1}>HERE</Text>
              </View>
              <View style={[mini.polaroidPrint, { width: 30, transform: [{ rotate: '5deg' }] }]}>
                <View style={[mini.polaroidPrintPhoto, { backgroundColor: photoFill }]} />
                <View style={mini.tape} />
              </View>
            </View>
          </View>
        ) : style.hero === 'receiptHead' ? (
          // Receipt: a white slip with a name in spaced caps and a barcode.
          <View style={mini.receiptHero}>
            <View style={[mini.receiptSlip, { backgroundColor: cardColour }]}>
              {logo}
              <Text style={[mini.receiptName, { color: isDarkColor(cardColour) ? '#F7F1F3' : '#1F1A1C' }]}>NAME</Text>
              <View style={[mini.receiptBars, { borderColor: isDarkColor(cardColour) ? '#F7F1F3' : '#1F1A1C' }]} />
            </View>
          </View>
        ) : style.hero === 'echoName' ? (
          // Hibiscus: the name echoed faintly behind a photo and a deep round panel.
          <View style={mini.echoHero}>
            {[0, 1, 2, 3].map(i => (
              <Text key={i} style={[mini.echoRow, { color: withAlpha(isDarkColor(heroColours[0]) ? '#FFFFFF' : '#26201E', 0.1) }]} numberOfLines={1}>NAME NAME NAME</Text>
            ))}
            <View style={[mini.echoPhoto, { backgroundColor: photoFill }]} />
            <View style={[mini.echoPanel, { backgroundColor: blend(accent, '#000000', 0.45) }]}>
              <Text style={[mini.echoName, { color: blend(accent, '#FFFFFF', 0.62) }]} numberOfLines={1}>NAME</Text>
            </View>
          </View>
        ) : style.hero === 'storefrontBanner' ? (
          // Storefront: a full-width photo, then a soft band with the name in slanted caps.
          <View style={mini.storeHero}>
            <View style={[mini.storePhoto, { backgroundColor: photoFill }]}>
              <View style={mini.smallLogo}>{logo}</View>
            </View>
            <View style={[mini.storeBand, { backgroundColor: blend(accent, '#FFFFFF', 0.82) }]}>
              <Text style={[mini.slantTitle, { color: blend(accent, '#1A0F12', 0.55) }]} numberOfLines={1}>NAME</Text>
            </View>
          </View>
        ) : style.hero === 'pinboardHeader' ? (
          // Pinboard: three rounded pins side by side at uneven heights, then the logo beside the name.
          <View style={mini.pinHero}>
            <View style={mini.pinBoard}>
              {[44, 34, 39].map((height, i) => (
                <View key={i} style={[mini.pin, { height, backgroundColor: photoFill }]} />
              ))}
            </View>
            <View style={mini.pinIdentity}>
              <View style={mini.pinLogo}>{logo}</View>
              <Text style={[mini.pinName, { color: isDarkColor(heroColours[0]) ? '#FFFFFF' : '#26201E' }]} numberOfLines={1}>Name</Text>
            </View>
          </View>
        ) : style.hero === 'atelierLetterhead' ? (
          <View style={{ paddingHorizontal: 8, paddingTop: 9 }}>
            <View style={{ height: 1, backgroundColor: withAlpha(isDarkColor(heroColours[0]) ? '#FFFFFF' : '#26201E', 0.6) }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 }}>
              <View style={{ width: 28, height: 2, backgroundColor: withAlpha(accent, 0.8) }} />
              <View style={mini.smallLogo}>{logo}</View>
            </View>
            <Text style={{ fontFamily: 'Bellefair-Regular', fontSize: 21, color: isDarkColor(heroColours[0]) ? '#FFFFFF' : '#26201E' }} numberOfLines={1}>Atelier</Text>
            <View style={{ height: 1, backgroundColor: withAlpha(isDarkColor(heroColours[0]) ? '#FFFFFF' : '#26201E', 0.6) }} />
          </View>
        ) : style.hero === 'portfolioFront' ? (
          <View style={{ paddingHorizontal: 5, paddingTop: 5 }}>
            <View style={{ height: 41, borderRadius: 5, backgroundColor: photoFill, overflow: 'hidden' }}>
              {backgroundImage ? <Image source={{ uri: backgroundImage }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 }}>
              <View style={mini.smallLogo}>{logo}</View>
              <Text style={{ fontFamily: 'GildaDisplay-Regular', fontSize: 13, color: isDarkColor(heroColours[0]) ? '#FFFFFF' : '#26201E' }} numberOfLines={1}>Name</Text>
            </View>
          </View>
        ) : style.hero === 'cover' ? (
          <>
            <View style={[mini.coverLogo, { backgroundColor: blend(accent, '#FFFFFF', 0.5) }]} />
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
        ) : style.hero === 'appHeader' ? (
          // Pure: the logo left, the name and a line beside it.
          <View style={[mini.sideRow, mini.appRow]}>
            <View style={mini.smallLogo}>{logo}</View>
            <View style={mini.sideLinesLeft}>
              <Text style={mini.appName} numberOfLines={1}>Name</Text>
              <View style={[mini.heroBar, mini.heroBarShort]} />
            </View>
          </View>
        ) : style.hero === 'archWindow' ? (
          // Retreat: their photo in an arched window, the name under it.
          <View style={mini.archWindowHero}>
            <View style={[mini.archWindow, { backgroundColor: blend(accent, '#FFFFFF', 0.35) }]} />
            <Text style={mini.archWindowName} numberOfLines={1}>Name</Text>
          </View>
        ) : style.hero === 'colourBlock' ? (
          // Riviera: the name in a fat italic on a block of the accent, the logo over its corner.
          <View style={[mini.colourBlock, { backgroundColor: accent }]}>
            <Text style={[mini.colourBlockName, { color: isDarkColor(accent) ? '#FFFFFF' : '#1A1512' }]} numberOfLines={1}>Name</Text>
            <View style={mini.colourBlockLogo}>{logo}</View>
          </View>
        ) : style.hero === 'split' ? (
          // Posy: their photo down the left half, the logo and name on the right.
          <View style={mini.splitHero}>
            <View style={[mini.splitPhoto, { backgroundColor: blend(accent, '#FFFFFF', 0.35) }]} />
            <View style={mini.splitSide}>
              <View style={mini.smallLogo}>{logo}</View>
              <Text style={mini.splitName} numberOfLines={1}>Name</Text>
            </View>
          </View>
        ) : style.hero === 'gridHeader' ? (
          // Grid: the logo and name in a box of fine lines, a ruled cell under it.
          <View style={mini.gridHero}>
            <View style={[mini.sideRow, mini.gridHeroTop]}>
              <View style={mini.smallLogo}>{logo}</View>
              <Text style={mini.appName} numberOfLines={1}>Name</Text>
            </View>
            <View style={mini.gridHeroFoot}>
              <View style={[mini.heroBar, mini.heroBarShort]} />
            </View>
          </View>
        ) : style.hero === 'slateHeader' ? (
          <View style={mini.slateHero}>
            <View style={mini.slateHeroRow}>
              <Text style={[mini.slateHeroName, { color: isDarkColor(heroColours[0]) ? '#FFFFFF' : '#1F1A1C' }]} numberOfLines={1}>Name</Text>
              <View style={mini.smallLogo}>{logo}</View>
            </View>
            <View style={[mini.slateHeroRule, { backgroundColor: accent }]} />
            <View style={[mini.heroBar, mini.heroBarShort]} />
          </View>
        ) : style.hero === 'haloHeader' ? (
          <View style={mini.haloHero}>
            <View style={[mini.haloHeroRing, { borderColor: withAlpha(accent, 0.8) }]}>{logo}</View>
            <Text style={[mini.haloHeroName, { color: isDarkColor(heroColours[0]) ? '#FFFFFF' : '#1F1A1C' }]} numberOfLines={1}>Name</Text>
          </View>
        ) : style.hero === 'spa' ? (
          // Spa: a quiet line, the name spaced out, the ringed logo.
          <>
            <Text style={mini.spaName} numberOfLines={1}>N A M E</Text>
            {logo}
          </>
        ) : style.hero === 'editorial' ? (
          // Editorial: the name left in light and bold, a tilted card right.
          <View style={mini.sideRow}>
            <View style={mini.sideLinesLeft}>
              <Text style={mini.edLight} numberOfLines={1}>Name</Text>
              <Text style={mini.edBold} numberOfLines={1}>NAME<Text style={{ color: blend(accent, '#FFFFFF', 0.5) }}>.</Text></Text>
            </View>
            <View style={mini.smallLogo}>{logo}</View>
          </View>
        ) : style.hero === 'crest' ? (
          // Heritage: a dotted seal round the logo.
          <View style={mini.seal}>{logo}</View>
        ) : style.hero === 'duet' ? (
          // Duet: a welcome card in their card colour.
          <View style={[mini.welcome, { backgroundColor: cardColour }]}>
            <View style={[mini.welcomeLogo, { borderColor: accent }]} />
            <Text style={[mini.duetScript, { color: accent }]} numberOfLines={1}>Name</Text>
          </View>
        ) : style.hero === 'groovy' ? (
          // Groovy: the name on a tilted pill.
          <View style={[mini.badge, { backgroundColor: accent }]}>
            <Text style={mini.groovyName} numberOfLines={1}>name</Text>
          </View>
        ) : style.hero === 'exhibition' ? (
          <View style={mini.sideRow}>
            <Text style={mini.galleryName} numberOfLines={2}>Name</Text>
            <View style={mini.smallLogo}>{logo}</View>
          </View>
        ) : style.hero === 'labelCard' ? (
          // Apothecary: the logo, then the name on a double-ruled label.
          <>
            {logo}
            <View style={[mini.labelHero, { backgroundColor: cardColour, borderColor: isDarkColor(cardColour) ? '#F2EDEA' : '#1F1A1C' }]}>
              <View style={[mini.labelHeroInner, { borderColor: withAlpha(accent, 0.7) }]} />
              <Text style={[mini.tagName, { color: isDarkColor(cardColour) ? '#F7F1F3' : '#1F1A1C' }]} numberOfLines={1}>NAME</Text>
            </View>
          </>
        ) : style.hero === 'blockName' ? (
          // Snapshot: photos edge to edge, the name on an accent block.
          <View style={mini.blockHero}>
            <View style={mini.blockPhotos}>
              <View style={mini.blockPhoto} />
              <View style={[mini.blockPhoto, mini.blockPhotoMid]} />
              <View style={mini.blockPhoto} />
            </View>
            <View style={[mini.blockBox, { backgroundColor: accent }]}>
              <Text style={mini.blockName} numberOfLines={1}>NAME</Text>
            </View>
          </View>
        ) : style.hero === 'signed' ? (
          <View style={mini.stack}>
            {logo}
            <Text style={mini.signedName} numberOfLines={1}>Name</Text>
          </View>
        ) : style.hero === 'quietBand' ? (
          <View style={mini.quietBand}>
            <Text style={mini.quietName} numberOfLines={1}>NAME</Text>
          </View>
        ) : style.hero === 'veil' ? (
          // Sheer: an oval round the logo and spaced caps, on the page's veil.
          <View style={mini.veil}>
            <View style={mini.veilOval}>
              <View style={[mini.veilLogo, { backgroundColor: blend(accent, '#FFFFFF', 0.5) }]} />
            </View>
            <Text style={mini.veilName} numberOfLines={1}>N A M E</Text>
          </View>
        ) : style.hero === 'pressed' ? (
          // Embossed: the name raised straight out of the theme backdrop.
          <Text style={[mini.pressName, { color: blend(heroColours[0], '#FFFFFF', isDarkColor(heroColours[0]) ? 0.14 : 0.3) }]} numberOfLines={1}>NAME</Text>
        ) : style.hero === 'callingCard' ? (
          // Calling Card: satin in the theme colour, and a cream card held by a clip.
          <>
            <LinearGradient
              colors={[blend(heroColours[0], '#000000', 0.25), heroColours[0], blend(heroColours[0], '#000000', 0.25), blend(heroColours[0], '#FFFFFF', 0.35), blend(heroColours[0], '#000000', 0.25)]}
              start={{ x: 0, y: 0.2 }}
              end={{ x: 1, y: 0.8 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={mini.callingCard}>
              <View style={[mini.callingClip, { backgroundColor: accent }]} />
              {logo}
              <Text style={[mini.callingName, { color: blend(accent, '#000000', 0.4) }]} numberOfLines={1}>Name</Text>
            </View>
          </>
        ) : style.hero === 'productPage' ? (
          // Boutique: a product page, the logo on their colour, their card colour under it with the name.
          <View style={mini.productWrap}>
            <View style={[mini.productPhoto, { backgroundColor: accent }]}>{logo}</View>
            <View style={[mini.productPanel, { backgroundColor: cardColour }]}>
              <Text style={[mini.productTitle, { color: isDarkColor(cardColour) ? '#F7F1F3' : '#1F1A1C' }]} numberOfLines={1}>Name</Text>
            </View>
          </View>
        ) : style.hero === 'gazette' ? (
          // Gazette: a newsprint front page with a blackletter masthead.
          <View style={[mini.newsPaper, { backgroundColor: cardColour }]}>
            <View style={[mini.paperRule, { borderColor: gazetteInk }]} />
            <Text style={[mini.blackletter, { color: gazetteInk }]} numberOfLines={1}>The Gazette</Text>
            <View style={[mini.paperRule, { borderColor: gazetteInk }]} />
            <Text style={[mini.headline, { color: gazetteInk }]} numberOfLines={1}>AMARA</Text>
          </View>
        ) : style.hero === 'studio' ? (
          // Studio: a deep bar with the pressed wordmark, then a photo with huge caps across it.
          <View style={mini.studioWrap}>
            <View style={[mini.studioBar, { backgroundColor: blend(accent, '#000000', isDarkColor(accent) ? 0.25 : 0.5) }]}>
              <Text style={[mini.studioHeadline, { color: blend(accent, '#FFFFFF', 0.72) }]} numberOfLines={1}>
                LASHES<Text style={mini.studioScript}> & </Text>BROWS.
              </Text>
            </View>
            <View style={[mini.studioPhoto, { backgroundColor: accent }]}>
              <View style={mini.studioLogo}>{logo}</View>
              <Text style={[mini.studioWordmark, { color: blend(accent, '#000000', isDarkColor(accent) ? 0.3 : 0.18) }]} numberOfLines={1}>amara.</Text>
            </View>
          </View>
        ) : style.hero === 'lounge' ? (
          // Lounge: a rounded-top panel of their colour, the name in tall caps cut out of the page near its foot.
          <View style={[mini.loungePanel, { backgroundColor: accent }]}>
            <Text style={[mini.loungeName, { color: sheet }]} numberOfLines={1}>NAME</Text>
          </View>
        ) : style.hero === 'softCard' ? (
          // Soft Focus: a tinted card with a wave, the round logo beside heavy caps.
          <View style={[mini.softCard, { backgroundColor: blend(accent, '#FFFFFF', 0.72) }]}>
            <View style={[mini.softWave, { backgroundColor: blend(accent, '#FFFFFF', 0.5) }]} />
            <View style={[mini.logo, mini.softLogo, { backgroundColor: blend(accent, '#FFFFFF', 0.5) }]} />
            <Text style={mini.softName} numberOfLines={2}>NAME</Text>
          </View>
        ) : style.hero === 'hushFan' ? (
          // Hush: the name in light italic over three photos in their own boxes.
          <View style={mini.stack}>
            <Text style={mini.hushName} numberOfLines={1}>name</Text>
            <View style={mini.hushBoxes}>
              {[0, 1, 2].map(index => (
                <View key={index} style={[mini.hushBox, { backgroundColor: sheet }]}>
                  <View style={[mini.hushBoxPhoto, { backgroundColor: blend(accent, '#FFFFFF', 0.45) }]} />
                </View>
              ))}
            </View>
          </View>
        ) : style.hero === 'stripes' ? (
          // Stripes: a full-width strip of their colour, a pearl-ringed logo, the name in spaced serif caps.
          <View style={[mini.stripeHero, { backgroundColor: stripeColours(accent).strong, borderColor: stripeColours(accent).line }]}>
            <View style={[mini.logo, mini.stripeLogo]} />
            <Text style={[mini.stripeName, { color: isDarkColor(stripeColours(accent).strong) ? '#F7F1F3' : '#1F1A1C' }]} numberOfLines={1}>NAME</Text>
          </View>
        ) : style.hero === 'bow' ? (
          // Bow: their photo with a ribbon down it and a bow on top.
          <View style={mini.bowWrap}>
            <View style={[mini.bowPhoto, { backgroundColor: blend(accent, '#FFFFFF', 0.6) }]}>
              <View style={[mini.bowRibbon, { backgroundColor: ribbonColours(accent).satin }]} />
            </View>
            <View style={mini.bowKnot}><BowGlyph width={22} accent={accent} /></View>
            <Text style={mini.bowName} numberOfLines={1}>Name</Text>
          </View>
        ) : style.hero === 'titlePage' ? (
          // Novel: a title page, the logo ringed, the name in old type over an ornament.
          <>
            <View style={[mini.doubleRing, { borderColor: blend(accent, '#FFFFFF', 0.4) }]}>{logo}</View>
            <Text style={mini.titlePageName} numberOfLines={1}>Name</Text>
            <View style={[mini.titlePageRule, { backgroundColor: blend(accent, '#FFFFFF', 0.4) }]} />
          </>
        ) : style.hero === 'poster' ? (
          <>
            {logo}
            <Text style={mini.posterName} numberOfLines={1}>Name</Text>
          </>
        ) : logo}
      </LinearGradient>
      <View style={[mini.body, veilPage ? mini.veilGlass : backgroundImage ? [mini.floatingBody, { backgroundColor: sheet }] : null]}>
        {style.pagePattern ? <PagePattern pattern={style.pagePattern} accent={accent} onDark={isDarkColor(sheet)} /> : null}
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
            {style.portfolioFirst ? photoRow : null}
            {dividerNode}
            {headingNode}
            {style.serviceLayout === 'tiles' ? (
              <View style={mini.tileRow}>
                {serviceCard(0)}
                {serviceCard(1)}
              </View>
            ) : (
              <>
                {serviceCard(0)}
                {serviceCard(1)}
              </>
            )}
          </>
        )}
      </View>
      {/* Riviera: the Book bar pinned over the foot of the page. */}
      {style.pinnedBookBar ? (
        <View style={[mini.pinnedBar, style.buttonShape === 'square' && mini.pinnedBarSquare, { backgroundColor: cardColour }]}>
          <View style={[mini.bar, mini.pinnedBarText, { backgroundColor: pinnedInk }]} />
          <View style={[mini.pinnedBarButton, style.buttonShape === 'square' && mini.pinnedBarSquare, { backgroundColor: accent }]} />
        </View>
      ) : null}
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
  // The demure set (2026-11-16).
  roundCard: { borderRadius: 10 },
  loungeCaps: { fontFamily: 'LeagueGothic-Regular', fontSize: 15, lineHeight: 20, letterSpacing: 0.4, textAlign: 'center' },
  softCaps: { fontFamily: 'Archivo-ExtraBold', fontSize: 9, lineHeight: 12 },
  hushRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hushLine: { flex: 1, height: StyleSheet.hairlineWidth * 2 },
  hushCaps: { fontFamily: 'HankenGrotesk-Medium', fontSize: 6, lineHeight: 9, letterSpacing: 1.6 },
  stripeCaps: { fontFamily: 'Castoro-Regular', fontSize: 9, lineHeight: 13, letterSpacing: 2, textAlign: 'center' },
  bowTitle: { fontFamily: 'SortsMillGoudy-Italic', fontSize: 12, lineHeight: 17 },
  loungePanel: { alignSelf: 'stretch', marginHorizontal: 6, marginTop: 10, flex: 1, borderTopLeftRadius: 10, borderTopRightRadius: 10, overflow: 'hidden', justifyContent: 'flex-end' },
  loungeName: { fontFamily: 'LeagueGothic-Regular', fontSize: 30, lineHeight: 38, textAlign: 'center', marginBottom: -6 },
  softCard: { flexDirection: 'row', alignItems: 'center', gap: 5, width: '86%', borderRadius: 10, padding: 6, overflow: 'hidden' },
  softWave: { position: 'absolute', right: -14, bottom: -14, width: 46, height: 30, borderTopLeftRadius: 30 },
  softLogo: { width: 26, height: 26, borderRadius: 13 },
  softName: { fontFamily: 'Archivo-ExtraBold', fontSize: 11, lineHeight: 14, color: '#16131A', flexShrink: 1 },
  hushBoxes: { flexDirection: 'row', gap: 4, marginTop: 4 },
  hushBox: { width: 18, height: 24, padding: 2 },
  hushBoxPhoto: { flex: 1 },
  hushName: { fontFamily: 'Newsreader-LightItalic', fontSize: 14, lineHeight: 20, color: '#FFFFFF' },
  stripeHero: { alignSelf: 'stretch', alignItems: 'center', borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 6, marginTop: 8 },
  stripeLogo: { borderWidth: 1.5, borderStyle: 'dotted', borderColor: '#FFFDF8' },
  stripeName: { fontFamily: 'Castoro-Regular', fontSize: 9, lineHeight: 12, letterSpacing: 2, marginTop: 3 },
  stripeBand: { alignSelf: 'stretch', borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 3 },
  stripeBox: { borderWidth: 1, borderRadius: 5 },
  bowWrap: { alignItems: 'center', alignSelf: 'stretch', paddingHorizontal: 14, paddingTop: 8 },
  bowPhoto: { alignSelf: 'stretch', height: 38, borderRadius: 8, overflow: 'hidden' },
  bowRibbon: { position: 'absolute', top: 0, bottom: 0, left: '30%', width: 4 },
  bowKnot: { position: 'absolute', top: 0, left: '30%', marginLeft: 3 },
  bowName: { fontFamily: 'SortsMillGoudy-Italic', fontSize: 13, lineHeight: 18, color: '#FFFFFF' },
  pagesCard: {
    backgroundColor: '#FFFFFF', borderRadius: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(38,32,30,0.3)',
    shadowColor: '#26201E', shadowOpacity: 0.25, shadowRadius: 0, shadowOffset: { width: 2, height: 2 }, overflow: 'visible',
  },
  titlePageName: { fontFamily: 'IMFellEnglish-Regular', fontSize: 15, lineHeight: 20, color: '#FFFFFF', marginTop: 2 },
  titlePageRule: { width: 34, height: 1, marginTop: 2 },
  chapterNumber: { fontFamily: 'IMFellEnglishSC-Regular', fontSize: 6, letterSpacing: 1.5, lineHeight: 8 },
  chapterTitle: { fontFamily: 'IMFellEnglish-Italic', fontSize: 12, lineHeight: 16 },
  // Gazette's front page and headings.
  newsPaper: { backgroundColor: '#EEEBE4', paddingHorizontal: 6, paddingVertical: 4, alignItems: 'center', width: '82%' },
  paperRule: { alignSelf: 'stretch', borderTopWidth: 2, borderBottomWidth: 0.5, borderColor: '#1F1D1A', height: 3 },
  blackletter: { fontFamily: 'UnifrakturMaguntia-Book', fontSize: 12, lineHeight: 17, color: '#1F1D1A' },
  headline: { fontFamily: 'Oswald-Bold', fontSize: 16, lineHeight: 21, color: '#1F1D1A' },
  newsRule: { borderTopWidth: 2, borderBottomWidth: 0.5, paddingVertical: 1 },
  newsTitle: { fontFamily: 'Oswald-Bold', fontSize: 11, lineHeight: 15 },
  embossCaps: { fontFamily: 'LibreCaslonDisplay-Regular', fontSize: 12, lineHeight: 16, letterSpacing: 1, textAlign: 'center', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 0.5 },
  raisedCard: {
    backgroundColor: '#FFFFFF', borderRadius: 2, overflow: 'visible',
    shadowColor: '#463428', shadowOpacity: 0.16, shadowRadius: 2, shadowOffset: { width: 1, height: 2 },
  },
  pressName: {
    fontFamily: 'LibreCaslonDisplay-Regular', fontSize: 20, lineHeight: 26, letterSpacing: 1,
    textShadowColor: 'rgba(50,36,28,0.55)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 0.5,
  },
  root: { height: 180 },
  // The 2026-11-19 reference-board styles: Poster, Hibiscus, Storefront.
  tape: { position: 'absolute', top: -3, alignSelf: 'center', width: 14, height: 5, backgroundColor: 'rgba(238,232,220,0.9)' },
  pillName: { width: '45%', height: 8, borderRadius: 4 },
  plate: { width: 12, height: 12, borderRadius: 6 },
  arrowPill: { width: 16, height: 7, borderRadius: 4 },
  archFrame: { padding: 2, borderTopLeftRadius: 99, borderTopRightRadius: 99, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  archFramePhoto: { height: 18, borderTopLeftRadius: 99, borderTopRightRadius: 99 },
  twoTone: { fontFamily: 'LeagueSpartan-ExtraBold', fontSize: 13, lineHeight: 14, letterSpacing: -0.5 },
  enjoyLead: { fontFamily: 'Manrope-Bold', fontSize: 4, letterSpacing: 2 },
  enjoyTitle: { fontFamily: 'Oswald-Bold', fontSize: 13, lineHeight: 17 },
  slantTitle: { fontFamily: 'Archivo-ExtraBold', fontSize: 11, lineHeight: 15, transform: [{ skewX: '-10deg' }] },
  posterCoverHero: { alignSelf: 'stretch', flex: 1, paddingHorizontal: 8, paddingTop: 6 },
  posterCoverPill: { width: 30, height: 6, borderRadius: 3, marginBottom: 3 },
  posterCoverName: { fontFamily: 'LeagueSpartan-ExtraBold', fontSize: 15, lineHeight: 16, letterSpacing: -0.6 },
  echoHero: { alignSelf: 'stretch', flex: 1, overflow: 'hidden', justifyContent: 'center' },
  echoRow: { fontFamily: 'Oswald-Bold', fontSize: 16, lineHeight: 18, marginLeft: -6 },
  echoPhoto: { position: 'absolute', right: 8, top: 10, width: 40, height: 54, borderRadius: 7 },
  echoPanel: { position: 'absolute', left: 8, bottom: 8, width: 58, borderRadius: 7, paddingHorizontal: 5, paddingVertical: 4 },
  echoName: { fontFamily: 'Oswald-Bold', fontSize: 12, lineHeight: 15 },
  storeHero: { alignSelf: 'stretch', flex: 1 },
  storePhoto: { flex: 1, alignItems: 'center', paddingTop: 3 },
  storeBand: { height: 22, alignItems: 'center', justifyContent: 'center' },
  hero: { height: 76, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, paddingHorizontal: 9, paddingTop: 7, gap: 5 },
  // Over a background photo the sheet is inset, as on the profile.
  backgroundPhoto: { opacity: 0.88 },
  floatingBody: { marginHorizontal: 5, borderTopLeftRadius: 10, borderTopRightRadius: 10, overflow: 'hidden' },
  divider: { alignSelf: 'center' },
  dividerLine: { width: 30, height: 1 },
  dividerGlyph: { fontSize: 5, lineHeight: 7, letterSpacing: 1 },
  dividerDots: { flexDirection: 'row', gap: 3 },
  dividerDot: { width: 2, height: 2, borderRadius: 1 },
  photoRow: { flexDirection: 'row', gap: 4, justifyContent: 'space-between' },
  archPhoto: { flex: 1, height: 26, borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  polaroidPrint: { flex: 1, backgroundColor: '#FFFFFF', padding: 2, paddingBottom: 5, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 1.5, shadowOffset: { width: 0, height: 1 } },
  polaroidPrintPhoto: { height: 16 },
  featureBig: { flex: 2, height: 30 },
  featureSide: { flex: 1, gap: 2 },
  featureSmall: { flex: 1 },
  swipeRow: { justifyContent: 'flex-start', overflow: 'hidden' },
  swipePhoto: { width: 26, height: 32, borderRadius: 3 },
  masonryPhoto: { flex: 1, height: 18, borderRadius: 4 },
  masonryTall: { height: 26 },
  layoutCard: { height: undefined, paddingVertical: 4, gap: 3, justifyContent: 'flex-start' },
  tileRow: { flexDirection: 'row', justifyContent: 'space-between' },
  tileCard: { width: '48%', paddingHorizontal: 4 },
  tilePhoto: { height: 16, borderRadius: 5 },
  photoCardPhoto: { height: 12, borderRadius: 3 },
  menuLine: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  menuName: { width: '40%' },
  menuLeader: { flex: 1, borderBottomWidth: 1, borderStyle: 'dotted', marginTop: 2 },
  menuPrice: { width: 10 },
  pinnedBar: {
    position: 'absolute', left: 6, right: 6, bottom: 6, height: 16, borderRadius: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 7, paddingRight: 2,
    shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
  },
  pinnedBarSquare: { borderRadius: 2 },
  pinnedBarText: { width: '45%' },
  pinnedBarButton: { width: 22, height: 12, borderRadius: 6 },
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
  logoRounded: { borderRadius: 8 },
  logoSharp: { borderRadius: 1 },
  appRow: { alignSelf: 'stretch' },
  appName: { fontFamily: 'Manrope-Bold', fontSize: 12, color: '#FFFFFF' },
  appBold: { fontFamily: 'Manrope-Bold', fontSize: 11 },
  gridNumber: { fontFamily: 'Manrope-Bold', fontSize: 7 },
  gridHero: { alignSelf: 'stretch', marginHorizontal: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)' },
  gridHeroTop: { paddingHorizontal: 4, paddingVertical: 3 },
  gridHeroFoot: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.8)', paddingHorizontal: 6, paddingVertical: 4 },
  slateHero: { alignSelf: 'stretch', paddingHorizontal: 12, paddingTop: 10 },
  slateHeroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  slateHeroName: { fontFamily: 'Manrope-Bold', fontSize: 16, lineHeight: 20 },
  slateHeroRule: { height: 2, borderRadius: 1, marginTop: 7, marginBottom: 5 },
  haloHero: { alignItems: 'center', gap: 3 },
  haloHeroRing: { width: 39, height: 39, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  haloHeroName: { fontFamily: 'Manrope-Bold', fontSize: 10, lineHeight: 14 },
  groupedCard: { borderRadius: 7 },
  gridCard: { borderRadius: 0, borderWidth: 1 },
  sideLines: { flex: 1, gap: 4, alignItems: 'center' },
  sideName: { fontFamily: 'Prata-Regular', fontSize: 12, color: '#FFFFFF' },
  heroBar: { height: 4, width: '90%', borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.7)' },
  heroBarShort: { width: '60%' },
  // Retreat
  archWindowHero: { alignItems: 'center', gap: 3 },
  archWindow: { width: 34, height: 44, borderTopLeftRadius: 17, borderTopRightRadius: 17, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  archWindowName: { fontFamily: 'Marcellus-Regular', fontSize: 11, lineHeight: 15, color: '#FFFFFF' },
  // Riviera
  colourBlock: { alignSelf: 'stretch', flex: 1, justifyContent: 'flex-end', paddingLeft: 10, paddingBottom: 12 },
  colourBlockName: { fontFamily: 'Fraunces-SoftBlackItalic', fontSize: 17, lineHeight: 23 },
  colourBlockLogo: { position: 'absolute', right: 6, bottom: -6, transform: [{ scale: 0.75 }] },
  // Posy
  splitHero: { alignSelf: 'stretch', flex: 1, flexDirection: 'row' },
  splitPhoto: { flex: 1, borderBottomRightRadius: 10 },
  splitSide: { flex: 1, alignItems: 'flex-start', justifyContent: 'flex-end', paddingLeft: 6, paddingBottom: 8, gap: 2 },
  splitName: { fontFamily: 'YoungSerif-Regular', fontSize: 11, lineHeight: 15, color: '#FFFFFF' },
  // The styles built from Custom's parts.
  customCaps: { fontSize: 8, lineHeight: 11, letterSpacing: 1.6, textAlign: 'center' },
  customTitle: { fontSize: 12, lineHeight: 16 },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  customNumber: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '700', fontSize: 8 },
  customBar: { width: 14, height: 2, borderRadius: 1, marginTop: 2 },
  spaName: { fontFamily: 'TenorSans_400Regular', fontSize: 9, letterSpacing: 2, color: '#FFFFFF', marginBottom: 3 },
  posterName: { fontFamily: 'Prata-Regular', fontSize: 14, color: '#FFFFFF', marginTop: 2 },
  coverName: { fontFamily: 'Syne_700Bold', fontSize: 22, color: '#FFFFFF', letterSpacing: -0.5 },
  coverLogo: { alignSelf: 'flex-end', width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: '#FFFFFF', marginRight: 8, marginBottom: -2 },
  pillRow: { flexDirection: 'row', gap: 4, marginTop: 3 },
  pill: { width: 24, height: 7, borderRadius: 4, backgroundColor: '#FFFFFF' },
  plain: { fontFamily: 'BakbakOne-Regular', fontSize: 11 },
  bigLower: { fontFamily: 'Syne_700Bold', fontSize: 17, letterSpacing: -0.5, lineHeight: 22 },
  pair: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 2 },
  pairLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  script: { fontFamily: 'PinyonScript_400Regular', fontSize: 15, lineHeight: 22 },
  serif: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 12, lineHeight: 16 },
  caps: { fontFamily: 'BebasNeue_400Regular', fontSize: 15, lineHeight: 20 },
  capsScript: { fontFamily: 'Sacramento_400Regular', fontSize: 16, lineHeight: 24 },
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
  logoTilted: { borderRadius: 6, transform: [{ rotate: '6deg' }] },
  ring: { padding: 2, borderRadius: 20, borderWidth: 1.5 },
  matFrame: { backgroundColor: '#1F1F1F', padding: 2 },
  matPhoto: { width: 30, height: 30, borderWidth: 4, borderColor: '#FBFAF7' },
  sideLinesLeft: { flex: 1, gap: 1 },
  edLight: { fontFamily: 'LeagueSpartan-Light', fontSize: 15, color: '#FFFFFF', lineHeight: 20 },
  edBold: { fontFamily: 'LeagueSpartan-ExtraBold', fontSize: 15, color: '#FFFFFF', lineHeight: 20 },
  duetScript: { fontFamily: 'MsMadi-Regular', fontSize: 20, lineHeight: 29, flexShrink: 1, paddingHorizontal: 4 },
  groovyName: { fontFamily: 'Fraunces-SoftBlackItalic', fontSize: 18, color: '#1E2A4A' },
  seal: { padding: 5, borderRadius: 30, borderWidth: 2, borderStyle: 'dotted', borderColor: 'rgba(255,255,255,0.9)' },
  welcome: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFFFFF', borderRadius: 10,
    borderWidth: 1, borderColor: '#1F1A1C', paddingHorizontal: 7, paddingVertical: 6, width: 92,
  },
  welcomeLogo: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, backgroundColor: '#EEE' },
  badge: {
    borderRadius: 100, borderWidth: 1.5, borderColor: '#1E2A4A', paddingHorizontal: 12, paddingVertical: 3,
    transform: [{ rotate: '-4deg' }],
  },
  labelHero: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, marginTop: 4 },
  labelHeroInner: { position: 'absolute', top: 2, left: 2, right: 2, bottom: 2, borderWidth: 0.5 },
  tagName: { fontFamily: 'MarcellusSC-Regular', fontSize: 11, lineHeight: 15, letterSpacing: 2 },
  galleryName: { fontFamily: 'InstrumentSerif-Regular', fontSize: 20, lineHeight: 26, color: '#FFFFFF', flex: 1 },
  dotLight: { fontFamily: 'LeagueSpartan-Light', fontSize: 12 },
  dotBold: { fontFamily: 'LeagueSpartan-ExtraBold' },
  stack: { alignItems: 'center' },
  italic: { fontFamily: 'LibreBaskerville-Italic', fontSize: 11, lineHeight: 15 },
  cinzel: { fontFamily: 'Cinzel-Bold', fontSize: 9, letterSpacing: 2 },
  vibes: { fontFamily: 'MsMadi-Regular', fontSize: 18, lineHeight: 27, paddingHorizontal: 4 },
  montserrat: { fontFamily: 'Montserrat-ExtraBold', fontSize: 9, marginTop: -8 },
  groovy: { fontFamily: 'Fraunces-SoftBlackItalic', fontSize: 14 },
  serifTitle: { fontFamily: 'InstrumentSerif-Regular', fontSize: 13, lineHeight: 17 },
  labelCaps: { fontFamily: 'MarcellusSC-Regular', fontSize: 8, letterSpacing: 2, textAlign: 'center' },
  quietCaps: { fontFamily: 'JosefinSans_600SemiBold', fontSize: 8, letterSpacing: 2 },
  engravedCaps: { fontFamily: 'Forum-Regular', fontSize: 9, lineHeight: 12, letterSpacing: 2, textAlign: 'center' },
  clippedCard: { borderRadius: 1 },
  callingCard: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F4EBDD',
    paddingHorizontal: 6, paddingTop: 8, paddingBottom: 5, borderRadius: 1, transform: [{ rotate: '-2deg' }],
  },
  callingClip: {
    position: 'absolute', top: -5, alignSelf: 'center', left: '40%', width: 22, height: 7,
    borderRadius: 2,
  },
  callingName: { fontFamily: 'MonsieurLaDoulaise-Regular', fontSize: 15, lineHeight: 24, paddingHorizontal: 4, flexShrink: 1 },
  quietName: { fontFamily: 'JosefinSans_600SemiBold', fontSize: 11, letterSpacing: 2, color: '#2C3527' },
  sheerCaps: { fontFamily: 'Bellefair-Regular', fontSize: 9, lineHeight: 12, letterSpacing: 2, textAlign: 'center' },
  sheerCard: { borderRadius: 0, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  veil: { alignSelf: 'stretch', flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  // The profile's see-through glass (veilPageTheme's sheetFill), inset so the
  // veiled photo shows down its sides, edged in a hairline.
  veilGlass: {
    marginHorizontal: 5, backgroundColor: 'rgba(18,14,14,0.42)',
    borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0, borderColor: 'rgba(255,255,255,0.3)',
    borderTopLeftRadius: 6, borderTopRightRadius: 6,
  },
  veilOval: { width: 24, height: 32, borderRadius: 12, borderWidth: 1, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  veilLogo: { width: 16, height: 16, borderRadius: 8 },
  veilName: { fontFamily: 'Bellefair-Regular', fontSize: 10, lineHeight: 13, letterSpacing: 1.5, color: '#FFFFFF' },
  hard: {
    backgroundColor: '#FFFFFF', borderColor: '#1F1A1C', overflow: 'visible',
    shadowOffset: { width: 2, height: 2 }, shadowOpacity: 1, shadowRadius: 0,
  },
  indexRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  indexNumber: { fontFamily: 'Gloock-Regular', fontSize: 8 },
  indexTitle: { fontFamily: 'Gloock-Regular', fontSize: 13 },
  topRuleCard: { backgroundColor: '#FFFFFF', borderRadius: 0, borderTopWidth: 2, borderTopColor: '#1F1A1C' },
  labelCard: { backgroundColor: '#FFFFFF', borderRadius: 0, borderWidth: 1, borderColor: '#2C3527' },
  productCard: { backgroundColor: '#FFFFFF', borderRadius: 3, borderWidth: 1, borderColor: 'rgba(42,10,16,0.14)' },
  shopSerif: { fontFamily: 'DMSerifDisplay-Regular', fontSize: 13, lineHeight: 18 },
  receiptCaps: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '700', fontSize: 8, letterSpacing: 1.5 },
  receiptRule: { borderTopWidth: 1, borderStyle: 'dashed', marginTop: 2 },
  receiptHero: { flex: 1, paddingHorizontal: 18, paddingVertical: 7 },
  receiptSlip: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  receiptName: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '700', fontSize: 9, letterSpacing: 2 },
  receiptBars: { width: 36, height: 7, borderLeftWidth: 2, borderRightWidth: 3 },
  // Studio's bar, photo and headings.
  studioWrap: { alignSelf: 'stretch', flex: 1, marginHorizontal: 8 },
  studioBar: { height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  studioLogo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 18, alignItems: 'center', justifyContent: 'center' },
  studioWordmark: { fontFamily: 'YoungSerif-Regular', fontSize: 11, lineHeight: 15 },
  studioPhoto: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 6 },
  studioHeadline: { fontFamily: 'LilitaOne-Regular', fontSize: 11, lineHeight: 17 },
  studioScript: { fontFamily: 'Ephesis-Regular', fontSize: 11 },
  studioTab: { width: 22, height: 5, marginLeft: 6 },
  chunkyCaps: { fontFamily: 'YoungSerif-Regular', fontSize: 12, lineHeight: 21, textAlign: 'center' },
  chunkyScript: { fontFamily: 'Ephesis-Regular', fontSize: 14 },
  productWrap: { alignSelf: 'stretch', flex: 1 },
  productPhoto: { flex: 1, minHeight: 30, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, borderTopLeftRadius: 6, borderTopRightRadius: 6, overflow: 'hidden' },
  productPanel: { paddingHorizontal: 8, paddingVertical: 5, gap: 4, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  productTitle: { fontFamily: 'DMSerifDisplay-Regular', fontSize: 12, lineHeight: 15 },
  pinHero: { alignSelf: 'stretch', flex: 1, paddingHorizontal: 6, paddingTop: 5 },
  pinBoard: { flexDirection: 'row', alignItems: 'flex-start', gap: 3, height: 44 },
  pin: { flex: 1, borderRadius: 6 },
  pinIdentity: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  pinLogo: { transform: [{ scale: 0.6 }], marginHorizontal: -6, marginVertical: -6 },
  pinName: { fontFamily: 'Manrope-Bold', fontSize: 11, flex: 1 },
  blockHero: { alignSelf: 'stretch', flex: 1 },
  blockPhotos: { flexDirection: 'row', height: 48 },
  blockPhoto: { flex: 1, backgroundColor: 'rgba(255,255,255,0.55)' },
  blockPhotoMid: { backgroundColor: 'rgba(255,255,255,0.75)' },
  blockBox: { marginTop: -12, marginRight: 22, paddingHorizontal: 8, paddingVertical: 4 },
  blockName: { fontFamily: 'Anton-Regular', fontSize: 16, color: '#FFFFFF' },
  condensed: { fontFamily: 'Anton-Regular', fontSize: 15 },
  blockCard: { backgroundColor: '#FFFFFF', borderRadius: 0, borderWidth: 1.5, borderColor: '#111111' },
  signedName: { fontFamily: 'MrsSaintDelafield-Regular', fontSize: 22, color: '#FFFFFF', marginTop: -10 },
  quietBand: { alignSelf: 'stretch', backgroundColor: '#FBFCF8', paddingVertical: 6, paddingHorizontal: 10, marginTop: 30 },
  band: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 26, borderTopLeftRadius: 30, borderTopRightRadius: 10 },
});
