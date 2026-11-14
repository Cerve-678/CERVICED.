// src/features/providers/ProfilePageStyle.tsx
//
// The pieces of the public profile that change with Branding → Page Style
// (constants/pageStyles): a section's heading, the surface it sits on, and the
// policy list. Classic draws exactly what the profile always drew — the
// frosted card with its Bakbak title inside — so a provider who never picks a
// style sees no change.

import React from "react";
import { StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";

import {
  GALLERY_KICKERS,
  headingPair,
  PAGE_SECTION_TITLES,
  romanNumeral,
  type PageSectionKey,
  type PageStyle,
} from "../../constants/pageStyles";
import { blend, isDarkColor, withAlpha } from "../../constants/providerThemes";
import type { PolicyDisplayRow } from "../../utils/policyDisplay";

export interface PageStylePalette {
  /** Text and lines for content on a card. */
  text: string;
  sub: string;
  border: string;
  separator: string;
  /** The content area (sheet) colour. */
  background: string;
  cardBackground: string;
  accent: string;
  blurTint: "dark" | "light";
  blurIntensity: number;
  highlightColors: [string, string];
  squareCards?: boolean;
  /** Branding → Page Style. Missing means Classic. */
  pageStyle?: PageStyle;
}

/** Text and line colours for something drawn straight on the content area
 *  rather than on a card. The theme's own text colours follow the CARD's
 *  brightness, which is the wrong reference once a style takes the card away. */
export function sheetInk(sheet: string): { text: string; sub: string; border: string; separator: string } {
  const dark = isDarkColor(sheet);
  return {
    text: dark ? "#F2EDEA" : "#26201E",
    sub: dark ? "#C9BEB9" : "#5E5451",
    border: dark ? "rgba(255,255,255,0.24)" : "rgba(38,32,30,0.16)",
    separator: dark ? "rgba(255,255,255,0.16)" : "rgba(38,32,30,0.12)",
  };
}

/** Readable text on the accent colour (the Scrapbook policy band). */
export function onAccentInk(accent: string): { text: string; sub: string } {
  return isDarkColor(accent)
    ? { text: "#FFFFFF", sub: "rgba(255,255,255,0.86)" }
    : { text: "#1F1A18", sub: "rgba(31,26,24,0.78)" };
}

/** True when the style draws a section straight on the page (no card behind it). */
export function sectionsSitOnPage(style: PageStyle | undefined): boolean {
  return style?.cards === "none" || style?.cards === "outline" || style?.cards === "open";
}

/** Dark ink for an outline on a card of this colour (Duet, Groovy, Apothecary). */
function outlineInk(card: string): string {
  return isDarkColor(card) ? "#F2EDEA" : "#1F1A1C";
}

/** The colours content inside a section should use under this style. */
export function sectionInk(palette: PageStylePalette): { text: string; sub: string; border: string; separator: string } {
  if (sectionsSitOnPage(palette.pageStyle)) return sheetInk(palette.background);
  return { text: palette.text, sub: palette.sub, border: palette.border, separator: palette.separator };
}

// ── Headings ──────────────────────────────────────────────────────────────────

/** A section heading in the page style's voice. Classic's heading lives inside
 *  the card, so it's drawn by PageSection, not here. */
export function PageSectionHeading({
  section,
  palette,
  color,
  accentColor,
  align,
}: {
  section: PageSectionKey;
  palette: PageStylePalette;
  /** Overrides the ink (the Scrapbook band draws its heading on the accent). */
  color?: string;
  accentColor?: string;
  align?: "left" | "center";
}) {
  const style = palette.pageStyle;
  const title = PAGE_SECTION_TITLES[section];
  const ink = color ?? sheetInk(palette.background).text;
  const accent = accentColor ?? palette.accent;
  const a11y = { accessibilityRole: "header" as const, accessibilityLabel: title };

  switch (style?.heading) {
    case "bigLower":
      return (
        <Text {...a11y} style={[headingStyles.bigLower, { color: ink }]}>
          {title.toLowerCase()}
        </Text>
      );
    case "scriptPair": {
      const [lead, rest] = headingPair(section);
      return (
        <View {...a11y} accessible style={headingStyles.pairRow}>
          <Text style={[headingStyles.script, { color: ink }]}>{lead}</Text>
          <Text style={[headingStyles.serif, { color: ink }]}>{rest}</Text>
        </View>
      );
    }
    case "capsScript": {
      const [lead, rest] = headingPair(section);
      return (
        <View
          {...a11y}
          accessible
          style={[headingStyles.capsRow, align === "center" && headingStyles.centerRow]}
        >
          <Text style={[headingStyles.caps, { color: color ?? accent }]}>{lead.toUpperCase()}</Text>
          <Text style={[headingStyles.capsScript, { color: color ?? accent }]}>{rest.toLowerCase()}</Text>
        </View>
      );
    }
    case "spacedCaps":
      return (
        <Text {...a11y} style={[headingStyles.spaced, { color: color ?? sheetInk(palette.background).sub }]}>
          {title.toUpperCase()}
        </Text>
      );
    case "bubbly":
      return (
        <Text {...a11y} style={[headingStyles.bubbly, { color: accent }]}>
          {title.toLowerCase()}
        </Text>
      );
    case "legend":
      return (
        <Text {...a11y} style={[headingStyles.legend, { color: accent, backgroundColor: palette.background }]}>
          {title}
        </Text>
      );
    case "dotCaps": {
      // Editorial: "The .SERVICES" between hairlines.
      const [lead, rest] = headingPair(section);
      const line = color ? withAlpha(color, 0.35) : sheetInk(palette.background).border;
      return (
        <View {...a11y} accessible style={headingStyles.ruledRow}>
          <View style={[headingStyles.rule, { backgroundColor: line }]} />
          <Text style={[headingStyles.dotLight, { color: ink }]} numberOfLines={1}>
            {lead}{" "}
            <Text style={headingStyles.dotBold}>
              <Text style={{ color: accent }}>.</Text>
              {rest.toUpperCase()}
            </Text>
          </Text>
          <View style={[headingStyles.rule, { backgroundColor: line }]} />
        </View>
      );
    }
    case "scriptCaps": {
      // Heritage: a script word between short rules, spaced serif caps under it.
      const [lead, rest] = headingPair(section);
      return (
        <View {...a11y} accessible style={headingStyles.stack}>
          <View style={headingStyles.shortRuleRow}>
            <View style={[headingStyles.shortRule, { backgroundColor: accent }]} />
            <Text style={[headingStyles.heritageScript, { color: accent }]}>{lead}</Text>
            <View style={[headingStyles.shortRule, { backgroundColor: accent }]} />
          </View>
          <Text style={[headingStyles.heritageCaps, { color: ink }]}>{rest.toUpperCase()}</Text>
        </View>
      );
    }
    case "layered": {
      // Duet: a big script word with heavy caps laid over its foot.
      const [lead, rest] = headingPair(section);
      return (
        <View {...a11y} accessible style={headingStyles.stack}>
          <Text style={[headingStyles.layeredScript, { color: accent }]}>{lead}</Text>
          <Text style={[headingStyles.layeredCaps, { color: ink }]}>{rest.toUpperCase()}</Text>
        </View>
      );
    }
    case "groovy":
      return (
        <View {...a11y} accessible style={headingStyles.groovyWrap}>
          <Text style={[headingStyles.groovy, { color: ink }]}>{headingPair(section).join(" ").toLowerCase()}</Text>
          <Squiggle color={accent} />
        </View>
      );
    case "room":
      // Gallery: a wall label over the title.
      return (
        <View {...a11y} accessible style={headingStyles.roomWrap}>
          <Text style={[headingStyles.roomKicker, { color: color ?? sheetInk(palette.background).sub }]}>
            {GALLERY_KICKERS[section]}
          </Text>
          <Text style={[headingStyles.roomTitle, { color: ink }]}>{headingPair(section).join(" ")}</Text>
        </View>
      );
    case "labelCaps": {
      const line = sheetInk(palette.background).border;
      return (
        <View {...a11y} accessible style={headingStyles.ruledRow}>
          <View style={[headingStyles.rule, { backgroundColor: line }]} />
          <Text style={[headingStyles.labelCaps, { color: ink }]} numberOfLines={1}>
            {headingPair(section).join(" ").toUpperCase()}
          </Text>
          <View style={[headingStyles.rule, { backgroundColor: line }]} />
        </View>
      );
    }
    default:
      return (
        // Only ever drawn on the page: Classic's in-card title is PageSection's own Text.
        <Text {...a11y} style={[headingStyles.plain, { color: ink }]}>
          {title}
        </Text>
      );
  }
}

// ── Section surface ───────────────────────────────────────────────────────────

/**
 * One profile section: its heading and the surface it sits on, both following
 * the page style. Classic is the frosted card with the title inside it.
 *
 * `bare` drops the surface but keeps the heading, for content that brings its
 * own tiles (the policy grids).
 */
export function PageSection({
  section,
  palette,
  children,
  bare = false,
  headingRight,
  style,
}: {
  section: PageSectionKey;
  palette: PageStylePalette;
  children: React.ReactNode;
  bare?: boolean;
  /** Something on the heading's line, at the right (Portfolio's "See all"). */
  headingRight?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const pageStyle = palette.pageStyle;
  const square = !!palette.squareCards;

  if (!pageStyle || pageStyle.cards === "frosted") {
    return (
      <BlurView
        intensity={palette.blurIntensity}
        tint={palette.blurTint}
        style={[
          surfaceStyles.frosted,
          { backgroundColor: palette.cardBackground, borderColor: palette.border },
          square && surfaceStyles.square,
          style,
        ]}
      >
        <LinearGradient colors={palette.highlightColors} style={StyleSheet.absoluteFill} />
        <HeadingLine headingRight={headingRight}>
          <Text accessibilityRole="header" style={[headingStyles.plain, { color: palette.text }]}>
            {PAGE_SECTION_TITLES[section]}
          </Text>
        </HeadingLine>
        {children}
      </BlurView>
    );
  }

  if (pageStyle.cards === "outline") {
    return (
      <View
        style={[
          surfaceStyles.outline,
          { borderColor: withAlpha(palette.accent, 0.6) },
          bare && surfaceStyles.outlineBare,
          style,
        ]}
      >
        <View style={surfaceStyles.legendWrap} pointerEvents="box-none">
          <PageSectionHeading section={section} palette={palette} />
        </View>
        {headingRight ? <View style={surfaceStyles.legendRight}>{headingRight}</View> : null}
        {children}
      </View>
    );
  }

  const heading = (
    <HeadingLine headingRight={headingRight} centered={isCentredHeading(pageStyle)}>
      <PageSectionHeading section={section} palette={palette} />
    </HeadingLine>
  );

  if (bare || pageStyle.cards === "none" || pageStyle.cards === "open") {
    return (
      <View
        style={[
          surfaceStyles.onPage,
          pageStyle.cards === "none" && { borderTopColor: sheetInk(palette.background).separator },
          pageStyle.cards === "none" && surfaceStyles.onPageRule,
          style,
        ]}
      >
        {heading}
        {children}
      </View>
    );
  }

  const radius = square || pageStyle.cards === "label"
    ? 0
    : pageStyle.cards === "flat" ? 6
    : pageStyle.cards === "gloss" ? 28
    : pageStyle.cards === "chunky" ? 26
    : pageStyle.cards === "offset" ? 22
    : 18;

  if (pageStyle.cards === "offset" || pageStyle.cards === "chunky" || pageStyle.cards === "label") {
    // Duet and Groovy: an outlined card on a hard shadow (a backing block, so
    // Android draws it too). Apothecary: an outline with a fine inner rule.
    const outline = outlineInk(palette.cardBackground);
    const chunky = pageStyle.cards === "chunky";
    return (
      <View style={[surfaceStyles.block, style]}>
        {heading}
        <View>
          {pageStyle.cards !== "label" ? (
            <View
              style={[
                surfaceStyles.hardShadow,
                chunky ? surfaceStyles.hardShadowChunky : null,
                { borderRadius: radius, backgroundColor: chunky ? palette.accent : blend(palette.accent, "#FFFFFF", 0.55) },
              ]}
              pointerEvents="none"
            />
          ) : null}
          <View
            style={[
              surfaceStyles.solid,
              {
                backgroundColor: palette.cardBackground,
                borderRadius: radius,
                borderWidth: chunky ? 2 : pageStyle.cards === "offset" ? 1.5 : 1,
                borderColor: outline,
              },
            ]}
          >
            {pageStyle.cards === "label" ? (
              <View style={[surfaceStyles.innerRule, { borderColor: withAlpha(palette.accent, 0.7) }]} pointerEvents="none" />
            ) : null}
            {children}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[surfaceStyles.block, style]}>
      {heading}
      <View
        style={[
          surfaceStyles.solid,
          { backgroundColor: palette.cardBackground, borderRadius: radius },
          pageStyle.cards === "paper" && surfaceStyles.paper,
          pageStyle.cards === "gloss" && [surfaceStyles.gloss, { borderColor: withAlpha(palette.accent, 0.35) }],
        ]}
      >
        {pageStyle.cards === "gloss" ? <GlossShine radius={radius} /> : null}
        {children}
      </View>
    </View>
  );
}

function isCentredHeading(style: PageStyle): boolean {
  return (
    style.heading === "scriptPair" || style.heading === "spacedCaps" || style.heading === "bubbly"
    || style.heading === "scriptCaps" || style.heading === "layered"
  );
}

/** Groovy's wavy underline. */
function Squiggle({ color }: { color: string }) {
  return (
    <Svg width={132} height={12} viewBox="0 0 140 12" pointerEvents="none">
      <Path d="M2 8Q12 0 22 8T42 8T62 8T82 8T102 8T122 8T138 6" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

function HeadingLine({
  children,
  headingRight,
  centered = false,
}: {
  children: React.ReactNode;
  headingRight?: React.ReactNode;
  centered?: boolean;
}) {
  if (!headingRight) return <View style={centered ? surfaceStyles.centred : undefined}>{children}</View>;
  return (
    <View style={surfaceStyles.headingLine}>
      <View style={surfaceStyles.headingFlex}>{children}</View>
      {headingRight}
    </View>
  );
}

/** The shine strip along the top of a Glossy card. */
export function GlossShine({ radius }: { radius: number }) {
  return (
    <LinearGradient
      colors={["rgba(255,255,255,0.7)", "rgba(255,255,255,0)"]}
      style={[surfaceStyles.shine, { borderRadius: Math.min(radius, 100) }]}
      pointerEvents="none"
    />
  );
}

/** A wavy top or bottom edge for a full-width band (Scrapbook's policies). */
export function WaveEdge({ color, position, width }: { color: string; position: "top" | "bottom"; width: number }) {
  const d = position === "top"
    ? "M0 40 C90 0 180 40 260 18 S350 4 375 10 V40 Z"
    : "M0 0 H375 V20 C300 40 200 8 120 28 S30 30 0 22 Z";
  return (
    <Svg width={width} height={28} viewBox="0 0 375 40" preserveAspectRatio="none" pointerEvents="none">
      <Path d={d} fill={color} />
    </Svg>
  );
}

// ── Service cards ────────────────────────────────────────────────────────────

/**
 * How a service card's surface changes with the page style, laid over the
 * profile's own card style. Null for Classic, which keeps the frosted card.
 * Branding → Card Shape still wins on corners: the profile applies its square
 * style after this.
 */
export function serviceCardSurface(
  style: PageStyle,
  colours: { card: string; accent: string; sheet: string },
): ViewStyle | null {
  const flat = { borderWidth: 0, shadowOpacity: 0 } as const;
  switch (style.cards) {
    case "none":
    case "open":
      return {
        ...flat,
        backgroundColor: "transparent",
        borderRadius: 0,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: sheetInk(colours.sheet).separator,
        marginBottom: 0,
      };
    case "flat":
      return { ...flat, backgroundColor: colours.card, borderRadius: 6 };
    case "outline":
      return {
        backgroundColor: "transparent",
        borderWidth: 1.5,
        borderColor: withAlpha(colours.accent, 0.6),
        borderRadius: 0,
        shadowOpacity: 0,
      };
    case "paper":
      return {
        backgroundColor: colours.card,
        borderWidth: 0,
        borderRadius: 18,
        shadowColor: "#26201E",
        shadowOpacity: 0.12,
        shadowRadius: 12,
      };
    case "gloss":
      return {
        backgroundColor: blend(colours.accent, "#FFFFFF", 0.86),
        borderWidth: 1.5,
        borderColor: withAlpha(colours.accent, 0.35),
        borderRadius: 28,
      };
    // The hard shadows below are iOS shadows with no blur; Android draws the
    // outline alone (its elevation shadow can't be offset or solid).
    case "offset":
      return {
        backgroundColor: colours.card,
        borderWidth: 1.5,
        borderColor: outlineInk(colours.card),
        borderRadius: 22,
        shadowColor: blend(colours.accent, "#FFFFFF", 0.55),
        shadowOffset: { width: 4, height: 5 },
        shadowOpacity: 1,
        shadowRadius: 0,
        elevation: 0,
        // The card clips by default, which would cut the shadow off.
        overflow: "visible",
      };
    case "chunky":
      return {
        backgroundColor: colours.card,
        borderWidth: 2,
        borderColor: outlineInk(colours.card),
        borderRadius: 26,
        shadowColor: colours.accent,
        shadowOffset: { width: 4, height: 5 },
        shadowOpacity: 1,
        shadowRadius: 0,
        elevation: 0,
        // The card clips by default, which would cut the shadow off.
        overflow: "visible",
      };
    case "label":
      return { ...flat, backgroundColor: colours.card, borderWidth: 1, borderColor: outlineInk(colours.card), borderRadius: 0 };
    default:
      return null;
  }
}

// ── Accent bands ─────────────────────────────────────────────────────────────

/** A section on a full-width band of the accent colour, heading and all:
 *  Scrapbook's Policies (with wavy edges) and Editorial's About (straight).
 *  Bleeds out of the content sheet's 20pt side padding. Content inside reads
 *  onAccentInk(palette.accent). */
export function AccentBandSection({
  section,
  palette,
  waves = true,
  children,
}: {
  section: PageSectionKey;
  palette: PageStylePalette;
  waves?: boolean;
  children: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  const ink = onAccentInk(palette.accent);
  return (
    <View style={bandStyles.wrap}>
      {waves ? <WaveEdge color={palette.accent} position="top" width={width} /> : null}
      <View style={[bandStyles.band, !waves && bandStyles.straight, { backgroundColor: palette.accent }]}>
        <HeadingLine centered={palette.pageStyle ? isCentredHeading(palette.pageStyle) : false}>
          <PageSectionHeading section={section} palette={palette} color={ink.text} accentColor={ink.sub} />
        </HeadingLine>
        {children}
      </View>
      {waves ? <WaveEdge color={palette.accent} position="bottom" width={width} /> : null}
    </View>
  );
}

const bandStyles = StyleSheet.create({
  wrap: { marginHorizontal: -20, marginBottom: 24 },
  band: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 14, marginVertical: -1 },
  straight: { paddingTop: 22, paddingBottom: 22, marginVertical: 0 },
});

// ── Policies ─────────────────────────────────────────────────────────────────

/** Whether this style's policy list brings its own tiles (so its section drops the card). */
export function policiesBringOwnSurface(style: PageStyle | undefined): boolean {
  const layout = style?.policies;
  return (
    layout === "boxes" || layout === "discTiles" || layout === "bubbles" || layout === "band"
    || layout === "tiles" || layout === "divided" || layout === "stickers"
  );
}

/**
 * The policy rows in the page style's layout. Classic keeps its own list
 * inside the About/Policy card, so this is only used once a style is picked.
 * `ink` is the text colour for wherever the list sits (the page, a card, or
 * the accent band).
 */
export function StyledPolicyList({
  rows,
  palette,
  ink,
}: {
  rows: PolicyDisplayRow[];
  palette: PageStylePalette;
  ink: { text: string; sub: string };
}) {
  const layout = palette.pageStyle?.policies ?? "hairline";
  const square = !!palette.squareCards;
  const page = sheetInk(palette.background);

  if (layout === "numerals") {
    // Heritage's House Rules (I, II…) and Apothecary's "Before your visit" (i., ii.).
    const lower = !!palette.pageStyle?.numeralsLower;
    return (
      <View>
        {rows.map((row, index) => (
          <View
            key={row.label}
            style={[policyStyles.numeralRow, { borderTopColor: page.separator }, index === 0 && policyStyles.hairFirst]}
          >
            <Text style={[lower ? policyStyles.numeralLower : policyStyles.numeral, { color: palette.accent }]}>
              {romanNumeral(index, lower)}
            </Text>
            <View style={policyStyles.numeralBody}>
              <Text style={[policyStyles.numeralLabel, { color: ink.text }]}>{row.label}</Text>
              <Text style={[policyStyles.value, { color: ink.sub }]}>{row.value}</Text>
              {row.notes?.map(note => (
                <Text key={note} style={[policyStyles.note, { color: ink.sub }]}>{note}</Text>
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (layout === "definition") {
    // Gallery's visitor information: a small caps label beside each value.
    return (
      <View>
        {rows.map((row, index) => (
          <View
            key={row.label}
            style={[policyStyles.defRow, { borderTopColor: page.separator }, index === 0 && policyStyles.hairFirst]}
          >
            <Text style={[policyStyles.defLabel, { color: ink.sub }]}>{row.label.toUpperCase()}</Text>
            <View style={policyStyles.hairValueCol}>
              <Text style={[policyStyles.defValue, { color: ink.text }]}>{row.value}</Text>
              {row.notes?.map(note => (
                <Text key={note} style={[policyStyles.note, { color: ink.sub }]}>{note}</Text>
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (layout === "divided") {
    // Duet: a grid split by accent lines, each policy under its icon.
    const lastRowStart = rows.length - (rows.length % 2 === 0 ? 2 : 1);
    return (
      <View style={policyStyles.dividedGrid}>
        {rows.map((row, index) => (
          <View
            key={row.label}
            style={[
              policyStyles.dividedCell,
              { borderColor: palette.accent },
              index % 2 === 0 && index < rows.length - 1 && policyStyles.dividedRight,
              index < lastRowStart && policyStyles.dividedBottom,
            ]}
          >
            <Ionicons name={row.icon} size={22} color={ink.text} />
            <Text style={[policyStyles.dividedLabel, { color: ink.text }]}>{row.label.toUpperCase()}</Text>
            <Text style={[policyStyles.smallValue, policyStyles.centreText, { color: ink.sub }]}>{row.value}</Text>
            {row.notes?.map(note => (
              <Text key={note} style={[policyStyles.note, policyStyles.centreText, { color: ink.sub }]}>{note}</Text>
            ))}
          </View>
        ))}
      </View>
    );
  }

  if (layout === "hairline" || layout === "rows") {
    return (
      <View>
        {rows.map((row, index) => (
          <View
            key={row.label}
            style={[policyStyles.hairRow, { borderTopColor: page.separator }, index === 0 && policyStyles.hairFirst]}
          >
            <Text style={[policyStyles.hairLabel, { color: ink.text }]}>{row.label}</Text>
            <View style={policyStyles.hairValueCol}>
              <Text style={[policyStyles.hairValue, { color: ink.sub }]}>{row.value}</Text>
              {row.notes?.map(note => (
                <Text key={note} style={[policyStyles.note, policyStyles.alignRight, { color: ink.sub }]}>{note}</Text>
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={policyStyles.grid}>
      {rows.map(row => {
        const tag = row.tag ? (
          <View style={[policyStyles.tag, { backgroundColor: palette.accent }]}>
            <Text style={[policyStyles.tagText, { color: onAccentInk(palette.accent).text }]}>{row.tag}</Text>
          </View>
        ) : null;
        const notes = row.notes?.map(note => (
          <Text key={note} style={[policyStyles.note, { color: ink.sub }, layout !== "boxes" && policyStyles.centreText]}>{note}</Text>
        ));

        if (layout === "boxes") {
          return (
            <View
              key={row.label}
              style={[policyStyles.cell, policyStyles.box, { borderColor: page.border }, square && policyStyles.square]}
            >
              <View style={policyStyles.boxLabelRow}>
                <Text style={[policyStyles.capsLabel, { color: ink.sub }]}>{row.label.toUpperCase()}</Text>
                {tag}
              </View>
              <Text style={[policyStyles.value, { color: ink.text }]}>{row.value}</Text>
              {notes}
            </View>
          );
        }

        if (layout === "discTiles") {
          return (
            <View key={row.label} style={[policyStyles.cell, policyStyles.discCell]}>
              <View style={[policyStyles.disc, { backgroundColor: palette.text }]}>
                <Ionicons name={row.icon} size={18} color={palette.cardBackground} />
              </View>
              <View style={[policyStyles.discTile, { backgroundColor: palette.cardBackground }, square && policyStyles.square]}>
                <Text style={[policyStyles.capsLabel, policyStyles.centreText, { color: palette.text }]}>{row.label.toUpperCase()}</Text>
                <Text style={[policyStyles.smallValue, policyStyles.centreText, { color: palette.sub }]}>{row.value}</Text>
                {row.notes?.map(note => (
                  <Text key={note} style={[policyStyles.note, policyStyles.centreText, { color: palette.sub }]}>{note}</Text>
                ))}
                {tag}
              </View>
            </View>
          );
        }

        if (layout === "circles") {
          return (
            <View key={row.label} style={[policyStyles.cell, policyStyles.circleCell]}>
              <View style={[policyStyles.outlineCircle, { borderColor: withAlpha(palette.accent, 0.6) }]}>
                <Ionicons name={row.icon} size={22} color={palette.accent} />
              </View>
              <Text style={[policyStyles.capsLabel, policyStyles.centreText, { color: palette.accent }]}>{row.label.toUpperCase()}</Text>
              <Text style={[policyStyles.smallValue, policyStyles.centreText, { color: ink.sub }]}>{row.value}</Text>
              {notes}
              {tag}
            </View>
          );
        }

        if (layout === "tiles") {
          // Editorial: tiles tinted with the accent.
          return (
            <View
              key={row.label}
              style={[policyStyles.cell, policyStyles.tile, { backgroundColor: withAlpha(palette.accent, 0.1) }, square && policyStyles.square]}
            >
              <View style={policyStyles.boxLabelRow}>
                <Text style={[policyStyles.tileLabel, { color: ink.text }]}>{row.label.toUpperCase()}</Text>
                {tag}
              </View>
              <Text style={[policyStyles.value, { color: ink.sub }]}>{row.value}</Text>
              {notes}
            </View>
          );
        }

        if (layout === "stickers") {
          // Groovy: filled tiles, each tilted a little, cycling through the accent,
          // a pale accent, an outlined card and the ink.
          const index = rows.indexOf(row);
          const fills = [palette.accent, blend(palette.accent, "#FFFFFF", 0.7), palette.cardBackground, page.text];
          const fill = fills[index % 4]!;
          const stickerInk = onAccentInk(fill);
          return (
            <View
              key={row.label}
              style={[
                policyStyles.cell,
                policyStyles.sticker,
                { backgroundColor: fill, transform: [{ rotate: index % 2 === 0 ? "-2deg" : "2deg" }] },
                index % 4 === 2 && { borderWidth: 2, borderColor: outlineInk(fill) },
                square && policyStyles.square,
              ]}
            >
              <Text style={[policyStyles.stickerLabel, { color: stickerInk.text }]}>{row.label.toLowerCase()}</Text>
              <Text style={[policyStyles.smallValue, { color: stickerInk.sub }]}>{row.value}</Text>
              {row.notes?.map(note => (
                <Text key={note} style={[policyStyles.note, { color: stickerInk.sub }]}>{note}</Text>
              ))}
              {tag}
            </View>
          );
        }

        if (layout === "band") {
          return (
            <View key={row.label} style={[policyStyles.cell, policyStyles.circleCell]}>
              <Ionicons name={row.icon} size={26} color={ink.text} />
              <Text style={[policyStyles.capsLabel, policyStyles.centreText, { color: ink.text }]}>{row.label.toUpperCase()}</Text>
              <Text style={[policyStyles.smallValue, policyStyles.centreText, { color: ink.sub }]}>{row.value}</Text>
              {notes}
              {tag}
            </View>
          );
        }

        // bubbles
        return (
          <View
            key={row.label}
            style={[
              policyStyles.cell,
              policyStyles.bubble,
              { backgroundColor: palette.cardBackground, borderColor: withAlpha(palette.accent, 0.35) },
              square && policyStyles.square,
            ]}
          >
            <Text style={[policyStyles.bubbleLabel, { color: palette.accent }]}>{row.label}</Text>
            <Text style={[policyStyles.smallValue, policyStyles.centreText, { color: palette.sub }]}>{row.value}</Text>
            {row.notes?.map(note => (
              <Text key={note} style={[policyStyles.note, policyStyles.centreText, { color: palette.sub }]}>{note}</Text>
            ))}
            {tag}
          </View>
        );
      })}
    </View>
  );
}

const headingStyles = StyleSheet.create({
  plain: { fontFamily: "BakbakOne-Regular", fontSize: 20, marginBottom: 16 },
  bigLower: { fontFamily: "Syne_700Bold", fontSize: 38, lineHeight: 42, letterSpacing: -1.2, marginBottom: 14 },
  pairRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 6, marginBottom: 14 },
  script: { fontFamily: "PinyonScript_400Regular", fontSize: 32, lineHeight: 46 },
  serif: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 24, lineHeight: 32 },
  capsRow: { flexDirection: "row", alignItems: "baseline", gap: 4, marginBottom: 12 },
  centerRow: { justifyContent: "center" },
  // Each style has a heading face of its own: Syne (Cover), Pinyon + Playfair
  // (Arch), Limelight (Framed), Bebas Neue + Sacramento (Scrapbook), Tenor Sans
  // (Spa), Shrikhand (Glossy).
  caps: { fontFamily: "BebasNeue_400Regular", fontSize: 32, lineHeight: 36, letterSpacing: 0.5 },
  capsScript: { fontFamily: "Sacramento_400Regular", fontSize: 34, lineHeight: 40 },
  spaced: { fontFamily: "TenorSans_400Regular", fontSize: 11, letterSpacing: 4, textAlign: "center", marginBottom: 16 },
  bubbly: { fontFamily: "Shrikhand_400Regular", fontSize: 26, lineHeight: 34, textAlign: "center", marginBottom: 12 },
  legend: { fontFamily: "Limelight_400Regular", fontSize: 20, lineHeight: 28, paddingHorizontal: 12 },
  // 2026-11-14 styles: League Spartan (Editorial), Pinyon + Bodoni Moda
  // (Heritage), Great Vibes + Montserrat (Duet), Fraunces (Groovy), Didact
  // Gothic + Instrument Serif (Gallery), Cormorant Garamond (Apothecary).
  ruledRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth * 2, minWidth: 12 },
  dotLight: { fontFamily: "LeagueSpartan-Light", fontSize: 26, lineHeight: 32, flexShrink: 1 },
  dotBold: { fontFamily: "LeagueSpartan-ExtraBold" },
  stack: { alignItems: "center", marginBottom: 14 },
  shortRuleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  shortRule: { width: 36, height: 1 },
  heritageScript: { fontFamily: "PinyonScript_400Regular", fontSize: 30, lineHeight: 42 },
  heritageCaps: { fontFamily: "BodoniModa-ExtraBold", fontSize: 21, letterSpacing: 5, marginTop: -4, textAlign: "center" },
  layeredScript: { fontFamily: "GreatVibes_400Regular", fontSize: 50, lineHeight: 62 },
  layeredCaps: { fontFamily: "Montserrat-ExtraBold", fontSize: 21, letterSpacing: 1, marginTop: -26, textAlign: "center" },
  groovyWrap: { marginBottom: 14 },
  groovy: { fontFamily: "Fraunces-SoftBlackItalic", fontSize: 36, lineHeight: 42, letterSpacing: -0.8 },
  roomWrap: { marginBottom: 14 },
  roomKicker: { fontFamily: "DidactGothic-Regular", fontSize: 10, letterSpacing: 2 },
  roomTitle: { fontFamily: "InstrumentSerif-Regular", fontSize: 32, lineHeight: 36, marginTop: 2 },
  labelCaps: { fontFamily: "CormorantGaramond-SemiBold", fontSize: 14, letterSpacing: 4 },
});

const surfaceStyles = StyleSheet.create({
  frosted: {
    padding: 22,
    borderRadius: 26,
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  square: { borderRadius: 0 },
  onPage: { marginBottom: 26 },
  onPageRule: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 22 },
  block: { marginBottom: 24 },
  solid: { padding: 20, overflow: "hidden" },
  paper: {
    shadowColor: "#26201E",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
    overflow: "visible",
  },
  gloss: { borderWidth: 1.5 },
  shine: { position: "absolute", top: 5, left: 16, right: 16, height: 18 },
  outline: {
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingTop: 30,
    paddingBottom: 18,
    marginTop: 14,
    marginBottom: 30,
  },
  outlineBare: { paddingHorizontal: 10 },
  legendWrap: { position: "absolute", top: -16, left: 0, right: 0, alignItems: "center" },
  legendRight: { position: "absolute", top: 6, right: 10 },
  centred: { alignItems: "center" },
  headingLine: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  hardShadow: { position: "absolute", top: 5, left: 4, right: -4, bottom: -5 },
  hardShadowChunky: { top: 6, left: 5, right: -5, bottom: -6 },
  innerRule: { position: "absolute", top: 6, left: 6, right: 6, bottom: 6, borderWidth: 1 },
  headingFlex: { flexShrink: 1 },
});

const policyStyles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  cell: { flexBasis: "46%", flexGrow: 1 },
  square: { borderRadius: 0 },
  box: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 4 },
  boxLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  capsLabel: { fontFamily: "BakbakOne-Regular", fontSize: 10, letterSpacing: 1.3 },
  value: { fontSize: 13, lineHeight: 18 },
  smallValue: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  note: { fontSize: 11, lineHeight: 15, marginTop: 3 },
  centreText: { textAlign: "center" },
  alignRight: { textAlign: "right" },
  tag: { alignSelf: "center", borderRadius: 100, paddingHorizontal: 7, paddingVertical: 2, marginTop: 4 },
  tagText: { fontFamily: "BakbakOne-Regular", fontSize: 9, letterSpacing: 0.8 },
  discCell: { alignItems: "center" },
  disc: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", zIndex: 1, marginBottom: -20 },
  discTile: { alignSelf: "stretch", borderRadius: 6, paddingTop: 28, paddingHorizontal: 10, paddingBottom: 14, alignItems: "center", flexGrow: 1 },
  circleCell: { alignItems: "center", gap: 6, paddingVertical: 4 },
  outlineCircle: { width: 54, height: 54, borderRadius: 27, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  bubble: { borderRadius: 22, borderWidth: 1.5, padding: 14, alignItems: "center" },
  bubbleLabel: { fontFamily: "Fredoka_600SemiBold", fontSize: 14 },
  hairRow: { flexDirection: "row", gap: 16, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth },
  numeralRow: { flexDirection: "row", gap: 14, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  numeral: { fontFamily: "BodoniModa-ExtraBold", fontSize: 17, width: 30 },
  numeralLower: { fontFamily: "CormorantGaramond-MediumItalic", fontSize: 18, width: 30 },
  numeralBody: { flex: 1, gap: 2 },
  numeralLabel: { fontSize: 14, fontWeight: "600" },
  defRow: { flexDirection: "row", gap: 12, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth },
  defLabel: { fontFamily: "DidactGothic-Regular", fontSize: 10.5, letterSpacing: 1.2, width: 104, paddingTop: 2 },
  defValue: { fontSize: 13, lineHeight: 18 },
  dividedGrid: { flexDirection: "row", flexWrap: "wrap" },
  dividedCell: { width: "50%", alignItems: "center", paddingHorizontal: 10, paddingVertical: 14, gap: 4 },
  dividedRight: { borderRightWidth: 1.5 },
  dividedBottom: { borderBottomWidth: 1.5 },
  dividedLabel: { fontFamily: "Montserrat-ExtraBold", fontSize: 10, letterSpacing: 1.6, marginTop: 4, textAlign: "center" },
  tile: { borderRadius: 14, padding: 14, gap: 6 },
  tileLabel: { fontFamily: "LeagueSpartan-ExtraBold", fontSize: 13, letterSpacing: 1 },
  sticker: { borderRadius: 22, padding: 14 },
  stickerLabel: { fontFamily: "Fraunces-SoftBlackItalic", fontSize: 16 },
  hairFirst: { borderTopWidth: 0 },
  hairLabel: { fontFamily: "TenorSans_400Regular", fontSize: 14, flexShrink: 0, maxWidth: "45%" },
  hairValueCol: { flex: 1 },
  hairValue: { fontSize: 13, lineHeight: 18, textAlign: "right" },
});
