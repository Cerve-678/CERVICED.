// src/features/providers/heroes/demureOrnaments.tsx
//
// The small drawn ornaments of the demure page styles, shared by their heroes
// (heroes/DemureHeroes) and their section headings and policies
// (ProfilePageStyle): the pearls round Stripes' logo and beside its policies,
// Stripes' strip colours, and Bow's satin bow. Kept apart from both so
// neither imports the other.

import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Ellipse, Path } from "react-native-svg";

import { blend, isDarkColor, withAlpha } from "../../../constants/providerThemes";

/** One pearl: lit at the top left, shaded at the foot. A deeper, warmer pearl on a dark page. */
export function Pearl({ size, onDark = false, style }: { size: number; onDark?: boolean; style?: StyleProp<ViewStyle> }) {
  const colours: [string, string, string] = onDark
    ? ["#FFFDF8", "#E4DCD0", "#B9AFA2"]
    : ["#FFFFFF", "#F4EEE6", "#D3C9BC"];
  return (
    <LinearGradient
      colors={colours}
      start={{ x: 0.2, y: 0.1 }}
      end={{ x: 0.85, y: 0.95 }}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 0.75,
          borderColor: onDark ? "rgba(0,0,0,0.35)" : "rgba(120,104,88,0.35)",
        },
        style,
      ]}
    />
  );
}

/** A ring of pearls round a circle of `diameter`, the pearls `pearl` across. */
export function PearlRing({
  diameter,
  pearl,
  count,
  onDark = false,
}: {
  diameter: number;
  pearl: number;
  count: number;
  onDark?: boolean;
}) {
  const box = diameter + pearl * 2;
  const radius = diameter / 2 + pearl / 2;
  return (
    <View
      style={{ position: "absolute", width: box, height: box, left: -pearl, top: -pearl }}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: count }, (_, index) => {
        const angle = (index / count) * Math.PI * 2;
        return (
          <Pearl
            key={index}
            size={pearl}
            onDark={onDark}
            style={{
              position: "absolute",
              left: box / 2 + radius * Math.cos(angle) - pearl / 2,
              top: box / 2 + radius * Math.sin(angle) - pearl / 2,
            }}
          />
        );
      })}
    </View>
  );
}

/** Bow's satin: the ribbon in a soft shade of the accent, its edges and folds in the accent itself. */
export function ribbonColours(accent: string): { satin: string; edge: string; soft: string } {
  return {
    satin: blend(accent, "#FFFFFF", 0.5),
    edge: isDarkColor(accent) ? accent : blend(accent, "#000000", 0.25),
    soft: blend(accent, "#FFFFFF", 0.8),
  };
}

/** A satin bow: two loops, a knot and two tails, drawn 100 × 70. */
export function BowGlyph({ width, accent, detailed = false }: { width: number; accent: string; detailed?: boolean }) {
  const { satin, edge } = ribbonColours(accent);
  const stroke = detailed ? { stroke: edge, strokeWidth: 1.1, strokeLinejoin: "round" as const } : {};
  return (
    <Svg width={width} height={width * 0.7} viewBox="0 0 100 70" pointerEvents="none">
      <Path d="M47 35 L36 63 L42 60 L45 67 L50 37 Z M53 35 L64 63 L58 60 L55 67 L50 37 Z" fill={satin} {...stroke} />
      <Path d="M50 30 C30 8 6 12 9 30 C12 47 34 44 50 30 Z M50 30 C70 8 94 12 91 30 C88 47 66 44 50 30 Z" fill={satin} {...stroke} />
      {detailed ? (
        <Path d="M22 24 C30 26 38 28 46 30 M78 24 C70 26 62 28 54 30" fill="none" stroke={withAlpha(edge, 0.8)} strokeWidth={0.8} strokeLinecap="round" />
      ) : null}
      <Ellipse cx={50} cy={31} rx={6.5} ry={8} fill={detailed ? satin : edge} {...stroke} />
    </Svg>
  );
}

/** Stripes' colours from the accent: `strong` for the hero's strip and the
 *  last section's, `soft` for the strips between, `line` for the fine rules
 *  along each strip's edges and round every box. */
export function stripeColours(accent: string): { strong: string; soft: string; line: string } {
  return {
    strong: blend(accent, "#FFFFFF", 0.45),
    soft: blend(accent, "#FFFFFF", 0.75),
    line: isDarkColor(accent) ? accent : blend(accent, "#000000", 0.2),
  };
}
