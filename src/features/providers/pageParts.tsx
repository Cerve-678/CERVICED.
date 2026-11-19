// src/features/providers/pageParts.tsx
//
// The page parts the 2026-11-19 page styles are built from (owner, from the
// parts canvas https://claude.ai/artifact/WwkYqZPakxfN8wXMhemBfv and the styles
// canvas https://claude.ai/artifact/3kCvU1EuLzUqpUaH9jBsCd): the mark between
// sections and the pattern printed across the page. A page style turns each
// on with a switch (pageStyles: divider, pagePattern), so later styles reuse
// them rather than drawing their own.

import React, { useId } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, Path, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";

import type { PagePattern as PagePatternKey, SectionDivider as SectionDividerKey } from "../../constants/pageStyles";
import { withAlpha } from "../../constants/providerThemes";

/** The small mark between two sections, centred, in the accent. */
export function SectionDivider({ divider, accent }: { divider: SectionDividerKey; accent: string }) {
  switch (divider) {
    case "stars":
      return (
        <View style={styles.starsRow} accessible={false} importantForAccessibility="no-hide-descendants">
          <View style={[styles.starsRule, { backgroundColor: withAlpha(accent, 0.3) }]} />
          <Text style={[styles.stars, { color: accent }]}>✦ ✦ ✦</Text>
          <View style={[styles.starsRule, { backgroundColor: withAlpha(accent, 0.3) }]} />
        </View>
      );
    case "dots":
      return (
        <View style={styles.divider} accessible={false} importantForAccessibility="no-hide-descendants">
          <Text style={[styles.dots, { color: withAlpha(accent, 0.7) }]}>•  •  •</Text>
        </View>
      );
    case "line":
      return <View style={[styles.line, { backgroundColor: withAlpha(accent, 0.3) }]} accessible={false} />;
    case "wave":
      return (
        <View style={styles.divider} accessible={false} importantForAccessibility="no-hide-descendants">
          <Svg width={132} height={12} viewBox="0 0 132 12">
            <Path
              d="M0 6 Q 5.5 0 11 6 T 22 6 T 33 6 T 44 6 T 55 6 T 66 6 T 77 6 T 88 6 T 99 6 T 110 6 T 121 6 T 132 6"
              fill="none"
              stroke={accent}
              strokeWidth={1.4}
            />
          </Svg>
        </View>
      );
  }
}

/** How strong each pattern's ink is on a pale page and on a dark one. */
const PATTERN_ALPHA: Record<PagePatternKey, { pale: number; dark: number }> = {
  gingham: { pale: 0.06, dark: 0.08 },
  glow: { pale: 0.16, dark: 0.22 },
};

/**
 * A fine pattern across the whole content sheet, under everything on it.
 * Fills its parent; the parent's own colour shows between the marks.
 */
export function PagePattern({
  pattern,
  accent,
  onDark,
  style,
}: {
  pattern: PagePatternKey;
  accent: string;
  onDark: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const id = `page-pattern-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const alpha = PATTERN_ALPHA[pattern];
  const strength = onDark ? alpha.dark : alpha.pale;
  const ink = withAlpha(accent, strength);
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%">
        <Defs>
          {pattern === "gingham" ? (
            // Two half-stripes crossing: where they overlap the check is twice as deep.
            <Pattern id={id} patternUnits="userSpaceOnUse" width={22} height={22}>
              <Rect x={0} y={0} width={11} height={22} fill={ink} />
              <Rect x={0} y={0} width={22} height={11} fill={ink} />
            </Pattern>
          ) : pattern === "glow" ? (
            // One soft wash from the top left, gone a screen or so down: sized
            // in points, not by the sheet, which runs the whole page long.
            <RadialGradient id={id} cx="15%" cy={0} rx="120%" ry={560} fx="15%" fy={0} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={accent} stopOpacity={strength} />
              <Stop offset="1" stopColor={accent} stopOpacity={0} />
            </RadialGradient>
          ) : null}
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  divider: { alignItems: "center", marginTop: 4, marginBottom: 20 },
  line: { height: StyleSheet.hairlineWidth * 2, marginTop: 4, marginBottom: 22 },
  dots: { fontSize: 12, lineHeight: 16, letterSpacing: 4 },
  starsRow: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 24, marginTop: 4, marginBottom: 20 },
  starsRule: { flex: 1, height: StyleSheet.hairlineWidth * 2 },
  stars: { fontSize: 11, lineHeight: 16, letterSpacing: 5 },
});
