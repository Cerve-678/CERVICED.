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

import Svg, { Polygon } from 'react-native-svg';
import { PAGE_STYLES, type PageStyle, type PageStyleKey } from '../constants/pageStyles';
import { blend, isDarkColor, withAlpha } from '../constants/providerThemes';
import { WaxSeal, waxColour } from '../features/providers/WaxSeal';
import { BowGlyph, ribbonColours, stripeColours } from '../features/providers/heroes/demureOrnaments';

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
              <MiniProfile style={style} gradient={gradient} accent={accent} sheet={sheet} cardColour={cardColour} />
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
  sealed: { text: 'THE SERVICES' },
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
  custom: { text: 'Services' },
};

/** A tiny drawing of the profile top and one section in this style. */
function MiniProfile({
  style,
  gradient,
  accent,
  sheet,
  cardColour,
}: {
  style: PageStyle;
  gradient: readonly string[];
  accent: string;
  sheet: string;
  cardColour: string;
}) {
  const ink = isDarkColor(sheet) ? '#F2EDEA' : '#26201E';
  const gazetteInk = isDarkColor(cardColour) ? '#FFFFFF' : '#1F1D1A';
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
      case 'sealCaps':
        return (
          <View style={mini.sealRow}>
            <WaxSeal size={11} wax={waxColour(accent)} />
            <Text style={[mini.sealCaps, { color: ink }]}>{heading.text}</Text>
          </View>
        );
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
      case 'chapter':
        return (
          <View style={mini.stack}>
            <Text style={[mini.chapterNumber, { color: withAlpha(ink, 0.7) }]}>{heading.lead}</Text>
            <Text style={[mini.chapterTitle, { color: ink }]}>{heading.text}</Text>
          </View>
        );
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
      case 'stationery':
        return <View key={key} style={[mini.card, mini.paper, mini.stationeryCard, { borderColor: withAlpha(accent, 0.3) }]}><View style={[mini.bar, { backgroundColor: line }]} /></View>;
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
            <View style={[mini.card, mini.stripeBox, { backgroundColor: cardColour, borderColor: stripe.line }]}><View style={[mini.bar, { backgroundColor: line }]} /></View>
          </View>
        );
      }
      case 'grouped':
        return <View key={key} style={[mini.card, mini.groupedCard, { backgroundColor: cardColour }]}><View style={[mini.bar, { backgroundColor: line }]} /></View>;
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

  return (
    <View style={[mini.root, { backgroundColor: sheet }]}>
      <LinearGradient colors={heroColours} style={mini.hero}>
        {style.hero === 'cover' ? (
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
        ) : style.hero === 'envelope' ? (
          // Sealed: an envelope closed with a wax seal, a card peeking from its corner.
          <View style={mini.envelopeStage}>
            <View style={mini.envelopeCard} />
            <Svg width={56} height={36} viewBox="0 0 56 36" style={mini.envelope}>
              <Polygon points="0,0 56,0 56,36 0,36" fill="#EADCC8" />
              <Polygon points="0,36 28,16 56,36" fill="#E2D2BC" />
              <Polygon points="0,0 56,0 28,22" fill="#F3E9DA" />
            </Svg>
            <View style={mini.envelopeSeal}>
              <WaxSeal size={16} wax={waxColour(accent)} />
            </View>
          </View>
        ) : style.hero === 'veil' ? (
          // Sheer: a see-through black veil over the hero, an oval round the logo, spaced caps.
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
  sealRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sealCaps: { fontFamily: 'EBGaramond-SemiBold', fontSize: 8, lineHeight: 12, letterSpacing: 1.6 },
  stationeryCard: { borderRadius: 2, borderWidth: 1 },
  envelopeStage: { width: 70, height: 50 },
  envelope: { position: 'absolute', left: 4, top: 4 },
  envelopeCard: { position: 'absolute', left: 44, top: 24, width: 22, height: 24, backgroundColor: '#FBF6EE', borderRadius: 2, transform: [{ rotate: '-9deg' }] },
  envelopeSeal: { position: 'absolute', left: 24, top: 18 },
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
  logoRounded: { borderRadius: 8 },
  logoSharp: { borderRadius: 1 },
  appRow: { alignSelf: 'stretch' },
  appName: { fontFamily: 'Manrope-Bold', fontSize: 12, color: '#FFFFFF' },
  appBold: { fontFamily: 'Manrope-Bold', fontSize: 11 },
  gridNumber: { fontFamily: 'Manrope-Bold', fontSize: 7 },
  gridHero: { alignSelf: 'stretch', marginHorizontal: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)' },
  gridHeroTop: { paddingHorizontal: 4, paddingVertical: 3 },
  gridHeroFoot: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.8)', paddingHorizontal: 6, paddingVertical: 4 },
  groupedCard: { borderRadius: 7 },
  gridCard: { borderRadius: 0, borderWidth: 1 },
  sideLines: { flex: 1, gap: 4, alignItems: 'center' },
  sideName: { fontFamily: 'Prata-Regular', fontSize: 12, color: '#FFFFFF' },
  heroBar: { height: 4, width: '90%', borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.7)' },
  heroBarShort: { width: '60%' },
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
  sheerCard: { borderRadius: 0, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.38)' },
  veil: { alignSelf: 'stretch', flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,6,6,0.6)', gap: 3 },
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
