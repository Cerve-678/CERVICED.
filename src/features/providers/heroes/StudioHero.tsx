// src/features/providers/heroes/StudioHero.tsx
//
// The Studio page style's hero (pageStyles hero 'studio'): the top of a
// boutique studio's website, inset from the screen's edges. A bar in a deep
// shade of the accent carries what they do in chunky caps ("LASHES & BROWS."),
// the joining words in a light script. Under it, a panel of the accent with
// their logo in the middle and their name across its foot as a lowercase
// serif wordmark with a full stop ("amara beauty."), pressed tone-on-tone into
// the panel like an embossed card. Their area sits small in the panel's top
// corner and a Book now pill jumps to Services. No portfolio photo.
//
// From the owner's 2026-11-16 references: a burgundy-and-blush studio site
// ("TURN UP the HEAT.") and an embossed lowercase wordmark ("imani."). Owner
// feedback the same day: inset the hero; no logo on the bar (it stays in the
// middle, a little bigger); swap the name and what they do, each keeping its
// own font, so the name keeps the pressed serif; and no portfolio photo.

import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { blend, isDarkColor } from "../../../constants/providerThemes";
import { EmbossedText } from "./EmbossedHero";

/** Words drawn in the script rather than the caps, wherever they fall. */
const JOINING_WORDS = new Set(["&", "and", "the", "by", "of", "with", "at", "for", "in", "x"]);

/** One run of the bar's line: caps, or a joining word in script. */
export interface StudioHeadlinePart {
  text: string;
  script: boolean;
}

/**
 * What they do for the bar: "Lashes & brows" → LASHES, &, BROWS — the caps
 * runs and the joining words (in script) separately, ready to draw inline.
 * Nothing to say yet reads WELCOME.
 */
export function studioHeadline(phrase: string): StudioHeadlinePart[] {
  const parts: StudioHeadlinePart[] = [];
  const push = (text: string, script: boolean) => {
    const last = parts[parts.length - 1];
    if (last && last.script === script) last.text = `${last.text} ${text}`;
    else parts.push({ text, script });
  };
  const words = phrase.trim().split(/\s+/).filter(Boolean);
  for (const word of words.length > 0 ? words : ["Welcome"]) {
    const bare = word.toLowerCase().replace(/[^a-z&]/g, "");
    if (JOINING_WORDS.has(bare)) push(word.toLowerCase(), true);
    else push(word.toUpperCase(), false);
  }
  return parts;
}

/** Their name as a lowercase wordmark with a full stop: "Amara Beauty" → "amara beauty.". */
export function studioWordmark(name: string): string {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function StudioHero({
  name,
  phrase,
  location,
  accent,
  renderLogo,
  details,
  tick,
  onBookNow,
}: {
  name: string;
  /** What they do as a phrase, "Lashes & brows": the line on the bar. */
  phrase: string;
  location: string;
  accent: string;
  renderLogo: (size: number) => React.ReactNode;
  details: React.ReactNode;
  tick: React.ReactNode;
  /** Jumps to Services. Left out for a link-only provider (they book
   *  elsewhere), and then there's no button. */
  onBookNow?: (() => void) | undefined;
}) {
  // The bar is always a deep shade of the accent, so the pale caps read on it.
  const bar = isDarkColor(accent) ? blend(accent, "#000000", 0.25) : blend(accent, "#000000", 0.5);
  const blush = blend(accent, "#FFFFFF", 0.72);
  // The panel is the accent itself; the name is pressed into it.
  const panel = accent;
  const panelDark = isDarkColor(panel);
  const areaInk = panelDark ? "rgba(255,255,255,0.86)" : "rgba(31,26,24,0.72)";
  const headline = studioHeadline(phrase);

  return (
    <View style={styles.wrap}>
      <View style={[styles.bar, { backgroundColor: bar }]}>
        <Text
          style={[styles.headline, { color: blush }]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
          accessibilityLabel={phrase || "Welcome"}
        >
          {headline.map((part, index) => (
            <Text key={`${index}-${part.text}`} style={part.script ? styles.script : null}>
              {index > 0 ? " " : ""}{part.text}
            </Text>
          ))}
          <Text>.</Text>
        </Text>
      </View>

      <View style={[styles.panel, { backgroundColor: panel }]}>
        <View style={styles.panelTop}>
          {location ? (
            <Text style={[styles.area, { color: areaInk }]} numberOfLines={2}>{location.toUpperCase()}</Text>
          ) : <View />}
          {onBookNow ? (
            <TouchableOpacity
              style={[styles.bookNow, { backgroundColor: bar }]}
              onPress={onBookNow}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Book now. Go to services"
            >
              <Text style={[styles.bookNowText, { color: blush }]}>BOOK NOW</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* HeroLogo keeps 20pt under itself; the panel spaces it already. */}
        <View style={styles.logo}>{renderLogo(112)}</View>

        <View style={styles.nameRow} accessible accessibilityRole="header" accessibilityLabel={name}>
          <EmbossedText
            paper={panel}
            face={blend(panel, "#000000", panelDark ? 0.18 : 0.08)}
            edges={
              panelDark
                ? { high: "rgba(255,255,255,0.22)", shade: "rgba(0,0,0,0.55)", drop: "rgba(0,0,0,0.3)" }
                : { high: "rgba(255,255,255,0.9)", shade: "rgba(60,40,36,0.42)", drop: "rgba(60,40,36,0.16)" }
            }
            style={styles.wordmark}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
          >
            {studioWordmark(name)}
          </EmbossedText>
          {tick ? <View style={styles.tick}>{tick}</View> : null}
        </View>
      </View>

      <View style={styles.details}>{details}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Inset from the screen's edges, the bar and the panel as one block. Opens
  // on the bar, so it starts lower than a logo-first hero (as TEXT_FIRST_DROP
  // in ProfileHero) and clears the header buttons.
  wrap: { alignSelf: "stretch", alignItems: "center", marginTop: 48, marginBottom: 30, paddingHorizontal: 20 },
  bar: { alignSelf: "stretch", alignItems: "center", justifyContent: "center", paddingHorizontal: 16, paddingVertical: 8 },
  // Lilita One caps with Ephesis for the joining words. The line is set for
  // the script (≥1.45× its size) so its loops aren't cropped.
  headline: { fontFamily: "LilitaOne-Regular", fontSize: 28, lineHeight: 44, letterSpacing: 0.5, textAlign: "center" },
  script: { fontFamily: "Ephesis-Regular", fontSize: 28, letterSpacing: 0 },
  panel: { alignSelf: "stretch", paddingHorizontal: 18, paddingTop: 16, paddingBottom: 18 },
  // Book now sits on the right, centred on the line of the area at the left
  // (owner, 2026-11-16: it sat higher than the text).
  panelTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 34 },
  area: { fontFamily: "Manrope-Bold", fontSize: 10, lineHeight: 14, letterSpacing: 2, flexShrink: 1, textAlign: "left" },
  bookNow: { borderRadius: 100, paddingVertical: 9, paddingHorizontal: 16 },
  bookNowText: { fontFamily: "Manrope-Bold", fontSize: 10, lineHeight: 14, letterSpacing: 2 },
  logo: { alignItems: "center", marginTop: 18, marginBottom: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  // Young Serif's ascenders need the line at 1.3× or the tops crop.
  wordmark: { fontFamily: "YoungSerif-Regular", fontSize: 40, lineHeight: 52, textAlign: "center", flexShrink: 1 },
  tick: { marginTop: 4 },
  details: { alignItems: "center", marginTop: 16, paddingHorizontal: 20 },
});
