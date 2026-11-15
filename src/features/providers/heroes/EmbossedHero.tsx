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
}: {
  children: string;
  paper: string;
  style: StyleProp<TextStyle>;
  raised?: boolean;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
}) {
  const { high, shade, drop } = pressEdges(paper);
  const fit = { numberOfLines, adjustsFontSizeToFit, minimumFontScale };
  // Raised: lit from the top left, so the light edge is up-left and the shade
  // down-right. Pressed in, the other way round.
  const lit = raised ? -1 : 1;
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
          { color: paper },
          raised ? { textShadowColor: drop, textShadowOffset: { width: 1, height: 3 }, textShadowRadius: 5 } : null,
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

/** The hero's paper. It's a physical sheet, so its colours are fixed. */
export const PRESS_PAPER = "#ECE6DF";
const PRESS_SUB = "#5C534D";

/**
 * Embossed's hero: a sheet of pressed paper laid over their photo. The logo
 * sits in a ring blind-stamped into the sheet, the name is pressed up out of
 * it in Libre Caslon Display, and what they do runs over its foot in an
 * embossed Italianno script. The stars, years and slots pill stay on the
 * photo under the sheet, as in the other heroes.
 */
export function PressedHero({
  name,
  phrase,
  location,
  logo,
  details,
  tick,
}: {
  name: string;
  /** "Lashes & brows", from kickerPhrase. */
  phrase: string;
  location: string;
  logo: React.ReactNode;
  details: React.ReactNode;
  tick: React.ReactNode;
}) {
  const edges = pressEdges(PRESS_PAPER);
  return (
    <View style={pressStyles.wrap}>
      <View style={pressStyles.paper}>
        <View style={pressStyles.stamp}>
          {/* A blind stamp: a shaded ring up-left and a lit one down-right read as pressed in. */}
          <View style={[pressStyles.ring, { borderColor: edges.shade }]} pointerEvents="none" />
          <View style={[pressStyles.ring, pressStyles.ringLit, { borderColor: edges.high }]} pointerEvents="none" />
          {logo}
        </View>
        <View style={pressStyles.nameBlock} accessible accessibilityRole="header" accessibilityLabel={name}>
          <EmbossedText paper={PRESS_PAPER} style={pressStyles.name} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.45}>
            {name.toUpperCase()}
          </EmbossedText>
          {phrase ? (
            <View style={pressStyles.scriptWrap}>
              <EmbossedText paper={PRESS_PAPER} style={pressStyles.script} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {phrase}
              </EmbossedText>
            </View>
          ) : null}
        </View>
        {tick}
        {location ? <Text style={pressStyles.located} numberOfLines={2}>{location.toUpperCase()}</Text> : null}
      </View>
      <View style={pressStyles.details}>{details}</View>
    </View>
  );
}

/** The hero's first line sits below the header buttons, like the other text-first heroes. */
const PRESS_TOP = 56;

const pressStyles = StyleSheet.create({
  stack: { alignSelf: "stretch" },
  wrap: { paddingHorizontal: 20, marginTop: PRESS_TOP, marginBottom: 24 },
  paper: {
    backgroundColor: PRESS_PAPER,
    borderRadius: 3,
    paddingTop: 24,
    paddingBottom: 22,
    paddingHorizontal: 18,
    alignItems: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 8,
  },
  stamp: { width: 104, height: 104, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  ring: { position: "absolute", top: 0, left: 0, width: 102, height: 102, borderRadius: 51, borderWidth: 1.5 },
  ringLit: { top: 1.5, left: 1.5 },
  nameBlock: { alignSelf: "stretch", alignItems: "center" },
  // Libre Caslon Display has tall caps; 1.28x keeps their tops from being cropped.
  name: { fontFamily: "LibreCaslonDisplay-Regular", fontSize: 58, lineHeight: 75, letterSpacing: 1, textAlign: "center" },
  scriptWrap: { alignSelf: "stretch", marginTop: -30 },
  // A looping script: 1.5x line height and room either side for its swashes.
  script: { fontFamily: "Italianno-Regular", fontSize: 46, lineHeight: 70, paddingHorizontal: 16, textAlign: "center" },
  located: { fontFamily: "LibreCaslonDisplay-Regular", fontSize: 12, lineHeight: 17, letterSpacing: 3, color: PRESS_SUB, marginTop: 2, textAlign: "center" },
  details: { alignItems: "center", marginTop: 16 },
});
