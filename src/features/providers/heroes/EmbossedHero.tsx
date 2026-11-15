// src/features/providers/heroes/EmbossedHero.tsx
//
// The Embossed page style (round 4, 2026-11-15): blind emboss, tone on tone.
// React Native draws one text shadow per Text, and a pressed letter needs
// two (a lit edge and a shaded edge), so EmbossedText stacks two offset
// copies under the real text. The copies are hidden from screen readers.

import React from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import { blend, isDarkColor } from "../../../constants/providerThemes";

/** The lit and shaded edges for a press into paper of this colour. */
export function pressEdges(paper: string): { high: string; shade: string; drop: string } {
  return isDarkColor(paper)
    ? { high: "rgba(255,255,255,0.14)", shade: "rgba(0,0,0,0.65)", drop: "rgba(0,0,0,0.3)" }
    : { high: "rgba(255,255,255,0.95)", shade: "rgba(70,52,40,0.34)", drop: "rgba(70,52,40,0.12)" };
}

/** A plate mark: the dip a printing plate leaves round a print, shaded along
 *  its top and left inner edge and lit along the bottom and right. */
export function plateMarkEdges(paper: string): ViewStyle {
  const { high, shade } = pressEdges(paper);
  return {
    backgroundColor: blend(paper, "#000000", 0.03),
    borderTopColor: shade,
    borderLeftColor: shade,
    borderBottomColor: high,
    borderRightColor: high,
  };
}

/**
 * Text pressed up out of the page (`raised`, the default) or down into it,
 * drawn in the paper's own colour so only its edges show.
 */
export function EmbossedText({
  children,
  paper,
  style,
  raised = true,
  numberOfLines,
  adjustsFontSizeToFit,
  minimumFontScale,
  edges,
  face,
  depth = 1,
}: {
  children: string;
  paper: string;
  style: StyleProp<TextStyle>;
  raised?: boolean;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
  /** Stronger edges than the paper's own, for a press that has to read from a distance (the hero). */
  edges?: { high: string; shade: string; drop: string };
  /** The letters' own face, when it should sit a shade off the paper so they read more clearly. */
  face?: string;
  /** How far the edges stand off the letter, in points. */
  depth?: number;
}) {
  const { high, shade, drop } = edges ?? pressEdges(paper);
  const fit = { numberOfLines, adjustsFontSizeToFit, minimumFontScale };
  // Raised: lit from the top left, so the light edge is up-left and the shade
  // down-right. Pressed in, the other way round.
  const lit = (raised ? -1 : 1) * depth;
  const hidden = { accessible: false, importantForAccessibility: "no-hide-descendants" as const, accessibilityElementsHidden: true };
  return (
    <View style={pressStyles.stack}>
      <Text
        {...fit}
        {...hidden}
        style={[style, StyleSheet.absoluteFill, { color: shade, transform: [{ translateX: -lit }, { translateY: -lit * 1.5 }] }]}
      >
        {children}
      </Text>
      <Text
        {...fit}
        {...hidden}
        style={[style, StyleSheet.absoluteFill, { color: high, transform: [{ translateX: lit }, { translateY: lit }] }]}
      >
        {children}
      </Text>
      <Text
        {...fit}
        style={[
          style,
          { color: face ?? paper },
          raised ? { textShadowColor: drop, textShadowOffset: { width: 1, height: 3 }, textShadowRadius: 5 } : null,
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

/**
 * The hero's press: deeper and higher-contrast than a card's, because it's
 * pressed straight into the theme backdrop with no sheet of paper round it,
 * and the name has to read clearly at a glance.
 */
function heroPress(backdrop: string): { edges: { high: string; shade: string; drop: string }; face: string } {
  return isDarkColor(backdrop)
    ? {
        edges: { high: "rgba(255,255,255,0.34)", shade: "rgba(0,0,0,0.78)", drop: "rgba(0,0,0,0.42)" },
        face: blend(backdrop, "#FFFFFF", 0.14),
      }
    : {
        edges: { high: "rgba(255,255,255,1)", shade: "rgba(50,36,28,0.55)", drop: "rgba(50,36,28,0.2)" },
        face: blend(backdrop, "#FFFFFF", 0.3),
      };
}

/**
 * Embossed's hero, pressed straight into the theme backdrop (no card, owner
 * 2026-11-15): the logo sits in a blind-stamped ring, the name is raised out
 * of the backdrop in Libre Caslon Display, and what they do runs over its foot
 * in an embossed Italianno script. The stars, years and slots pill sit under it.
 */
export function PressedHero({
  name,
  phrase,
  location,
  backdrop,
  heroSub,
  logo,
  details,
  tick,
}: {
  name: string;
  /** "Lashes & brows", from kickerPhrase. */
  phrase: string;
  location: string;
  /** The theme's backdrop colour, which the letters are pressed into. */
  backdrop: string;
  heroSub: string;
  logo: React.ReactNode;
  details: React.ReactNode;
  tick: React.ReactNode;
}) {
  const { edges, face } = heroPress(backdrop);
  return (
    <View style={pressStyles.wrap}>
      <View style={pressStyles.stamp}>
        {/* A blind stamp: a shaded ring up-left and a lit one down-right read as pressed in. */}
        <View style={[pressStyles.ring, { borderColor: edges.shade }]} pointerEvents="none" />
        <View style={[pressStyles.ring, pressStyles.ringLit, { borderColor: edges.high }]} pointerEvents="none" />
        {logo}
      </View>
      <View style={pressStyles.nameBlock} accessible accessibilityRole="header" accessibilityLabel={name}>
        <EmbossedText
          paper={backdrop}
          face={face}
          edges={edges}
          depth={1.5}
          style={pressStyles.name}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.45}
        >
          {name.toUpperCase()}
        </EmbossedText>
        {phrase ? (
          <View style={pressStyles.scriptWrap}>
            <EmbossedText
              paper={backdrop}
              face={face}
              edges={edges}
              depth={1.25}
              style={pressStyles.script}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              {phrase}
            </EmbossedText>
          </View>
        ) : null}
      </View>
      {tick}
      {location ? <Text style={[pressStyles.located, { color: heroSub }]} numberOfLines={2}>{location.toUpperCase()}</Text> : null}
      <View style={pressStyles.details}>{details}</View>
    </View>
  );
}

/** The hero's first line sits below the header buttons, like the other text-first heroes. */
const PRESS_TOP = 56;

const pressStyles = StyleSheet.create({
  stack: { alignSelf: "stretch" },
  wrap: { paddingHorizontal: 20, marginTop: PRESS_TOP, marginBottom: 24, alignItems: "center" },
  stamp: { width: 104, height: 104, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  ring: { position: "absolute", top: 0, left: 0, width: 102, height: 102, borderRadius: 51, borderWidth: 1.5 },
  ringLit: { top: 1.5, left: 1.5 },
  nameBlock: { alignSelf: "stretch", alignItems: "center" },
  // Libre Caslon Display has tall caps; 1.28x keeps their tops from being cropped.
  name: { fontFamily: "LibreCaslonDisplay-Regular", fontSize: 64, lineHeight: 82, letterSpacing: 1.5, textAlign: "center" },
  scriptWrap: { alignSelf: "stretch", marginTop: -30 },
  // A looping script: 1.5x line height and room either side for its swashes.
  script: { fontFamily: "Italianno-Regular", fontSize: 52, lineHeight: 78, paddingHorizontal: 16, textAlign: "center" },
  located: { fontFamily: "LibreCaslonDisplay-Regular", fontSize: 12, lineHeight: 17, letterSpacing: 3, marginTop: 2, textAlign: "center" },
  details: { alignItems: "center", alignSelf: "stretch", marginTop: 16 },
});
