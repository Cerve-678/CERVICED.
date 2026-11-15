// src/features/providers/WaxSeal.tsx
//
// The Sealed page style's wax seal: a scalloped blob of wax with a pressed
// ring and, optionally, a letter in Corinthia. Used large on the envelope in
// the hero, small beside each section heading, and on each policy note with
// that policy's first letter.

import React from "react";
import Svg, { Circle, G, Text as SvgText } from "react-native-svg";

import { blend, isDarkColor } from "../../constants/providerThemes";

/** The scallops round the edge: eight lobes at 45° steps, 36 out from the centre. */
const LOBES: readonly [number, number][] = [
  [86, 50], [75.5, 75.5], [50, 86], [24.5, 75.5], [14, 50], [24.5, 24.5], [50, 14], [75.5, 24.5],
];

/** Wax reads as wax only when it's deep, so a pale accent is pressed darker. */
export function waxColour(accent: string): string {
  return isDarkColor(accent) ? accent : blend(accent, "#3A0610", 0.55);
}

export function WaxSeal({
  size,
  wax,
  letter,
}: {
  size: number;
  /** Already deep: pass waxColour(accent). */
  wax: string;
  /** Pressed into the middle. Left out for the small heading seals. */
  letter?: string;
}) {
  const high = blend(wax, "#FFFFFF", 0.28);
  const low = blend(wax, "#000000", 0.45);
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" pointerEvents="none">
      <G fill={wax}>
        <Circle cx={50} cy={50} r={38} />
        {LOBES.map(([cx, cy]) => (
          <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={13} />
        ))}
      </G>
      {/* A soft highlight up and to the left, as if lit from above. */}
      <Circle cx={44} cy={42} r={30} fill={high} opacity={0.35} />
      <Circle cx={50} cy={50} r={28} fill="none" stroke={low} strokeWidth={letter ? 2.4 : 5} />
      {letter ? (
        <>
          <Circle cx={50} cy={50} r={24.5} fill="none" stroke={high} strokeWidth={0.8} opacity={0.7} />
          {/* The letter twice, a hair apart: the pale copy is the pressed edge catching light. */}
          <SvgText x={49} y={65} textAnchor="middle" fontFamily="Corinthia-Bold" fontSize={46} fill={high} opacity={0.7}>
            {letter}
          </SvgText>
          <SvgText x={50} y={66} textAnchor="middle" fontFamily="Corinthia-Bold" fontSize={46} fill={low}>
            {letter}
          </SvgText>
        </>
      ) : null}
    </Svg>
  );
}

/** The letter for a seal: the first letter of a name, or nothing. */
export function sealLetter(text: string): string {
  const match = text.trim().match(/[A-Za-z]/);
  return match ? match[0].toUpperCase() : "";
}
