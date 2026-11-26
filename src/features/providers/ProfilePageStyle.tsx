// src/features/providers/ProfilePageStyle.tsx
//
// The pieces of the public profile that change with Branding → Page Style
// (constants/pageStyles): a section's heading, the surface it sits on, and the
// policy list. Classic draws exactly what the profile always drew — the
// frosted card with its Bakbak title inside — so a provider who never picks a
// style sees no change.

import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle, useWindowDimensions } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";

import {
  chapterHeading,
  customHeadingPair,
  headingPair,
  HUSH_TITLES,
  PAGE_SECTION_TITLES,
  romanNumeral,
  SECTION_NUMBERS,
  type PageSectionKey,
  type PageStyle,
} from "../../constants/pageStyles";
import { blend, isDarkColor, withAlpha } from "../../constants/providerThemes";
import type { PolicyDisplayRow } from "../../utils/policyDisplay";
import { BulldogClip } from "./heroes/CallingCardHero";
import { EmbossedText, pressEdges } from "./heroes/EmbossedHero";
import { BowGlyph, Pearl, ribbonColours, stripeColours } from "./heroes/demureOrnaments";
import { SectionDivider } from "./pageParts";
import { capsuleTones } from "./heroes/CapsuleHero";
import { LATTE_OVERLAP, latteBand, latteGlass, latteInk, latteShade } from "./heroes/LatteHero";
import { GlowText } from "./heroes/NeonHero";

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
  /** Latte: the page's own colour, kept when `background` is swapped for a
   *  section's band (pourPalette), so the pour is always worked out from it. */
  pourSheet?: string;
}

/** Latte: the palette for one section, its band in place of the page colour
 *  and the ink that reads on it, so everything in the section (drawn straight
 *  on the band) turns light on the deep bands. Every other style gets its
 *  palette back unchanged. */
export function pourPalette(palette: PageStylePalette, section: PageSectionKey): PageStylePalette {
  if (palette.pageStyle?.cards !== "pour") return palette;
  const sheet = palette.pourSheet ?? palette.background;
  const band = latteBand(palette.accent, sheet, section);
  const ink = sheetInk(band);
  return {
    ...palette,
    pourSheet: sheet,
    background: band,
    text: ink.text,
    sub: ink.sub,
    border: ink.border,
    separator: ink.separator,
    cardBackground: latteGlass(band),
  };
}

/** pourPalette, kept the same object until the palette changes (for the memoized sections). */
export function usePourPalette(palette: PageStylePalette, section: PageSectionKey): PageStylePalette {
  return useMemo(() => pourPalette(palette, section), [palette, section]);
}

/** Latte: a band drawn round a section that brings its own heading (the
 *  services, the portfolio, the policy pictures), from its pourPalette; null
 *  on every other style. */
export function pourBandStyle(palette: PageStylePalette): ViewStyle | null {
  if (palette.pageStyle?.cards !== "pour") return null;
  return { ...surfaceStyles.pour, backgroundColor: palette.background };
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

/** Custom's text font as a style to lay over a line of body text, or null on
 *  every other page style (they keep the app's text font). The weight goes
 *  back to regular: the bold set for Jura would make a phone fake a bold, or
 *  fall back to the system font, for a face that only comes in one weight. */
export function customTextStyle(style: PageStyle | undefined): { fontFamily: string; fontWeight: "400" } | null {
  return style?.custom ? { fontFamily: style.custom.textFont, fontWeight: "400" } : null;
}

/** True when the style draws a section straight on the page (no card behind it). */
export function sectionsSitOnPage(style: PageStyle | undefined): boolean {
  return style?.cards === "none" || style?.cards === "outline" || style?.cards === "open" || style?.cards === "sheer" || style?.cards === "ruled"
    // Latte: straight on its band.
    || style?.cards === "pour"
    // Riviera: content straight on its strip, with no box.
    || (style?.cards === "stripes" && !!style.openStrips);
}

/** True when the style's services sit straight on the page, so the price
 *  list takes the page's ink: every style whose sections do, and Moodboard,
 *  whose sections are white prints but whose services are hairline rows. */
export function servicesSitOnPage(style: PageStyle | undefined): boolean {
  return sectionsSitOnPage(style) || style?.cards === "print";
}

/** Sheer's see-through box on the content area: a hairline and a faint wash, never a solid card. */
function sheerBox(sheet: string): { borderColor: string; backgroundColor: string } {
  const ink = sheetInk(sheet);
  return {
    borderColor: withAlpha(ink.text, 0.42),
    backgroundColor: isDarkColor(sheet) ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.38)",
  };
}

/** Dark ink for an outline on a card of this colour (Duet, Groovy, Apothecary). */
export function outlineInk(card: string): string {
  return isDarkColor(card) ? "#F2EDEA" : "#1F1A1C";
}

/** The colours content inside a section should use under this style. */
export function sectionInk(palette: PageStylePalette): { text: string; sub: string; border: string; separator: string } {
  if (sectionsSitOnPage(palette.pageStyle)) return sheetInk(palette.background);
  return { text: palette.text, sub: palette.sub, border: palette.border, separator: palette.separator };
}

// ── Headings ──────────────────────────────────────────────────────────────────

/** Gazette's section headlines: what a newspaper would call each section. */
const GAZETTE_HEADLINES: Record<PageSectionKey, string> = {
  about: "Meet the Artist",
  policies: "Booking Policies",
  services: "The Services",
  reviews: "Letters to the Editor",
  hours: "Business Hours",
  contact: "Contact",
  info: "Good to Know",
  portfolio: "My Portfolio",
  specialities: "My Specialities",
  policyPages: "Before You Book",
  keyInfo: "Key Information",
  faq: "Questions Answered",
  aftercare: "Aftercare",
  custom: "More Information",
  disclaimer: "Disclaimer",
};

/** Studio's card tabs: a short label on the tab above each section's card. */
const STUDIO_TABS: Record<PageSectionKey, string> = {
  about: "Meet me",
  policies: "Read first",
  services: "Book in",
  reviews: "Reviews",
  hours: "Open",
  contact: "Say hi",
  info: "Good to know",
  portfolio: "My work",
  specialities: "What I love",
  policyPages: "Before you book",
  keyInfo: "Key info",
  faq: "Q&A",
  aftercare: "Aftercare",
  custom: "More info",
  disclaimer: "Disclaimer",
};

/** A section heading in the page style's voice. Classic's heading lives inside
 *  the card, so it's drawn by PageSection, not here. */
export function PageSectionHeading({
  section,
  palette,
  color,
  accentColor,
  align,
  title: ownTitle,
}: {
  section: PageSectionKey;
  palette: PageStylePalette;
  /** Overrides the ink (the Scrapbook band draws its heading on the accent). */
  color?: string;
  accentColor?: string;
  align?: "left" | "center";
  /** A Custom section's own name, drawn in place of the style's wording. */
  title?: string | undefined;
}) {
  const style = palette.pageStyle;
  const custom = ownTitle?.trim() || null;
  const title = custom ?? PAGE_SECTION_TITLES[section];
  // Two-part headings: a lead-in, then the name. A one-word Custom name has
  // no lead-in, so each style below draws the lead only when there is one.
  const pair: [string, string] = custom ? customHeadingPair(custom) : headingPair(section, style?.key);
  const words = pair.filter(Boolean).join(" ");
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
      const [lead, rest] = pair;
      return (
        <View {...a11y} accessible style={headingStyles.pairRow}>
          {lead ? <Text style={[headingStyles.script, { color: ink }]}>{lead}</Text> : null}
          <Text style={[headingStyles.serif, { color: ink }]}>{rest}</Text>
        </View>
      );
    }
    case "capsScript": {
      const [lead, rest] = pair;
      return (
        <View
          {...a11y}
          accessible
          style={[headingStyles.capsRow, align === "center" && headingStyles.centerRow]}
        >
          {lead ? <Text style={[headingStyles.caps, { color: color ?? accent }]}>{lead.toUpperCase()}</Text> : null}
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
      const [lead, rest] = pair;
      const line = color ? withAlpha(color, 0.35) : sheetInk(palette.background).border;
      return (
        <View {...a11y} accessible style={headingStyles.ruledRow}>
          <View style={[headingStyles.rule, { backgroundColor: line }]} />
          <Text style={[headingStyles.dotLight, { color: ink }]} numberOfLines={1}>
            {lead ? `${lead} ` : ""}
            <Text style={headingStyles.dotBold}>
              <Text style={{ color: accent }}>.</Text>
              {rest.toUpperCase()}
            </Text>
          </Text>
          <View style={[headingStyles.rule, { backgroundColor: line }]} />
        </View>
      );
    }
    case "italicCaps": {
      // Heritage: an italic word between short rules, engraved caps under it.
      const [lead, rest] = pair;
      return (
        <View {...a11y} accessible style={headingStyles.stack}>
          {lead ? (
            <View style={headingStyles.shortRuleRow}>
              <View style={[headingStyles.shortRule, { backgroundColor: accent }]} />
              <Text style={[headingStyles.heritageScript, { color: accent }]}>{lead}</Text>
              <View style={[headingStyles.shortRule, { backgroundColor: accent }]} />
            </View>
          ) : null}
          <Text style={[headingStyles.heritageCaps, { color: ink }]}>{rest.toUpperCase()}</Text>
        </View>
      );
    }
    case "layered": {
      // Duet: a big script word with heavy caps over its foot.
      const [lead, rest] = pair;
      return (
        <View {...a11y} accessible style={headingStyles.stack}>
          {lead ? <Text style={[headingStyles.layeredScript, { color: accent }]}>{lead}</Text> : null}
          <Text style={[headingStyles.layeredCaps, { color: ink }]}>{rest.toUpperCase()}</Text>
        </View>
      );
    }
    case "groovy":
      return (
        <View {...a11y} accessible style={headingStyles.groovyWrap}>
          <Text style={[headingStyles.groovy, { color: ink }]}>{words.toLowerCase()}</Text>
          <Squiggle color={accent} />
        </View>
      );
    case "serifTitle":
      return (
        <Text {...a11y} style={[headingStyles.serifTitle, { color: ink }]}>
          {words}
        </Text>
      );
    case "indexed":
      // Signature: "03 — The Services".
      return (
        <View {...a11y} accessible style={headingStyles.indexRow}>
          <Text style={[headingStyles.indexNumber, { color: accent }]}>{SECTION_NUMBERS[section]}</Text>
          <View style={[headingStyles.indexRule, { backgroundColor: accent }]} />
          <Text style={[headingStyles.indexTitle, { color: ink }]} numberOfLines={1}>{words}</Text>
        </View>
      );
    case "condensed":
      // Snapshot: huge condensed caps over a short accent bar.
      return (
        <View {...a11y} accessible style={headingStyles.condensedWrap}>
          <Text style={[headingStyles.condensed, { color: ink }]} numberOfLines={1} adjustsFontSizeToFit>
            {words.toUpperCase()}
          </Text>
          <View style={[headingStyles.condensedBar, { backgroundColor: accent }]} />
        </View>
      );
    case "quietCaps": {
      // Quiet: Josefin Sans caps on the left, a hairline running out after them.
      const line = sheetInk(palette.background).border;
      return (
        <View {...a11y} accessible style={headingStyles.ruledRow}>
          <Text style={[headingStyles.quietCaps, { color: ink }]} numberOfLines={1}>
            {words.toUpperCase()}
          </Text>
          <View style={[headingStyles.rule, { backgroundColor: line }]} />
        </View>
      );
    }
    case "sheerCaps":
      // Sheer: thin Bellefair caps, widely spaced, centred.
      return (
        <Text {...a11y} style={[headingStyles.sheerCaps, { color: ink }]}>
          {words.toUpperCase()}
        </Text>
      );
    case "embossCaps":
      // Embossed: the title pressed up out of the page, in the page's own colour.
      return (
        <View {...a11y} accessible style={headingStyles.embossWrap}>
          <EmbossedText paper={palette.background} style={headingStyles.embossCaps} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {words.toUpperCase()}
          </EmbossedText>
        </View>
      );
    case "engravedCaps": {
      // Calling Card: engraved serif caps, centred between hairlines.
      const line = color ? withAlpha(color, 0.35) : sheetInk(palette.background).border;
      return (
        <View {...a11y} accessible style={headingStyles.ruledRow}>
          <View style={[headingStyles.rule, { backgroundColor: line }]} />
          <Text style={[headingStyles.engravedCaps, { color: ink }]} numberOfLines={1}>
            {words.toUpperCase()}
          </Text>
          <View style={[headingStyles.rule, { backgroundColor: line }]} />
        </View>
      );
    }
    case "newsRule":
      // Gazette: condensed caps between a thick rule and a thin one.
      return (
        <View {...a11y} accessible style={[headingStyles.newsRule, { borderColor: ink }]}>
          <Text style={[headingStyles.newsTitle, { color: ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {(custom ?? GAZETTE_HEADLINES[section]).toUpperCase()}
          </Text>
        </View>
      );
    case "chunkyCaps": {
      // Studio: a lowercase script word in the accent, then the title in
      // big Young Serif caps, on one centred line where it fits.
      const [lead, rest] = pair;
      return (
        <View {...a11y} accessible style={headingStyles.stack}>
          <Text style={[headingStyles.chunkyCaps, { color: ink }]}>
            {lead ? <Text style={[headingStyles.chunkyScript, { color: accent }]}>{lead.toLowerCase()} </Text> : null}
            {rest.toUpperCase()}
          </Text>
        </View>
      );
    }
    case "chapter": {
      // Novel: "CHAPTER III" in small caps, the title in italic, a foil-style
      // ornament under it (rule, diamond, rule) in the accent.
      const [number, defaultChapterTitle] = chapterHeading(section);
      const chapterTitle = custom ?? defaultChapterTitle;
      return (
        <View {...a11y} accessible style={headingStyles.stack}>
          <Text style={[headingStyles.chapterNumber, { color: color ?? sheetInk(palette.background).sub }]}>
            {number.toUpperCase()}
          </Text>
          <Text style={[headingStyles.chapterTitle, { color: ink }]}>{chapterTitle}</Text>
          <Svg width={96} height={12} viewBox="0 0 120 14" pointerEvents="none">
            <Path d="M4 7h44M72 7h44" stroke={accent} strokeWidth={1.2} />
            <Path d="M60 1l6 6-6 6-6-6z" fill={accent} />
          </Svg>
        </View>
      );
    }
    case "labelCaps": {
      const line = sheetInk(palette.background).border;
      return (
        <View {...a11y} accessible style={headingStyles.ruledRow}>
          <View style={[headingStyles.rule, { backgroundColor: line }]} />
          <Text style={[headingStyles.labelCaps, { color: ink }]} numberOfLines={1}>
            {words.toUpperCase()}
          </Text>
          <View style={[headingStyles.rule, { backgroundColor: line }]} />
        </View>
      );
    }
    case "loungeCaps":
      // Lounge: tall condensed caps, centred, with "PLEASE REVIEW MY" over the policies.
      return (
        <View {...a11y} accessible style={headingStyles.stack}>
          {section === "policies" ? (
            <Text style={[headingStyles.loungeKicker, { color: color ?? sheetInk(palette.background).sub }]}>PLEASE REVIEW MY</Text>
          ) : null}
          <Text style={[headingStyles.loungeCaps, { color: ink }]}>{words.toUpperCase()}</Text>
        </View>
      );
    case "softCaps":
      // Soft Focus: heavy grotesk caps at the top left of the section's own card.
      return (
        <Text {...a11y} style={[headingStyles.softCaps, { color: ink }]}>
          {words.toUpperCase()}
        </Text>
      );
    case "hushRule": {
      // Hush: tiny spaced caps between hairlines, in its own quiet words.
      const line = color ? withAlpha(color, 0.3) : sheetInk(palette.background).border;
      return (
        <View {...a11y} accessible style={headingStyles.ruledRow}>
          <View style={[headingStyles.rule, { backgroundColor: line }]} />
          <Text style={[headingStyles.hushRule, { color: color ?? sheetInk(palette.background).sub }]} numberOfLines={1}>
            {(custom ?? HUSH_TITLES[section]).toUpperCase()}
          </Text>
          <View style={[headingStyles.rule, { backgroundColor: line }]} />
        </View>
      );
    }
    case "stripeCaps":
      // Stripes: spaced serif caps, centred at the top of the section's strip.
      return (
        <Text {...a11y} style={[headingStyles.stripeCaps, { color: ink }]}>
          {title.toUpperCase()}
        </Text>
      );
    case "bowSerif":
      // Bow: a small satin bow over an italic serif title.
      return (
        <View {...a11y} accessible style={headingStyles.stack}>
          <BowGlyph width={34} accent={accent} />
          <Text style={[headingStyles.bowTitle, { color: ink }]}>{words}</Text>
        </View>
      );
    case "appBold":
      // Pure: a bold sans title on the left, like an app's section.
      return (
        <Text {...a11y} style={[headingStyles.appBold, { color: ink }]}>
          {title}
        </Text>
      );
    case "gridIndex":
      // Grid: "03  Services", the number in the accent.
      return (
        <View {...a11y} accessible style={headingStyles.gridRow}>
          <Text style={[headingStyles.gridNumber, { color: accent }]}>{SECTION_NUMBERS[section]}</Text>
          <Text style={[headingStyles.appBold, headingStyles.gridTitle, { color: ink }]} numberOfLines={1}>{title}</Text>
        </View>
      );
    case "custom": {
      // Custom: the title in the font the provider picked, drawn the way they
      // chose: as typed, in small spaced caps, after its number, over a short
      // bar of their colour, or under a handwritten word. On outlined boxes it
      // sits in the top line, so it carries the page colour behind it to break
      // the line.
      const picks = style.custom;
      if (!picks) break;
      const caps = picks.headingStyle === "caps";
      const size = caps ? 13 : Math.round((picks.headingStyle === "script" ? 18 : 22) * picks.headingScale);
      const centred = picks.centred || align === "center";
      const legend = style.cards === "outline" && [headingStyles.customLegend, { backgroundColor: palette.background }];
      const fontStyle = {
        color: ink,
        fontFamily: picks.headingFont,
        fontSize: size,
        lineHeight: Math.round(size * 1.4),
        letterSpacing: caps ? 3.5 : 0,
      };
      const text = () => (
        <Text style={[headingStyles.customText, fontStyle, centred && headingStyles.customCentred]}>
          {caps ? title.toUpperCase() : title}
        </Text>
      );
      if (picks.headingStyle === "numbered") {
        return (
          <View {...a11y} accessible style={[headingStyles.custom, headingStyles.customRow, centred && headingStyles.centerRow, legend]}>
            <Text style={[headingStyles.customNumber, { color: accent }]}>{SECTION_NUMBERS[section]}</Text>
            <View style={[headingStyles.customRule, { backgroundColor: accent }]} />
            {text()}
          </View>
        );
      }
      if (picks.headingStyle === "underlined") {
        return (
          <View {...a11y} accessible style={[headingStyles.custom, centred && headingStyles.customStackCentred, legend]}>
            {text()}
            <View style={[headingStyles.customBar, { backgroundColor: accent }]} />
          </View>
        );
      }
      if (picks.headingStyle === "script") {
        // The lead-in ("Meet", "The") handwritten in the accent, the rest in their font.
        const [lead, rest] = pair;
        return (
          <View {...a11y} accessible style={[headingStyles.custom, headingStyles.customStackCentred, legend]}>
            {lead ? (
              <Text style={[headingStyles.customScript, picks.scriptFont ? { fontFamily: picks.scriptFont } : null, { color: accent }]}>
                {lead.toLowerCase()}
              </Text>
            ) : null}
            <Text style={[headingStyles.customText, fontStyle, headingStyles.customCentred, { letterSpacing: 2 }]}>{(rest || title).toUpperCase()}</Text>
          </View>
        );
      }
      return (
        <Text {...a11y} style={[headingStyles.custom, fontStyle, centred && headingStyles.customCentred, legend]}>
          {caps ? title.toUpperCase() : title}
        </Text>
      );
    }
    case "twoToneCaps": {
      // Poster: huge heavy caps on the left, the lead word in the ink and the
      // rest in the accent, lifted on a dark page so the pink still reads.
      const [lead, rest] = pair;
      const pop = isDarkColor(palette.background) ? blend(accent, "#FFFFFF", 0.5) : accent;
      return (
        <View {...a11y} accessible style={headingStyles.twoToneWrap}>
          {lead ? <Text style={[headingStyles.twoTone, { color: ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{lead.toUpperCase()}</Text> : null}
          <Text style={[headingStyles.twoTone, { color: color ?? pop }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>{rest.toUpperCase()}</Text>
        </View>
      );
    }
    case "enjoyStack": {
      // Hibiscus: "T H E" thin and widely spaced, then the name in heavy
      // condensed caps, both centred, like a drink poster.
      const [lead, rest] = pair;
      return (
        <View {...a11y} accessible style={headingStyles.enjoyWrap}>
          {lead ? <Text style={[headingStyles.enjoyLead, { color: ink }]}>{lead.toUpperCase()}</Text> : null}
          <Text style={[headingStyles.enjoyTitle, { color: color ?? accent }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{rest.toUpperCase()}</Text>
        </View>
      );
    }
    case "slantCaps": {
      // Storefront: a tiny spaced overline, then heavy slanted caps, like a shop's banner.
      const [lead, rest] = pair;
      return (
        <View {...a11y} accessible style={headingStyles.slantWrap}>
          {lead ? <Text style={[headingStyles.slantOver, { color: withAlpha(ink, 0.5) }]}>{lead.toUpperCase()}</Text> : null}
          <Text style={[headingStyles.slantTitle, { color: color ?? ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{rest.toUpperCase()}</Text>
        </View>
      );
    }
    case "neonScript": {
      // Neon: the title as a lowercase script word in the accent. On a dark
      // page it's lifted and glows like the sign at the top (stacked glow,
      // owner 2026-11-23: "it isn't glowing that much"); on a pale page it's
      // deepened so it still reads, with no glow.
      const dark = isDarkColor(palette.background);
      if (dark && !color) {
        return (
          <View {...a11y} accessible style={headingStyles.neonWrap}>
            <GlowText style={headingStyles.neonScript} tube={blend(accent, "#FFFFFF", 0.6)} glow={accent} strength={0.6} numberOfLines={1}>
              {words.toLowerCase()}
            </GlowText>
          </View>
        );
      }
      return (
        <Text {...a11y} style={[headingStyles.neonScript, { color: color ?? blend(accent, "#000000", 0.25) }]} numberOfLines={1}>
          {words.toLowerCase()}
        </Text>
      );
    }
    case "captionCaps": {
      // Moodboard: tiny, very widely spaced caps in a quiet ink, like the
      // captions on its prints, with a hairline running out after them.
      const line = color ? withAlpha(color, 0.3) : sheetInk(palette.background).border;
      return (
        <View {...a11y} accessible style={headingStyles.ruledRow}>
          <Text style={[headingStyles.captionCaps, { color: color ?? sheetInk(palette.background).sub }]} numberOfLines={1}>
            {words.toUpperCase()}
          </Text>
          <View style={[headingStyles.rule, { backgroundColor: line }]} />
        </View>
      );
    }
    case "pillMark": {
      // Capsule: a small pill in one of the two quiet tones, then the title
      // soft and lowercase. The portfolio is "my work", as on the canvas.
      const tone = capsuleTones(palette.accent, palette.background, palette.cardBackground)[CAPSULE_MARK_TONE[section]];
      return (
        <View {...a11y} accessible style={headingStyles.pillMarkRow}>
          <View style={[headingStyles.pillMark, { backgroundColor: tone }]} />
          <Text style={[headingStyles.pillMarkTitle, { color: ink }]} numberOfLines={1}>
            {section === "portfolio" && !custom ? "my work" : words.toLowerCase()}
          </Text>
        </View>
      );
    }
    case "pourSerif":
      // Latte: a plain serif title in the band's ink. The portfolio is "My work".
      return (
        <Text {...a11y} style={[headingStyles.pourSerif, { color: ink }]} numberOfLines={2}>
          {section === "portfolio" && !custom ? "My work" : title}
        </Text>
      );
    case "shopSerif":
      // Boutique: a big serif title on the left, like a shop's department.
      return (
        <Text {...a11y} style={[headingStyles.shopSerif, { color: ink }]}>
          {words}
        </Text>
      );
    default:
      break;
  }
  return (
        // Only ever drawn on the page: Classic's in-card title is PageSection's own Text.
        <Text {...a11y} style={[headingStyles.plain, { color: ink }]}>
          {title}
        </Text>
  );
}

// ── Section surface ───────────────────────────────────────────────────────────

/**
 * One profile section: its heading and the surface it sits on, both following
 * the page style. Classic is the frosted card with the title inside it.
 *
 * `bare` drops the surface but keeps the heading, for content that brings its
 * own tiles (the policy grids).
 */
/** Which of Stripes' sections sit on a tinted strip. Set by the order the
 *  profile actually draws them in (ProviderPageSheet): About, Policies,
 *  Services, Reviews, Contact, Hours, Portfolio, Additional Information, then
 *  the provider's own sections. Services and Portfolio never sit on a strip
 *  (they draw their own heading), so the tints step round them and the page
 *  takes turns, plain then tinted, under the hero's stronger strip. Owner,
 *  2026-11-19: the old table followed a different order, so two tinted
 *  strips met and Reviews jumped to the hero's shade halfway down. */
export const STRIPE_TINT: Record<PageSectionKey, "soft" | null> = {
  about: null,
  policies: "soft",
  services: null,
  policyPages: null,
  reviews: "soft",
  contact: null,
  hours: "soft",
  portfolio: null,
  info: "soft",
  specialities: null,
  keyInfo: null,
  faq: "soft",
  aftercare: null,
  disclaimer: "soft",
  custom: null,
};

interface PageSectionProps {
  section: PageSectionKey;
  palette: PageStylePalette;
  children: React.ReactNode;
  bare?: boolean;
  /** Something on the heading's line, at the right (Portfolio's "See all"). */
  headingRight?: React.ReactNode;
  /** A Custom section's own name, used for its heading in every style. */
  title?: string;
  style?: StyleProp<ViewStyle>;
}

/** Whether this section has the style's divider above it: every section but
 *  the one that opens the page (About, or the portfolio on a work-first page). */
export function showsDividerAbove(pageStyle: PageStyle | undefined, section: PageSectionKey): boolean {
  if (!pageStyle?.divider) return false;
  if (section === "about") return !!pageStyle.portfolioFirst;
  if (section === "portfolio") return !pageStyle.portfolioFirst;
  return true;
}

export function PageSection(props: PageSectionProps) {
  const pageStyle = props.palette.pageStyle;
  if (!pageStyle?.divider || !showsDividerAbove(pageStyle, props.section)) return <PageSectionSurface {...props} />;
  return (
    <>
      <SectionDivider divider={pageStyle.divider} accent={props.palette.accent} />
      <PageSectionSurface {...props} />
    </>
  );
}

function PageSectionSurface({
  section,
  palette,
  children,
  bare = false,
  headingRight,
  style,
  title,
}: PageSectionProps) {
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
            {title?.trim() || PAGE_SECTION_TITLES[section]}
          </Text>
        </HeadingLine>
        {children}
      </BlurView>
    );
  }

  if (pageStyle.cards === "pour") {
    // Latte: the section on its band of the pour, the heading and content
    // straight on it in the band's ink, its rounded top over the band above.
    const band = pourPalette(palette, section);
    return (
      <View style={[surfaceStyles.pour, { backgroundColor: band.background }, style]}>
        <HeadingLine headingRight={headingRight}>
          <PageSectionHeading section={section} palette={band} title={title} />
        </HeadingLine>
        {children}
      </View>
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
          <PageSectionHeading section={section} palette={palette} title={title} />
        </View>
        {headingRight ? <View style={surfaceStyles.legendRight}>{headingRight}</View> : null}
        {children}
      </View>
    );
  }

  const heading = (
    <HeadingLine headingRight={headingRight} centered={isCentredHeading(pageStyle)}>
      <PageSectionHeading section={section} palette={palette} title={title} />
    </HeadingLine>
  );

  if (pageStyle.cards === "stripes") {
    // Stripes: the section on a full-width strip, bled out of the sheet's
    // 20pt side padding. Every other section is tinted, with fine rules along
    // its edges, so the page reads as bands; the content sits in an outlined box.
    const colours = stripeColours(palette.accent);
    const strip = STRIPE_TINT[section] === "soft" ? colours.soft : null;
    return (
      <View
        style={[
          surfaceStyles.stripe,
          strip ? [surfaceStyles.stripeTinted, { backgroundColor: strip, borderColor: colours.line }] : null,
          style,
        ]}
      >
        <HeadingLine headingRight={headingRight} centered>
          <PageSectionHeading section={section} palette={palette} title={title} color={sheetInk(strip ?? palette.background).text} />
        </HeadingLine>
        {bare || pageStyle.openStrips ? children : (
          <View style={[surfaceStyles.solid, surfaceStyles.stripeBox, { backgroundColor: palette.cardBackground, borderColor: colours.line }]}>
            {children}
          </View>
        )}
      </View>
    );
  }

  if (pageStyle.cards === "soft" && !bare) {
    // Soft Focus: the heading sits inside its own soft card, in the card's ink.
    return (
      <View style={[surfaceStyles.solid, surfaceStyles.softCard, { backgroundColor: palette.cardBackground }, square && surfaceStyles.square, style]}>
        <HeadingLine headingRight={headingRight}>
          <PageSectionHeading section={section} palette={palette} title={title} color={palette.text} />
        </HeadingLine>
        {children}
      </View>
    );
  }

  if (pageStyle.cards === "gridBox" && !bare) {
    // Grid: a square card in a fine ink outline, its numbered heading inside.
    return (
      <View
        style={[
          surfaceStyles.solid,
          surfaceStyles.gridBox,
          { backgroundColor: palette.cardBackground, borderColor: withAlpha(outlineInk(palette.cardBackground), 0.3) },
          style,
        ]}
      >
        <HeadingLine headingRight={headingRight}>
          <PageSectionHeading section={section} palette={palette} color={palette.text} />
        </HeadingLine>
        {children}
      </View>
    );
  }

  if (pageStyle.cards === "sheer") {
    // Sheer: the heading on the page, the content in a see-through hairline box.
    return (
      <View style={[surfaceStyles.block, style]}>
        {heading}
        {bare ? children : (
          <View style={[surfaceStyles.sheer, sheerBox(palette.background)]}>{children}</View>
        )}
      </View>
    );
  }

  if (bare || pageStyle.cards === "none" || pageStyle.cards === "open" || pageStyle.cards === "ruled") {
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

  const radius = square || pageStyle.cards === "label" || pageStyle.cards === "topRule" || pageStyle.cards === "block"
    ? 0
    : pageStyle.cards === "clipped" ? 2
    : pageStyle.cards === "raised" ? 3
    : pageStyle.cards === "flat" || pageStyle.cards === "product" ? 6
    : pageStyle.cards === "gloss" || pageStyle.cards === "outlineRound" ? 28
    : pageStyle.cards === "bow" ? 22
    : pageStyle.cards === "chunky" ? 26
    : pageStyle.cards === "offset" ? 22
    : 18;

  if (pageStyle.cards === "tabbed") {
    // Studio: a square solid card with a little tab on its top edge, in the
    // card's own colour, naming the section.
    return (
      <View style={[surfaceStyles.block, style]}>
        {heading}
        <View style={[surfaceStyles.tab, { backgroundColor: palette.cardBackground }]}>
          <Text style={[surfaceStyles.tabText, { color: palette.text }]} numberOfLines={1}>
            {(title?.trim() || STUDIO_TABS[section]).toUpperCase()}
          </Text>
        </View>
        <View style={[surfaceStyles.solid, surfaceStyles.tabbedCard, { backgroundColor: palette.cardBackground }]}>
          {children}
        </View>
      </View>
    );
  }

  if (pageStyle.cards === "print") {
    // Moodboard: the heading on the page, the section on a white print with
    // square corners and a soft drop shadow, like the photos on its board.
    return (
      <View style={[surfaceStyles.block, style]}>
        {heading}
        <View style={[surfaceStyles.solid, surfaceStyles.print, { backgroundColor: palette.cardBackground }]}>
          {children}
        </View>
      </View>
    );
  }

  if (pageStyle.cards === "capsule") {
    // Capsule: the heading on the page, the section on a soft card in their
    // chosen card colour with big round corners and no shadow.
    return (
      <View style={[surfaceStyles.block, style]}>
        {heading}
        <View style={[surfaceStyles.solid, surfaceStyles.capsuleCard, { backgroundColor: palette.cardBackground }, square && surfaceStyles.square]}>
          {children}
        </View>
      </View>
    );
  }

  if (pageStyle.cards === "pages") {
    // Novel: a square card with two page edges peeking out below and to the
    // right of it, like the closed block of a book.
    const edge = withAlpha(sectionInk(palette).text, 0.14);
    return (
      <View style={[surfaceStyles.block, style]}>
        {heading}
        <View>
          <View style={[surfaceStyles.pageEdge, surfaceStyles.pageEdgeBack, { backgroundColor: palette.cardBackground, borderColor: edge }]} pointerEvents="none" />
          <View style={[surfaceStyles.pageEdge, { backgroundColor: palette.cardBackground, borderColor: edge }]} pointerEvents="none" />
          <View style={[surfaceStyles.solid, surfaceStyles.pageCard, { backgroundColor: palette.cardBackground, borderColor: edge }]}>
            {children}
          </View>
        </View>
      </View>
    );
  }

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
          pageStyle.cards === "topRule" && [surfaceStyles.topRule, { borderTopColor: outlineInk(palette.cardBackground) }],
          pageStyle.cards === "block" && [surfaceStyles.blockCard, { borderColor: outlineInk(palette.cardBackground) }],
          pageStyle.cards === "gloss" && [surfaceStyles.gloss, { borderColor: withAlpha(palette.accent, 0.35) }],
          pageStyle.cards === "raised" && [surfaceStyles.raised, raisedEdges(palette.cardBackground)],
          pageStyle.cards === "clipped" && [surfaceStyles.paper, surfaceStyles.clippedCard],
          pageStyle.cards === "product" && [surfaceStyles.product, { borderColor: withAlpha(outlineInk(palette.cardBackground), 0.14) }],
          pageStyle.cards === "outlineRound" && [surfaceStyles.outlineRound, { borderColor: outlineInk(palette.cardBackground) }],
          pageStyle.cards === "lit" && litSurface(palette.cardBackground, palette.accent, palette.background),
        ]}
      >
        {pageStyle.cards === "gloss" ? <GlossShine radius={radius} /> : null}
        {pageStyle.cards === "clipped" ? (
          <View style={[surfaceStyles.clippedRule, { borderColor: withAlpha(palette.accent, 0.28) }]} pointerEvents="none" />
        ) : null}
        {children}
        {/* Calling Card: a clip in the theme accent holds each card at the top. */}
        {pageStyle.cards === "clipped" ? <BulldogClip width={96} colour={palette.accent} style={surfaceStyles.clippedClip} /> : null}
      </View>
    </View>
  );
}

function isCentredHeading(style: PageStyle): boolean {
  return (
    style.heading === "scriptPair" || style.heading === "spacedCaps" || style.heading === "bubbly"
    || style.heading === "italicCaps" || style.heading === "layered"
    || style.heading === "sheerCaps" || style.heading === "embossCaps" || style.heading === "chapter"
    || style.heading === "chunkyCaps" || style.heading === "loungeCaps" || style.heading === "stripeCaps"
    || style.heading === "bowSerif" || style.heading === "enjoyStack" || style.heading === "slantCaps"
    || (style.heading === "custom" && !!style.custom?.centred)
  );
}

/** Embossed's raised card: a lit top and left edge, a shaded bottom and right. */
function raisedEdges(card: string): ViewStyle {
  const { high, shade } = pressEdges(card);
  return { borderTopColor: high, borderLeftColor: high, borderBottomColor: shade, borderRightColor: shade };
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
/** Neon's lit card: rounded, outlined in the accent, and on a dark page
 *  glowing round its edge like a tube. On a pale page the glow would only
 *  read as a smudge, so it's the outline alone there. iOS draws the glow;
 *  Android draws the outline. */
export function litSurface(card: string, accent: string, sheet: string): ViewStyle {
  const dark = isDarkColor(sheet);
  return {
    backgroundColor: card,
    borderWidth: 1.5,
    borderColor: dark ? blend(accent, "#FFFFFF", 0.2) : accent,
    borderRadius: 16,
    shadowColor: accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: dark ? 0.95 : 0,
    shadowRadius: 14,
    elevation: 0,
    overflow: "visible",
  };
}

/** Which of Capsule's two tones each heading's pill mark is in: they take
 *  turns, accent tint then card colour, in the order the profile draws its sections. */
const CAPSULE_MARK_TONE: Record<PageSectionKey, 0 | 1> = {
  about: 0,
  policies: 1,
  services: 0,
  policyPages: 1,
  reviews: 0,
  contact: 1,
  hours: 0,
  portfolio: 1,
  info: 0,
  specialities: 1,
  keyInfo: 0,
  faq: 1,
  aftercare: 0,
  custom: 1,
  disclaimer: 0,
};

/** Capsule's service pill: the whole row a capsule. The services take turns
 *  in the two tones, so the price list passes each row's place. */
export function capsuleServiceSurface(accent: string, sheet: string, card: string, index: number): ViewStyle {
  return {
    backgroundColor: capsuleTones(accent, sheet, card)[index % 2],
    borderWidth: 0,
    borderRadius: 45,
    shadowOpacity: 0,
    elevation: 0,
  };
}

/** Latte's foot: the deepest band of the pour (espresso; milk on a dark
 *  page), the lowest price and a Book pill in the top band's colour, which
 *  jumps to Services. It runs down over the sheet's bottom padding. */
export function LatteBookBar({
  palette,
  price,
  serviceName,
  onBook,
}: {
  palette: PageStylePalette;
  /** The lowest price on the menu, already formatted ("£22"); none yet says "Book in". */
  price?: string | undefined;
  serviceName?: string | undefined;
  onBook?: (() => void) | undefined;
}) {
  const sheet = palette.pourSheet ?? palette.background;
  const bar = latteShade(palette.accent, sheet, 1);
  const top = latteShade(palette.accent, sheet, 0);
  const ink = latteInk(bar);
  return (
    <View style={[surfaceStyles.pour, surfaceStyles.pourBar, { backgroundColor: bar }]}>
      <View style={surfaceStyles.pourBarText}>
        <Text style={[surfaceStyles.pourBarPrice, { color: ink.text }]} numberOfLines={1}>{price ? `from ${price}` : "Book in"}</Text>
        {serviceName ? <Text style={[surfaceStyles.pourBarSub, { color: ink.sub }]} numberOfLines={1}>{serviceName}</Text> : null}
      </View>
      <TouchableOpacity
        style={[surfaceStyles.pourBarButton, { backgroundColor: top }]}
        onPress={onBook}
        disabled={!onBook}
        accessibilityRole="button"
        accessibilityLabel="Book"
        activeOpacity={0.85}
      >
        <Text style={[surfaceStyles.pourBarButtonText, { color: latteInk(top).text }]}>Book</Text>
      </TouchableOpacity>
    </View>
  );
}

export function serviceCardSurface(
  style: PageStyle,
  colours: { card: string; accent: string; sheet: string },
): ViewStyle | null {
  const flat = { borderWidth: 0, shadowOpacity: 0 } as const;
  switch (style.cards) {
    case "lit":
      return litSurface(colours.card, colours.accent, colours.sheet);
    case "pour": {
      // Latte: each service in a soft see-through pill on the services band.
      const band = latteBand(colours.accent, colours.sheet, "services");
      return { backgroundColor: latteGlass(band), borderWidth: 0, borderRadius: 28, shadowOpacity: 0, elevation: 0 };
    }
    case "capsule":
      return capsuleServiceSurface(colours.accent, colours.sheet, colours.card, 0);
    case "print":
      // Moodboard: each service a row on the page, a hairline under it.
      return {
        ...flat,
        backgroundColor: "transparent",
        borderRadius: 0,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: sheetInk(colours.sheet).border,
        marginBottom: 0,
        elevation: 0,
      };
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
    case "block":
      return { ...flat, backgroundColor: colours.card, borderRadius: 0, borderWidth: 2, borderColor: outlineInk(colours.card) };
    case "topRule":
      return { ...flat, backgroundColor: colours.card, borderRadius: 0, borderTopWidth: 3, borderTopColor: outlineInk(colours.card) };
    case "sheer":
      return { ...flat, ...sheerBox(colours.sheet), borderWidth: 1, borderRadius: 0 };
    case "raised":
      return {
        backgroundColor: colours.card,
        borderRadius: 3,
        borderWidth: 1,
        ...raisedEdges(colours.card),
        shadowColor: "#463428",
        shadowOffset: { width: 1, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        // The card clips by default, which would cut the shadow off.
        overflow: "visible",
      };
    case "clipped":
      // Calling Card: a near-square card on a soft drop shadow.
      return {
        backgroundColor: colours.card,
        borderRadius: 2,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: withAlpha(colours.accent, 0.3),
        shadowColor: "#14040A",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.14,
        shadowRadius: 10,
        overflow: "visible",
      };
    case "product":
      // Boutique: a clean product tile, a fine outline and small corners.
      return {
        ...flat,
        backgroundColor: colours.card,
        borderWidth: 1,
        borderColor: withAlpha(outlineInk(colours.card), 0.14),
        borderRadius: 6,
      };
    case "ruled":
      // Gazette: classified rows straight on the page, each over a printed rule.
      return {
        ...flat,
        backgroundColor: "transparent",
        borderRadius: 0,
        borderBottomWidth: 1,
        borderBottomColor: withAlpha(sheetInk(colours.sheet).text, 0.4),
        marginBottom: 0,
      };
    case "tabbed":
      // Studio: a square solid block, no outline, like a studio's class card.
      return { ...flat, backgroundColor: colours.card, borderRadius: 0 };
    case "outlineRound":
      // Lounge: a fine dark outline and big round corners.
      return { backgroundColor: colours.card, borderWidth: 1, borderColor: outlineInk(colours.card), borderRadius: 24, shadowOpacity: 0 };
    case "soft":
      return { ...flat, backgroundColor: colours.card, borderRadius: 22 };
    case "stripes":
      // Riviera: the strips are open, so the services are plain solid cards.
      if (style.openStrips) return { ...flat, backgroundColor: colours.card, borderRadius: 18 };
      // Stripes: a fine outlined box, like the section boxes.
      return { backgroundColor: colours.card, borderWidth: 1, borderColor: stripeColours(colours.accent).line, borderRadius: 16, shadowOpacity: 0 };
    case "bow":
      return { ...flat, backgroundColor: colours.card, borderRadius: 22 };
    case "grouped":
      // Pure: a plain solid card, round corners, no shadow.
      return { ...flat, backgroundColor: colours.card, borderRadius: 18 };
    case "gridBox":
      // Grid: square, in the same fine ink outline as the section boxes.
      return { ...flat, backgroundColor: colours.card, borderRadius: 0, borderWidth: 1, borderColor: withAlpha(outlineInk(colours.card), 0.3) };
    case "pages":
      // A page: square, a fine edge, a little lift off the paper under it.
      return {
        backgroundColor: colours.card,
        borderRadius: 2,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: withAlpha(outlineInk(colours.card), 0.25),
        shadowColor: "#26201E",
        shadowOffset: { width: 2, height: 3 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      };
    default:
      return null;
  }
}

// ── Ruled section links ──────────────────────────────────────────────────────

/**
 * Lounge's section links: the titles in tall caps between two fine rules
 * across the sheet, short dividers between them, instead of a filled pill
 * (owner, 2026-11-17, option C on https://claude.ai/artifact/L6KZ2rjSqidNWQ7r9sd8ee).
 * `onJump` is left out in Branding's preview, where the links do nothing.
 */
export function RuledJumpBar({
  sections,
  sheet,
  onJump,
}: {
  sections: readonly PageSectionKey[];
  sheet: string;
  onJump?: ((section: PageSectionKey) => void) | undefined;
}) {
  const ink = sheetInk(sheet);
  const rule = outlineInk(sheet);
  return (
    <View style={[ruledBarStyles.bar, { borderColor: rule }]}>
      {sections.map((section, index) => {
        const label = (
          <Text style={[ruledBarStyles.text, { color: ink.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {PAGE_SECTION_TITLES[section].toUpperCase()}
          </Text>
        );
        return (
          <React.Fragment key={section}>
            {index > 0 ? <View style={[ruledBarStyles.divider, { backgroundColor: ink.border }]} /> : null}
            {onJump ? (
              <TouchableOpacity
                style={ruledBarStyles.item}
                onPress={() => onJump(section)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Go to ${PAGE_SECTION_TITLES[section]}`}
              >
                {label}
              </TouchableOpacity>
            ) : (
              <View style={ruledBarStyles.item}>{label}</View>
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const ruledBarStyles = StyleSheet.create({
  // Edge to edge across the sheet's 20pt side padding.
  bar: { flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, marginHorizontal: -20, marginBottom: 24 },
  item: { flex: 1, minHeight: 50, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  divider: { width: StyleSheet.hairlineWidth, marginVertical: 14 },
  text: { fontFamily: "LeagueGothic-Regular", fontSize: 20, lineHeight: 26, letterSpacing: 0.8 },
});

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
    || layout === "outlined" || layout === "recessed" || layout === "ribbon" || layout === "accordion" || layout === "columns"
    || layout === "membership" || layout === "loungeGrid" || layout === "ribbonBand"
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
  // Custom's text font, on the policy layouts Custom uses.
  const tf = customTextStyle(palette.pageStyle);

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

  if (layout === "loungeGrid") {
    // Lounge: two-up columns straight on the page, a condensed caps label over each.
    return (
      <View style={policyStyles.grid}>
        {rows.map(row => (
          <View key={row.label} style={[policyStyles.cell, policyStyles.loungeCell]}>
            <Text style={[policyStyles.loungeLabel, { color: ink.text }]}>{row.label.toUpperCase()}</Text>
            <Text style={[policyStyles.smallValue, { color: ink.sub }]}>{row.value}</Text>
            {row.notes?.map(note => (
              <Text key={note} style={[policyStyles.note, { color: ink.sub }]}>{note}</Text>
            ))}
            {row.tag ? (
              <View style={[policyStyles.tag, policyStyles.tagLeft, { backgroundColor: palette.accent }]}>
                <Text style={[policyStyles.tagText, { color: onAccentInk(palette.accent).text }]}>{row.tag}</Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    );
  }

  if (layout === "softTiles") {
    // Soft Focus: round tiles tinted with the accent, inside the section's card.
    const tile = blend(palette.accent, palette.cardBackground, isDarkColor(palette.cardBackground) ? 0.72 : 0.8);
    const tileInk = onAccentInk(tile);
    return (
      <View style={policyStyles.grid}>
        {rows.map(row => (
          <View key={row.label} style={[policyStyles.cell, policyStyles.softTile, { backgroundColor: tile }, square && policyStyles.square]}>
            <Text style={[policyStyles.softLabel, { color: tileInk.text }, tf]}>{row.label}</Text>
            <Text style={[policyStyles.smallValue, { color: tileInk.sub }, tf]}>{row.value}</Text>
            {row.notes?.map(note => (
              <Text key={note} style={[policyStyles.note, { color: tileInk.sub }, tf]}>{note}</Text>
            ))}
            {row.tag ? (
              <View style={[policyStyles.tag, policyStyles.tagLeft, { backgroundColor: palette.text }]}>
                <Text style={[policyStyles.tagText, { color: palette.cardBackground }]}>{row.tag}</Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    );
  }

  if (layout === "gentleNotes") {
    // Hush: centred notes, a small caps label over the policy in a light italic.
    return (
      <View style={policyStyles.gentleList}>
        {rows.map(row => (
          <View key={row.label} style={policyStyles.gentleRow}>
            <Text style={[policyStyles.gentleLabel, { color: ink.text }]}>{row.label.toUpperCase()}</Text>
            <Text style={[policyStyles.gentleValue, { color: ink.sub }]}>{row.value}</Text>
            {row.notes?.map(note => (
              <Text key={note} style={[policyStyles.note, policyStyles.centreText, { color: ink.sub }]}>{note}</Text>
            ))}
            {row.tag ? (
              <Text style={[policyStyles.gentleLabel, { color: palette.accent }]}>{row.tag.toUpperCase()}</Text>
            ) : null}
          </View>
        ))}
      </View>
    );
  }

  if (layout === "pearlNotes") {
    // Stripes: rows in the outlined box, each beside a single pearl.
    return (
      <View style={policyStyles.pearlList}>
        {rows.map(row => (
          <View key={row.label} style={policyStyles.pearlRow}>
            <Pearl size={10} onDark={isDarkColor(palette.cardBackground)} style={policyStyles.pearlBullet} />
            <View style={policyStyles.numeralBody}>
              <Text style={[policyStyles.pearlLabel, { color: ink.text }]}>{row.label.toUpperCase()}</Text>
              <Text style={[policyStyles.value, { color: ink.sub }]}>{row.value}</Text>
              {row.notes?.map(note => (
                <Text key={note} style={[policyStyles.note, { color: ink.sub }]}>{note}</Text>
              ))}
              {row.tag ? (
                <Text style={[policyStyles.pearlLabel, { color: palette.accent }]}>{row.tag.toUpperCase()}</Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (layout === "ribbonBand") {
    // Bow: one card with a satin ribbon across its top, two-up italic titles.
    const ribbon = ribbonColours(palette.accent);
    return (
      <View style={[policyStyles.ribbonBandCard, { backgroundColor: palette.cardBackground }, square && policyStyles.square]}>
        <View style={[policyStyles.ribbonBand, { backgroundColor: ribbon.satin, borderBottomColor: ribbon.edge }]} />
        <View style={[policyStyles.ribbonGrid, policyStyles.ribbonBandGrid]}>
          {rows.map(row => (
            <View key={row.label} style={policyStyles.ribbonCell}>
              <Text style={[policyStyles.bowLabel, { color: palette.text }]}>{row.label}</Text>
              <Text style={[policyStyles.smallValue, { color: palette.sub }]}>{row.value}</Text>
              {row.notes?.map(note => (
                <Text key={note} style={[policyStyles.note, { color: palette.sub }]}>{note}</Text>
              ))}
              {row.tag ? (
                <View style={[policyStyles.tag, policyStyles.tagLeft, { backgroundColor: ribbon.soft }]}>
                  <Text style={[policyStyles.tagText, { color: "#2E2224" }]}>{row.tag}</Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (layout === "recessed") {
    // Embossed: a panel pressed down into the page, shaded along its top and
    // left inner edge and lit along the bottom and right, with the policies
    // as label-and-value rows inside it.
    const { high, shade } = pressEdges(palette.background);
    return (
      <View
        style={[
          policyStyles.recessed,
          {
            backgroundColor: blend(palette.background, "#000000", 0.035),
            borderTopColor: shade, borderLeftColor: shade, borderBottomColor: high, borderRightColor: high,
          },
          square && policyStyles.square,
        ]}
      >
        {rows.map((row, index) => (
          <View
            key={row.label}
            style={[policyStyles.defRow, { borderTopColor: page.separator }, index === 0 && policyStyles.hairFirst]}
          >
            <Text style={[policyStyles.recessedLabel, { color: ink.text }]}>{row.label.toUpperCase()}</Text>
            <View style={policyStyles.hairValueCol}>
              <Text style={[policyStyles.defValue, { color: ink.sub }]}>{row.value}</Text>
              {row.notes?.map(note => (
                <Text key={note} style={[policyStyles.note, { color: ink.sub }]}>{note}</Text>
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (layout === "numberedRules") {
    // Novel's policies: numbered paragraphs, the rule's name in small caps
    // running straight into what it says.
    return (
      <View style={policyStyles.rulesList}>
        {rows.map((row, index) => (
          <View key={row.label} style={policyStyles.ruleRow}>
            <Text style={[policyStyles.ruleNumber, { color: palette.accent }]}>{index + 1}</Text>
            <View style={policyStyles.numeralBody}>
              <Text style={[policyStyles.ruleText, { color: ink.sub }]}>
                <Text style={[policyStyles.ruleLabel, { color: ink.text }]}>{row.label}. </Text>
                {row.value}
              </Text>
              {row.notes?.map(note => (
                <Text key={note} style={[policyStyles.note, { color: ink.sub }]}>{note}</Text>
              ))}
              {row.tag ? (
                <Text style={[policyStyles.ruleTag, { color: palette.accent }]}>{row.tag}</Text>
              ) : null}
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
            <Text style={[policyStyles.defLabel, { color: ink.sub }, tf]}>{row.label.toUpperCase()}</Text>
            <View style={policyStyles.hairValueCol}>
              <Text style={[policyStyles.defValue, { color: ink.text }, tf]}>{row.value}</Text>
              {row.notes?.map(note => (
                <Text key={note} style={[policyStyles.note, { color: ink.sub }, tf]}>{note}</Text>
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (layout === "columns") {
    // Gazette: two-up newspaper columns boxed by ink rules.
    return (
      <View style={[policyStyles.columnsGrid, { borderColor: ink.text }]}>
        {rows.map(row => (
          <View key={row.label} style={[policyStyles.columnCell, { borderColor: ink.text }]}>
            <Text style={[policyStyles.columnLabel, { color: ink.text }]}>{row.label.toUpperCase()}</Text>
            <Text style={[policyStyles.value, { color: ink.sub }]}>{row.value}</Text>
            {row.notes?.map(note => (
              <Text key={note} style={[policyStyles.note, { color: ink.sub }]}>{note}</Text>
            ))}
            {row.tag ? (
              <View style={[policyStyles.columnTag, { borderColor: ink.text }]}>
                <Text style={[policyStyles.columnTagText, { color: ink.text }]}>{row.tag.toUpperCase()}</Text>
              </View>
            ) : null}
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

  if (layout === "ribbon") {
    // Calling Card: every policy on one card, two-up, with a ribbon in the
    // accent across its top corner. The card brings its own colours.
    const labelInk = isDarkColor(palette.cardBackground) ? palette.text : (isDarkColor(palette.accent) ? palette.accent : palette.text);
    return (
      // The shadow sits on an outer box: the inner one clips the ribbon, and a
      // clipping view on iOS clips its own shadow too.
      <View style={[policyStyles.ribbonShadow, { backgroundColor: palette.cardBackground }, square && policyStyles.square]}>
      <View style={[policyStyles.ribbonCard, square && policyStyles.square]}>
        <LinearGradient
          colors={[palette.accent, blend(palette.accent, "#000000", 0.35)]}
          style={policyStyles.ribbon}
          pointerEvents="none"
        />
        <View style={policyStyles.ribbonGrid}>
          {rows.map(row => (
            <View key={row.label} style={policyStyles.ribbonCell}>
              <Text style={[policyStyles.ribbonLabel, { color: labelInk }]}>{row.label.toUpperCase()}</Text>
              <Text style={[policyStyles.value, { color: palette.sub }]}>{row.value}</Text>
              {row.notes?.map(note => (
                <Text key={note} style={[policyStyles.note, { color: palette.sub }]}>{note}</Text>
              ))}
              {row.tag ? (
                <View style={[policyStyles.tag, policyStyles.tagLeft, { backgroundColor: palette.accent }]}>
                  <Text style={[policyStyles.tagText, { color: onAccentInk(palette.accent).text }]}>{row.tag}</Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      </View>
      </View>
    );
  }

  if (layout === "accordion") {
    return <AccordionPolicies rows={rows} ink={ink} separator={page.separator} />;
  }

  if (layout === "settingsRows") {
    // Pure: like a phone's settings list, the label on the left and the
    // policy on the right, a fine line between rows.
    const line = withAlpha(ink.text, 0.12);
    return (
      <View>
        {rows.map((row, index) => (
          <View
            key={row.label}
            style={[policyStyles.settingsRow, index > 0 && [policyStyles.settingsRule, { borderTopColor: line }]]}
          >
            <Text style={[policyStyles.settingsLabel, { color: ink.sub }]}>{row.label}</Text>
            <View style={[policyStyles.hairValueCol, policyStyles.settingsValueCol]}>
              <Text style={[policyStyles.settingsValue, { color: ink.text }]}>{row.value}</Text>
              {row.notes?.map(note => (
                <Text key={note} style={[policyStyles.note, policyStyles.alignRight, { color: ink.sub }]}>{note}</Text>
              ))}
              {row.tag ? <Text style={[policyStyles.settingsTag, { color: ink.text }]}>{row.tag}</Text> : null}
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (layout === "gridCells") {
    // Grid: two-up cells split by fine lines, a small caps label over each policy.
    const line = withAlpha(ink.text, 0.22);
    return (
      <View style={policyStyles.gridCells}>
        {rows.map((row, index) => (
          <View
            key={row.label}
            style={[
              policyStyles.gridCell,
              { borderColor: line },
              index % 2 === 0 ? policyStyles.gridCellLeft : policyStyles.gridCellRight,
              index >= 2 && policyStyles.gridCellBelow,
            ]}
          >
            <Text style={[policyStyles.gridLabel, { color: ink.sub }]}>{row.label.toUpperCase()}</Text>
            <Text style={[policyStyles.smallValue, { color: ink.text }]}>{row.value}</Text>
            {row.notes?.map(note => (
              <Text key={note} style={[policyStyles.note, { color: ink.sub }]}>{note}</Text>
            ))}
            {row.tag ? <Text style={[policyStyles.gridLabel, policyStyles.gridTag, { color: ink.text }]}>{row.tag.toUpperCase()}</Text> : null}
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
            <Text style={[policyStyles.hairLabel, { color: ink.text }, tf]}>{row.label}</Text>
            <View style={policyStyles.hairValueCol}>
              <Text style={[policyStyles.hairValue, { color: ink.sub }, tf]}>{row.value}</Text>
              {row.notes?.map(note => (
                <Text key={note} style={[policyStyles.note, policyStyles.alignRight, { color: ink.sub }, tf]}>{note}</Text>
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
          <Text key={note} style={[policyStyles.note, { color: ink.sub }, layout !== "boxes" && policyStyles.centreText, tf]}>{note}</Text>
        ));

        if (layout === "boxes") {
          return (
            <View
              key={row.label}
              style={[policyStyles.cell, policyStyles.box, { borderColor: page.border }, square && policyStyles.square]}
            >
              <View style={policyStyles.boxLabelRow}>
                <Text style={[policyStyles.capsLabel, { color: ink.sub }, tf]}>{row.label.toUpperCase()}</Text>
                {tag}
              </View>
              <Text style={[policyStyles.value, { color: ink.text }, tf]}>{row.value}</Text>
              {notes}
            </View>
          );
        }

        if (layout === "outlined") {
          // Sheer: square hairline boxes, a fine icon over thin serif caps.
          return (
            <View key={row.label} style={[policyStyles.cell, policyStyles.outlined, sheerBox(palette.background)]}>
              <Ionicons name={row.icon} size={22} color={ink.text} />
              <Text style={[policyStyles.outlinedLabel, { color: ink.text }]}>{row.label.toUpperCase()}</Text>
              <Text style={[policyStyles.smallValue, policyStyles.centreText, { color: ink.sub }]}>{row.value}</Text>
              {row.notes?.map(note => (
                <Text key={note} style={[policyStyles.note, policyStyles.centreText, { color: ink.sub }]}>{note}</Text>
              ))}
              {tag}
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

        if (layout === "membership") {
          // Studio: square tiles like a studio's price plans, cycling blush,
          // the card colour and a deep shade of the accent.
          const index = rows.indexOf(row);
          const fills = [blend(palette.accent, "#FFFFFF", 0.72), palette.cardBackground, blend(palette.accent, "#000000", 0.35)];
          const fill = fills[index % 3]!;
          const tileInk = onAccentInk(fill);
          return (
            <View key={row.label} style={[policyStyles.cell, policyStyles.membership, { backgroundColor: fill }]}>
              <Text style={[policyStyles.membershipLabel, { color: tileInk.text }]}>{row.label.toUpperCase()}</Text>
              <Text style={[policyStyles.smallValue, policyStyles.centreText, { color: tileInk.sub }]}>{row.value}</Text>
              {row.notes?.map(note => (
                <Text key={note} style={[policyStyles.note, policyStyles.centreText, { color: tileInk.sub }]}>{note}</Text>
              ))}
              {row.tag ? (
                <View style={[policyStyles.membershipTag, { borderColor: tileInk.text }]}>
                  <Text style={[policyStyles.membershipTagText, { color: tileInk.text }]}>{row.tag.toUpperCase()}</Text>
                </View>
              ) : null}
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

/**
 * Boutique's policies: rows that open and close like a shop's "Delivery &
 * returns". The first is open so a client sees how it works without tapping.
 */
function AccordionPolicies({
  rows,
  ink,
  separator,
}: {
  rows: PolicyDisplayRow[];
  ink: { text: string; sub: string };
  separator: string;
}) {
  const [open, setOpen] = useState<string | null>(rows[0]?.label ?? null);
  return (
    <View style={[policyStyles.accordion, { borderBottomColor: separator }]}>
      {rows.map(row => {
        const isOpen = open === row.label;
        return (
          <View key={row.label} style={[policyStyles.accordionRow, { borderTopColor: separator }]}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setOpen(isOpen ? null : row.label)}
              style={policyStyles.accordionHead}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              accessibilityLabel={row.label}
            >
              <Text style={[policyStyles.accordionLabel, { color: ink.text }]}>{row.label.toUpperCase()}</Text>
              <Ionicons name={isOpen ? "remove" : "add"} size={18} color={ink.text} />
            </TouchableOpacity>
            {isOpen ? (
              <View style={policyStyles.accordionBody}>
                <Text style={[policyStyles.value, { color: ink.sub }]}>{row.value}</Text>
                {row.notes?.map(note => (
                  <Text key={note} style={[policyStyles.note, { color: ink.sub }]}>{note}</Text>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const headingStyles = StyleSheet.create({
  twoToneWrap: { marginBottom: 14 },
  twoTone: { fontFamily: "LeagueSpartan-ExtraBold", fontSize: 40, lineHeight: 42, letterSpacing: -1, paddingTop: 4 },
  enjoyWrap: { alignItems: "center", marginBottom: 16 },
  enjoyLead: { fontFamily: "Manrope-Bold", fontSize: 11, letterSpacing: 7, marginBottom: 2, paddingLeft: 7 },
  enjoyTitle: { fontFamily: "Oswald-Bold", fontSize: 38, lineHeight: 48, letterSpacing: 0.5 },
  slantWrap: { alignItems: "center", marginBottom: 16 },
  slantOver: { fontFamily: "Manrope-Bold", fontSize: 9, letterSpacing: 4, marginBottom: 4, paddingLeft: 4 },
  slantTitle: { fontFamily: "Archivo-ExtraBold", fontSize: 24, lineHeight: 32, letterSpacing: -0.3, transform: [{ skewX: "-10deg" }] },
  plain: { fontFamily: "BakbakOne-Regular", fontSize: 20, marginBottom: 16 },
  custom: { marginBottom: 12 },
  customCentred: { textAlign: "center" },
  customText: { marginBottom: 0 },
  customRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  customNumber: { fontFamily: "Jura-VariableFont_wght", fontWeight: "700", fontSize: 13, letterSpacing: 1 },
  customRule: { width: 22, height: 1 },
  customBar: { width: 30, height: 3, borderRadius: 2, marginTop: 8 },
  customStackCentred: { alignItems: "center" },
  customScript: { fontFamily: "PinyonScript_400Regular", fontSize: 28, lineHeight: 40, paddingHorizontal: 6, marginBottom: -6 },
  customLegend: { paddingHorizontal: 12, marginBottom: 0 },
  bigLower: { fontFamily: "Syne_700Bold", fontSize: 38, lineHeight: 49, letterSpacing: -1.2, marginBottom: 14 },
  pairRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 6, marginBottom: 14 },
  script: { fontFamily: "PinyonScript_400Regular", fontSize: 32, lineHeight: 47, paddingHorizontal: 6 },
  serif: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 24, lineHeight: 32 },
  capsRow: { flexDirection: "row", alignItems: "baseline", gap: 4, marginBottom: 12 },
  centerRow: { justifyContent: "center" },
  // Each style has a heading face of its own: Syne (Cover), Pinyon + Playfair
  // (Arch), Limelight (Framed), Bebas Neue + Sacramento (Scrapbook), Tenor Sans
  // (Spa), Shrikhand (Glossy).
  caps: { fontFamily: "BebasNeue_400Regular", fontSize: 32, lineHeight: 41, letterSpacing: 0.5 },
  capsScript: { fontFamily: "Sacramento_400Regular", fontSize: 34, lineHeight: 50, paddingHorizontal: 6 },
  spaced: { fontFamily: "TenorSans_400Regular", fontSize: 11, letterSpacing: 4, textAlign: "center", marginBottom: 16 },
  bubbly: { fontFamily: "Shrikhand_400Regular", fontSize: 26, lineHeight: 34, textAlign: "center", marginBottom: 12 },
  legend: { fontFamily: "Limelight_400Regular", fontSize: 20, lineHeight: 28, paddingHorizontal: 12 },
  // 2026-11-14 styles: League Spartan (Editorial), Libre Baskerville italic +
  // Cinzel (Heritage), Ms Madi + Montserrat (Duet), Fraunces (Groovy),
  // Instrument Serif (Gallery), Marcellus (Apothecary): no two styles share a face.
  ruledRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth * 2, minWidth: 12 },
  dotLight: { fontFamily: "LeagueSpartan-Light", fontSize: 26, lineHeight: 34, flexShrink: 1 },
  dotBold: { fontFamily: "LeagueSpartan-ExtraBold" },
  stack: { alignItems: "center", marginBottom: 14 },
  shortRuleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  shortRule: { width: 36, height: 1 },
  heritageScript: { fontFamily: "LibreBaskerville-Italic", fontSize: 20, lineHeight: 30 },
  heritageCaps: { fontFamily: "Cinzel-Bold", fontSize: 20, letterSpacing: 4, marginTop: 2, textAlign: "center" },
  // Script swashes reach past the text box and get clipped at its edges, so
  // the word has room either side.
  layeredScript: { fontFamily: "MsMadi-Regular", fontSize: 54, lineHeight: 79, paddingHorizontal: 16 },
  // Overlaps the script's foot. Tuned by the owner on 2026-11-15: -32 too
  // much, -12 too far apart, -17 and -20 wanted the script a bit lower.
  layeredCaps: { fontFamily: "Montserrat-ExtraBold", fontSize: 21, letterSpacing: 1, marginTop: -24, textAlign: "center" },
  groovyWrap: { marginBottom: 14 },
  groovy: { fontFamily: "Fraunces-SoftBlackItalic", fontSize: 36, lineHeight: 47, letterSpacing: -0.8 },
  serifTitle: { fontFamily: "InstrumentSerif-Regular", fontSize: 32, lineHeight: 41, marginBottom: 14 },
  labelCaps: { fontFamily: "MarcellusSC-Regular", fontSize: 14, letterSpacing: 4 },
  // Quiet's own face, so it no longer reads as Apothecary (owner, 2026-11-15).
  quietCaps: { fontFamily: "JosefinSans_600SemiBold", fontSize: 14, lineHeight: 20, letterSpacing: 4, flexShrink: 1 },
  // Calling Card's engraved caps (Forum), its own face.
  engravedCaps: { fontFamily: "Forum-Regular", fontSize: 19, lineHeight: 25, letterSpacing: 4, flexShrink: 1 },
  shopSerif: { fontFamily: "DMSerifDisplay-Regular", fontSize: 28, lineHeight: 37, marginBottom: 12 },
  // Ms Madi draws small for its size, and its loops need the tall line.
  // Its loops reach outside the letters: a tall line and room either side so
  // nothing is cut off (owner, 2026-11-23).
  neonScript: { fontFamily: "MsMadi-Regular", fontSize: 44, lineHeight: 68, paddingHorizontal: 8, marginBottom: 2, includeFontPadding: false },
  neonWrap: { alignSelf: "flex-start", marginLeft: -8 },
  captionCaps: { fontFamily: "Jost-Light", fontSize: 11, letterSpacing: 4 },
  pourSerif: { fontFamily: "InstrumentSerif-Regular", fontSize: 26, lineHeight: 32, marginBottom: 10 },
  pillMarkRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  pillMark: { width: 18, height: 8, borderRadius: 999 },
  pillMarkTitle: { fontFamily: "Figtree-SemiBold", fontSize: 18, lineHeight: 24 },
  // Gazette: Oswald, between a thick rule and a thin one.
  newsRule: { borderTopWidth: 4, borderBottomWidth: 1, paddingTop: 4, paddingBottom: 3, marginBottom: 12, alignSelf: "stretch" },
  newsTitle: { fontFamily: "Oswald-Bold", fontSize: 24, lineHeight: 31, letterSpacing: 0.3 },
  // Studio: the title in Young Serif caps, the face of the business name in
  // the hero (owner, 2026-11-16), with an Ephesis lead word. The line is set
  // for the script (≥1.45× its size) so its loops aren't cropped.
  chunkyCaps: { fontFamily: "YoungSerif-Regular", fontSize: 28, lineHeight: 50, letterSpacing: 0.6, textAlign: "center", paddingHorizontal: 8 },
  chunkyScript: { fontFamily: "Ephesis-Regular", fontSize: 34, letterSpacing: 0 },
  // The demure set (2026-11-16): League Gothic (Lounge), Archivo (Soft Focus),
  // Hanken Grotesk (Hush), Castoro (Stripes), Sorts Mill Goudy (Bow).
  loungeKicker: { fontFamily: "HankenGrotesk-Medium", fontSize: 10, lineHeight: 14, letterSpacing: 3.4, textAlign: "center", marginBottom: 2 },
  loungeCaps: { fontFamily: "LeagueGothic-Regular", fontSize: 32, lineHeight: 41, letterSpacing: 0.6, textAlign: "center" },
  appBold: { fontFamily: "Manrope-Bold", fontSize: 19, lineHeight: 26, letterSpacing: -0.2, marginBottom: 12 },
  gridRow: { flexDirection: "row", alignItems: "baseline", gap: 10, marginBottom: 12 },
  gridNumber: { fontFamily: "Manrope-Bold", fontSize: 12, letterSpacing: 0.4 },
  gridTitle: { marginBottom: 0, flexShrink: 1 },
  softCaps: { fontFamily: "Archivo-ExtraBold", fontSize: 15, lineHeight: 20, letterSpacing: -0.1, marginBottom: 12 },
  hushRule: { fontFamily: "HankenGrotesk-Medium", fontSize: 10, lineHeight: 14, letterSpacing: 3.2, flexShrink: 1 },
  stripeCaps: { fontFamily: "Castoro-Regular", fontSize: 15, lineHeight: 20, letterSpacing: 4, textAlign: "center" },
  bowTitle: { fontFamily: "SortsMillGoudy-Italic", fontSize: 25, lineHeight: 34, textAlign: "center", marginTop: 2 },
  // Novel: IM Fell English, an old book face no other style uses.
  chapterNumber: { fontFamily: "IMFellEnglishSC-Regular", fontSize: 13, lineHeight: 17, letterSpacing: 3.6 },
  chapterTitle: { fontFamily: "IMFellEnglish-Italic", fontSize: 28, lineHeight: 37, textAlign: "center", marginBottom: 2 },
  condensedWrap: { marginBottom: 14 },
  condensed: { fontFamily: "Anton-Regular", fontSize: 38, lineHeight: 49, letterSpacing: 0.3 },
  condensedBar: { width: 36, height: 5, marginTop: 4 },
  embossWrap: { alignSelf: "stretch", marginBottom: 14 },
  // Libre Caslon Display's caps are tall: 1.28x keeps their tops whole.
  embossCaps: { fontFamily: "LibreCaslonDisplay-Regular", fontSize: 30, lineHeight: 39, letterSpacing: 2, textAlign: "center" },
  indexRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  indexNumber: { fontFamily: "Gloock-Regular", fontSize: 15 },
  indexRule: { width: 22, height: 1.5 },
  indexTitle: { fontFamily: "Gloock-Regular", fontSize: 28, lineHeight: 36, flexShrink: 1 },
  // Sheer (round 4): Bellefair, thin and widely spaced.
  sheerCaps: { fontFamily: "Bellefair-Regular", fontSize: 26, lineHeight: 34, letterSpacing: 3.2, textAlign: "center", marginBottom: 16 },
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
  // Studio: the tab sits on the card's top edge, left of centre.
  tab: { alignSelf: "flex-start", marginLeft: 22, paddingHorizontal: 16, paddingTop: 7, paddingBottom: 5 },
  tabText: { fontFamily: "LilitaOne-Regular", fontSize: 10, lineHeight: 14, letterSpacing: 1.6 },
  tabbedCard: { borderRadius: 0 },
  capsuleCard: { borderRadius: 32 },
  // Latte: a full-width band, bled out of the sheet's 20pt side padding, its
  // rounded top lapping over the band above (which reaches down under it).
  pour: {
    marginHorizontal: -20,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 30 + LATTE_OVERLAP,
    marginBottom: -LATTE_OVERLAP,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  // Down over the sheet's 130pt bottom padding, so the page ends in espresso.
  pourBar: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 18, paddingBottom: 130 + 18, marginBottom: -130 },
  pourBarText: { flex: 1 },
  pourBarPrice: { fontFamily: "InstrumentSerif-Regular", fontSize: 22, lineHeight: 28 },
  pourBarSub: { fontFamily: "HankenGrotesk-Medium", fontSize: 12 },
  pourBarButton: { minHeight: 44, borderRadius: 999, paddingHorizontal: 26, alignItems: "center", justifyContent: "center" },
  pourBarButtonText: { fontFamily: "HankenGrotesk-Medium", fontSize: 14 },
  print: {
    borderRadius: 2,
    shadowColor: "#3C2819",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
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
  topRule: { borderTopWidth: 3 },
  blockCard: { borderWidth: 2 },
  product: { borderWidth: 1 },
  outlineRound: { borderWidth: 1 },
  // Stripes: each section a full-width strip, butting onto the next.
  stripe: { marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20 },
  stripeTinted: { borderTopWidth: 1, borderBottomWidth: 1, marginVertical: -0.5 },
  stripeBox: { borderWidth: 1, borderRadius: 16, padding: 16 },
  softCard: { borderRadius: 26, padding: 18, marginBottom: 16 },
  gridBox: { borderRadius: 0, borderWidth: 1, padding: 18, marginBottom: 16 },
  hardShadow: { position: "absolute", top: 5, left: 4, right: -4, bottom: -5 },
  hardShadowChunky: { top: 6, left: 5, right: -5, bottom: -6 },
  innerRule: { position: "absolute", top: 6, left: 6, right: 6, bottom: 6, borderWidth: 1 },
  headingFlex: { flexShrink: 1 },
  // Calling Card: room at the top for the clip, and a fine rule inset from the edge.
  clippedCard: { marginTop: 22, paddingTop: 34 },
  clippedRule: { position: "absolute", top: 6, left: 6, right: 6, bottom: 6, borderWidth: 1, borderRadius: 1 },
  clippedClip: { position: "absolute", top: -34, alignSelf: "center" },
  pageCard: { borderRadius: 2, borderWidth: StyleSheet.hairlineWidth },
  pageEdge: { position: "absolute", top: 3, left: 3, right: -3, bottom: -3, borderRadius: 2, borderWidth: StyleSheet.hairlineWidth },
  pageEdgeBack: { top: 6, left: 6, right: -6, bottom: -6 },
  sheer: { borderWidth: 1, padding: 18 },
  raised: {
    borderWidth: 1,
    shadowColor: "#463428",
    shadowOffset: { width: 1, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
    overflow: "visible",
  },
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
  numeral: { fontFamily: "Cinzel-Bold", fontSize: 16, width: 30 },
  numeralLower: { fontFamily: "Marcellus-Regular", fontSize: 16, width: 30 },
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
  membership: { borderRadius: 0, paddingHorizontal: 12, paddingVertical: 16, alignItems: "center", gap: 2 },
  membershipLabel: { fontFamily: "LilitaOne-Regular", fontSize: 15, lineHeight: 20, letterSpacing: 0.6, textAlign: "center" },
  membershipTag: { borderWidth: 1, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2, marginTop: 6 },
  membershipTagText: { fontFamily: "LilitaOne-Regular", fontSize: 9, lineHeight: 12, letterSpacing: 0.8 },
  tileLabel: { fontFamily: "LeagueSpartan-ExtraBold", fontSize: 13, letterSpacing: 1 },
  sticker: { borderRadius: 22, padding: 14 },
  stickerLabel: { fontFamily: "Fraunces-SoftBlackItalic", fontSize: 16 },
  outlined: { borderWidth: 1, paddingVertical: 16, paddingHorizontal: 10, alignItems: "center", gap: 6 },
  outlinedLabel: { fontFamily: "Bellefair-Regular", fontSize: 15, lineHeight: 20, letterSpacing: 2, textAlign: "center" },
  hairFirst: { borderTopWidth: 0 },
  recessed: { borderWidth: 1.5, borderRadius: 4, paddingHorizontal: 16, paddingVertical: 6 },
  recessedLabel: { fontFamily: "LibreCaslonDisplay-Regular", fontSize: 11, lineHeight: 15, letterSpacing: 1.8, width: 104, paddingTop: 2 },
  hairLabel: { fontFamily: "TenorSans_400Regular", fontSize: 14, flexShrink: 0, maxWidth: "45%" },
  hairValueCol: { flex: 1 },
  settingsRow: { flexDirection: "row", gap: 16, paddingVertical: 13 },
  settingsRule: { borderTopWidth: StyleSheet.hairlineWidth },
  settingsLabel: { fontFamily: "HankenGrotesk-Medium", fontSize: 14, lineHeight: 19, flexShrink: 0, maxWidth: "45%" },
  settingsValueCol: { alignItems: "flex-end" },
  settingsValue: { fontFamily: "HankenGrotesk-Medium", fontSize: 14, lineHeight: 19, textAlign: "right" },
  settingsTag: { fontFamily: "Manrope-Bold", fontSize: 11, marginTop: 4, textAlign: "right" },
  gridCells: { flexDirection: "row", flexWrap: "wrap" },
  gridCell: { width: "50%", paddingVertical: 12, gap: 2 },
  gridCellLeft: { borderRightWidth: 1, paddingRight: 12 },
  gridCellRight: { paddingLeft: 12 },
  gridCellBelow: { borderTopWidth: 1 },
  gridLabel: { fontFamily: "HankenGrotesk-Medium", fontSize: 10, lineHeight: 14, letterSpacing: 1.4 },
  gridTag: { marginTop: 4 },
  hairValue: { fontSize: 13, lineHeight: 18, textAlign: "right" },
  columnsGrid: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: 1, borderLeftWidth: 1 },
  columnCell: { width: "50%", borderRightWidth: 1, borderBottomWidth: 1, paddingHorizontal: 10, paddingVertical: 10, gap: 4 },
  columnLabel: { fontFamily: "Oswald-Medium", fontSize: 14, lineHeight: 19, letterSpacing: 0.8, textAlign: "center" },
  columnTag: { alignSelf: "center", borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1, marginTop: 4 },
  columnTagText: { fontFamily: "Oswald-Medium", fontSize: 9, lineHeight: 12, letterSpacing: 0.8 },
  ribbonCard: { borderRadius: 2, overflow: "hidden", paddingHorizontal: 18, paddingTop: 46, paddingBottom: 20 },
  ribbonShadow: {
    borderRadius: 2,
    shadowColor: "#14040A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 4,
  },
  ribbon: { position: "absolute", top: 20, right: -54, width: 190, height: 26, transform: [{ rotate: "45deg" }] },
  ribbonGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 16, columnGap: 16, paddingRight: 18 },
  ribbonCell: { flexBasis: "44%", flexGrow: 1, gap: 4 },
  ribbonLabel: { fontFamily: "Forum-Regular", fontSize: 14, lineHeight: 19, letterSpacing: 2.2 },
  tagLeft: { alignSelf: "flex-start" },
  // The demure set (2026-11-16).
  loungeCell: { gap: 2, paddingVertical: 4 },
  loungeLabel: { fontFamily: "LeagueGothic-Regular", fontSize: 19, lineHeight: 25, letterSpacing: 0.5 },
  softTile: { borderRadius: 18, padding: 12 },
  softLabel: { fontFamily: "Archivo-ExtraBold", fontSize: 13, lineHeight: 18 },
  gentleList: { gap: 18, paddingTop: 2 },
  gentleRow: { alignItems: "center", gap: 4, paddingHorizontal: 8 },
  gentleLabel: { fontFamily: "HankenGrotesk-Medium", fontSize: 9.5, lineHeight: 13, letterSpacing: 3, textAlign: "center" },
  gentleValue: { fontFamily: "Newsreader-LightItalic", fontSize: 16, lineHeight: 24, textAlign: "center" },
  pearlList: { gap: 14 },
  pearlRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  pearlBullet: { marginTop: 3 },
  pearlLabel: { fontFamily: "Figtree-SemiBold", fontSize: 10, lineHeight: 14, letterSpacing: 2.4 },
  ribbonBandCard: { borderRadius: 26, overflow: "hidden" },
  ribbonBand: { height: 12, borderBottomWidth: 1 },
  ribbonBandGrid: { padding: 18 },
  bowLabel: { fontFamily: "SortsMillGoudy-Italic", fontSize: 17, lineHeight: 24 },
  accordion: { borderBottomWidth: StyleSheet.hairlineWidth },
  accordionRow: { borderTopWidth: StyleSheet.hairlineWidth },
  accordionHead: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  accordionLabel: { fontFamily: "Manrope-Bold", fontSize: 13, letterSpacing: 0.8, flexShrink: 1 },
  accordionBody: { paddingBottom: 14 },
  rulesList: { gap: 14 },
  ruleRow: { flexDirection: "row", gap: 12 },
  ruleNumber: { fontFamily: "IMFellEnglish-Regular", fontSize: 22, lineHeight: 29, width: 18 },
  ruleText: { fontSize: 14, lineHeight: 21 },
  ruleLabel: { fontFamily: "IMFellEnglishSC-Regular", fontSize: 15, letterSpacing: 0.6 },
  ruleTag: { fontFamily: "IMFellEnglishSC-Regular", fontSize: 12, letterSpacing: 1, marginTop: 4 },
});
