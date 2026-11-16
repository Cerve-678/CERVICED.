// src/features/providers/heroes/LaceHero.tsx
//
// The Lace page style (round 4, 2026-11-15): a piece of lace fabric dropped
// across the foot of the hero, lying diagonally in soft folds over their photo
// (a sheer net with floral medallions and a scalloped, eyeleted hem), a clean
// ringed logo, and their name in Allura over Gilda Display caps. The owner
// asked for draped cloth, like the lace across the foot of their price-list
// reference: no hanging strands, and nothing framing the logo.
//
// Also here: the scalloped trim the Lace cards hang from their foot, and the
// rosette beside each policy, so every lace shape lives in one file.

import React, { useId } from "react";
import { StyleSheet, Text, useWindowDimensions, View, type TextStyle } from "react-native";
import Svg, { Circle, Defs, G, Path, Pattern, Rect } from "react-native-svg";

import { blend } from "../../../constants/providerThemes";

/** One scallop, 26×24: a band along the top and a half-round below it,
 *  with an eyelet and a ring of pinholes (even-odd, so the holes show through). */
const SCALLOP =
  "M0 0H26V7A13 13 0 0 1 0 7Z M9.6 10a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0 -6.8 0Z M19.22 9.74a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0Z M16.29 13.55a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0Z M11.7 16a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0Z M7.11 13.55a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0Z M4.18 9.74a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0Z M5.1 3.5a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0Z M18.1 3.5a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0Z M24.44 14.3a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0Z M19.1 19.64a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0Z M11.8 21.6a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0Z M4.5 19.64a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0Z";
const SCALLOP_W = 26;
const SCALLOP_H = 24;

/** A six-petal lace medallion, drawn round (0,0) in a 24-wide box. */
const MEDAL =
  "M3.4 0a3.6 3.6 0 1 0 7.2 0a3.6 3.6 0 1 0 -7.2 0Z M-0.35 6.06a3.6 3.6 0 1 0 7.2 0a3.6 3.6 0 1 0 -7.2 0Z M-6.85 6.06a3.6 3.6 0 1 0 7.2 0a3.6 3.6 0 1 0 -7.2 0Z M-10.6 0a3.6 3.6 0 1 0 7.2 0a3.6 3.6 0 1 0 -7.2 0Z M-6.85 -6.06a3.6 3.6 0 1 0 7.2 0a3.6 3.6 0 1 0 -7.2 0Z M-0.35 -6.06a3.6 3.6 0 1 0 7.2 0a3.6 3.6 0 1 0 -7.2 0Z M-4.2 0a4.2 4.2 0 1 0 8.4 0a4.2 4.2 0 1 0 -8.4 0Z M-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0Z";

/** The drape is drawn on a 390×180 canvas and scaled to the screen's width. */
const DRAPE_W = 390;
const DRAPE_H = 180;
/** The hem runs from low on the left to high on the right, at this angle. */
const HEM_START: [number, number] = [-10, 118];
const HEM_ANGLE = -12.4;

/** The floral medallions scattered over the net, in the drape's own (rotated)
 *  frame: x along the hem, y back from it into the cloth. [x, y, width]. */
const MOTIFS: readonly [number, number, number][] = [
  [12, 26, 20], [48, 54, 16], [84, 24, 22], [118, 58, 18], [152, 28, 20], [190, 60, 16],
  [222, 26, 22], [258, 56, 18], [292, 28, 20], [328, 60, 16], [362, 26, 22], [398, 54, 18], [432, 28, 20],
  [30, 92, 18], [100, 96, 20], [170, 94, 18], [240, 98, 20], [310, 94, 18], [380, 98, 20], [448, 92, 18],
  [64, 130, 16], [136, 134, 18], [206, 132, 16], [276, 136, 18], [346, 132, 16], [414, 136, 18],
];

/** Soft folds: long bands running back from the hem into the cloth, each a
 *  shadow beside a highlight, so the fabric reads as lying in waves. */
const FOLDS: readonly { d: string; dark: boolean }[] = [
  { d: "M58 0C70 60 48 140 64 220L84 220C70 140 92 60 80 0Z", dark: true },
  { d: "M82 0C94 60 72 140 88 220L100 220C86 140 108 60 96 0Z", dark: false },
  { d: "M168 0C182 70 156 150 176 220L198 220C180 150 206 70 192 0Z", dark: true },
  { d: "M194 0C208 70 182 150 202 220L214 220C196 150 222 70 208 0Z", dark: false },
  { d: "M282 0C292 60 274 150 290 220L308 220C294 150 312 60 302 0Z", dark: true },
  { d: "M304 0C314 60 296 150 312 220L322 220C308 150 326 60 316 0Z", dark: false },
  { d: "M384 0C396 70 372 150 390 220L410 220C394 150 418 70 406 0Z", dark: true },
];

function scallopXs(from: number, to: number): number[] {
  const xs: number[] = [];
  for (let x = from; x < to; x += SCALLOP_W) xs.push(x);
  return xs;
}

/**
 * A piece of lace fabric dropped across the foot of the hero, the screen's
 * full width: a sheer net with floral medallions, soft folds, and a
 * scalloped, eyeleted hem running diagonally from low left to high right.
 * The net is mostly see-through, so their photo shows between the motifs.
 */
function LaceDrape({ width, color }: { width: number; color: string }) {
  const netId = `laceNet${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const height = (width / DRAPE_W) * DRAPE_H;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${DRAPE_W} ${DRAPE_H}`} pointerEvents="none">
      <Defs>
        {/* A fine diamond net. */}
        <Pattern id={netId} patternUnits="userSpaceOnUse" width={7} height={7}>
          <Path d="M0 3.5L3.5 0L7 3.5L3.5 7Z" fill="none" stroke={color} strokeWidth={0.6} />
        </Pattern>
      </Defs>
      {/* Everything is drawn in the drape's own frame: x along the hem, y back into the cloth. */}
      <G transform={`translate(${HEM_START[0]} ${HEM_START[1]}) rotate(${HEM_ANGLE})`}>
        {/* The cloth itself: a faint wash, then the net over it. */}
        <Rect x={-40} y={0} width={520} height={240} fill={color} opacity={0.16} />
        <Rect x={-40} y={0} width={520} height={240} fill={`url(#${netId})`} opacity={0.55} />
        {/* The folds, under the motifs so the pattern rides over them. */}
        {FOLDS.map(fold => (
          <Path key={fold.d} d={fold.d} fill={fold.dark ? "#000000" : "#FFFFFF"} opacity={fold.dark ? 0.2 : 0.14} />
        ))}
        <G fill={color} opacity={0.88}>
          {MOTIFS.map(([x, y, w]) => (
            <Path key={`${x}-${y}`} d={MEDAL} fillRule="evenodd" transform={`translate(${x} ${y}) scale(${w / 24})`} />
          ))}
        </G>
        {/* A corded line just inside the hem, then the scallops, flipped so
            they point out of the cloth. */}
        <Path d="M-40 9H480" stroke={color} strokeWidth={1.4} opacity={0.9} />
        <G fill={color} transform="scale(1 -1)">
          {scallopXs(-40, 480).map(x => (
            <Path key={x} d={SCALLOP} fillRule="evenodd" transform={`translate(${x} 0)`} />
          ))}
        </G>
      </G>
    </Svg>
  );
}

/** A row of scallops: the trim a Lace card hangs from its foot. */
export function LaceTrim({ width, color }: { width: number; color: string }) {
  if (width <= 0) return null;
  return (
    <Svg width={width} height={SCALLOP_H} viewBox={`0 0 ${width} ${SCALLOP_H}`} pointerEvents="none">
      <G fill={color}>
        {scallopXs(0, width).map(x => (
          <Path key={x} d={SCALLOP} fillRule="evenodd" transform={`translate(${x} 0)`} />
        ))}
      </G>
    </Svg>
  );
}

export const LACE_TRIM_HEIGHT = SCALLOP_H;

/** A small lace rosette: eight petals round a centre, pierced by pinholes in `hole`. */
export function LaceRosette({ size, color, hole }: { size: number; color: string; hole: string }) {
  const petals: [number, number][] = [
    [30, 20], [27.07, 27.07], [20, 30], [12.93, 27.07], [10, 20], [12.93, 12.93], [20, 10], [27.07, 12.93],
  ];
  const holes: [number, number][] = [
    [31, 20], [27.8, 27.8], [20, 31], [12.2, 27.8], [9, 20], [12.2, 12.2], [20, 9], [27.8, 12.2],
  ];
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" pointerEvents="none">
      <G fill={color}>
        {petals.map(([cx, cy]) => <Circle key={`p${cx}-${cy}`} cx={cx} cy={cy} r={6} />)}
        <Circle cx={20} cy={20} r={9} />
      </G>
      <G fill={hole}>
        <Circle cx={20} cy={20} r={3.6} />
        {holes.map(([cx, cy]) => <Circle key={`h${cx}-${cy}`} cx={cx} cy={cy} r={1.7} />)}
      </G>
    </Svg>
  );
}

export function LaceHero({
  name,
  kicker,
  location,
  heroText,
  heroSub,
  heroIsDark,
  accent,
  renderLogo,
  details,
  tick,
  shadow,
}: {
  name: string;
  kicker: string;
  location: string;
  heroText: string;
  heroSub: string;
  heroIsDark: boolean;
  accent: string;
  renderLogo: (size: number) => React.ReactNode;
  details: React.ReactNode;
  tick: React.ReactNode;
  shadow: TextStyle | null;
}) {
  const { width } = useWindowDimensions();
  // Ivory lace over a dark photo; on a pale one, lace in a deep shade of their accent.
  const lace = heroIsDark ? "#F3E9DE" : blend(accent, "#000000", 0.35);
  return (
    <View style={styles.wrap}>
      {/* Behind everything else, so the logo, name and details sit on the cloth. */}
      <View style={styles.drape} pointerEvents="none">
        <LaceDrape width={width} color={lace} />
      </View>
      <View style={styles.logo}>{renderLogo(132)}</View>
      <View style={styles.nameRow} accessible accessibilityRole="header" accessibilityLabel={name}>
        <Text
          style={[styles.name, { color: heroText }, shadow]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
        >
          {name}
        </Text>
        {tick}
      </View>
      {kicker ? <Text style={[styles.kicker, { color: heroText }, shadow]} numberOfLines={2}>{kicker}</Text> : null}
      {location ? (
        <Text style={[styles.location, { color: heroSub }, shadow]} numberOfLines={2}>{location.toUpperCase()}</Text>
      ) : null}
      <View style={styles.details}>{details}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The drape lies across the foot of the hero, so the hero leaves room for it
  // below the details; its high right side rises behind them.
  wrap: { alignItems: "center", paddingHorizontal: 20, paddingBottom: 84 },
  drape: { position: "absolute", bottom: 0, left: 0 },
  logo: { marginTop: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: -6 },
  // Allura's capitals swash well past their box, so the line is 1.5× and the
  // sides are padded or React Native clips the loops.
  name: { fontFamily: "Allura-Regular", fontSize: 58, lineHeight: 87, paddingHorizontal: 14, textAlign: "center", flexShrink: 1 },
  kicker: { fontFamily: "GildaDisplay-Regular", fontSize: 13, lineHeight: 18, letterSpacing: 4, marginTop: -10, textAlign: "center" },
  location: { fontFamily: "GildaDisplay-Regular", fontSize: 11, lineHeight: 16, letterSpacing: 3, marginTop: 6, textAlign: "center" },
  details: { alignItems: "center", marginTop: 10 },
});
