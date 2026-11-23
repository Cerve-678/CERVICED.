// Moodboard's top (owner's pick 13 from the 2026-11-23 clean-girl round of
// the "range of branding templates" canvas): a soft Pinterest board. Up to
// four of their chosen photos are layered at easy angles, each in a white
// print border with a tiny spaced-caps caption, the fourth one round. Their
// name runs in huge thin lowercase across the foot of the collage; under it,
// what they do and where in an italic serif line, beside an outline Book pill.

import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { blend, isDarkColor } from "../../../constants/providerThemes";
import { HeroPhoto } from "../HeroPhoto";

/** The four prints, as placed on the canvas's 320pt-wide board: left or
 *  right edge, top, size and tilt. The fourth is the round one. */
const PRINTS = [
  { side: "left", inset: 4, top: 6, width: 150, height: 190, tilt: "-4deg" },
  { side: "right", inset: 6, top: 0, width: 140, height: 150, tilt: "3deg" },
  { side: "left", inset: 120, top: 120, width: 120, height: 140, tilt: "2deg" },
  { side: "right", inset: 14, top: 160, width: 96, height: 96, tilt: "0deg" },
] as const;

/** A print's white border: 6pt round the photo, 20pt under it for the caption. */
const PRINT_EDGE = 6;
const PRINT_FOOT = 20;

/** The shape (width ÷ height) of the photo inside each print, for Branding's adjust sheet. */
export function moodboardPhotoAspect(index: number): number {
  const print = PRINTS[index] ?? PRINTS[0];
  if (index === 3) return 1;
  return (print.width - PRINT_EDGE * 2) / (print.height - PRINT_EDGE - PRINT_FOOT);
}

/** The print paper: white on a pale page, a warm dark card on a dark one. */
export function moodboardPrint(sheet: string): { paper: string; shadow: string } {
  return isDarkColor(sheet)
    ? { paper: "#2A241F", shadow: "rgba(0,0,0,0.45)" }
    : { paper: "#FFFFFF", shadow: "rgba(60,40,25,0.16)" };
}

/** The name split as the board sets it: the first word huge across the
 *  collage ("halo"), the rest in the italic line under it ("lash & brow").
 *  A short first word ("the", "j") takes the next one with it, so the big
 *  line is never a lone article or initial. */
export function moodboardName(name: string): [string, string] {
  const words = name.trim().split(/\s+/).filter(Boolean);
  let take = 1;
  while (take < words.length && words.slice(0, take).join(" ").length < 4) take += 1;
  return [words.slice(0, take).join(" "), words.slice(take).join(" ")];
}

/** "LASHES" → "LASH", "BROWS" → "BROW": the tag on a service and a print's caption. */
export function moodboardTag(type: string): string {
  const word = type.trim().toUpperCase();
  if (word.endsWith("SHES")) return word.slice(0, -2);
  if (word.endsWith("S") && !word.endsWith("SS")) return word.slice(0, -1);
  return word;
}

export function MoodboardHero({
  name,
  kicker,
  location,
  accent,
  sheetColour,
  heroText,
  photos,
  captions,
  renderLogo,
  tick,
  details,
  onBookNow,
  onOpenPhoto,
}: {
  name: string;
  /** What they do, "LASHES · BROWS": the italic line, and the captions a photo without its own falls back to. */
  kicker: string;
  location: string;
  accent: string;
  sheetColour: string;
  heroText: string;
  /** Up to four chosen photos (Branding → Your Photos). */
  photos: readonly string[];
  /** Each photo's own portfolio caption, when it has one. */
  captions: readonly string[];
  renderLogo: (size: number) => React.ReactNode;
  tick: React.ReactNode;
  details: React.ReactNode;
  /** Jumps to Services. Left out for a link-only provider, and then there's no button. */
  onBookNow?: (() => void) | undefined;
  onOpenPhoto?: ((index: number) => void) | undefined;
}) {
  const { paper, shadow } = moodboardPrint(sheetColour);
  const types = kicker.split("·").map(part => part.trim()).filter(Boolean);
  const emptyFill = blend(accent, paper, 0.55);
  const caption = (index: number): string => {
    const own = captions[index]?.trim();
    if (own) return own.toUpperCase();
    return types.length ? moodboardTag(types[index % types.length]!) : "";
  };
  const [big, rest] = moodboardName(name);
  // The rest of the name, or what they do when the name is one word, then where.
  const line = [rest || types.map(type => type.toLowerCase()).join(" & "), location].filter(Boolean).join(", ").toLowerCase();

  return (
    <View style={styles.wrap}>
      <View style={styles.board}>
        {PRINTS.map((print, index) => {
          const photo = photos[index];
          const round = index === 3;
          const place = print.side === "left" ? { left: print.inset } : { right: print.inset };
          return (
            <TouchableOpacity
              key={index}
              style={[
                round ? styles.roundPrint : styles.print,
                place,
                { top: print.top, width: print.width, height: print.height, backgroundColor: paper, shadowColor: shadow, transform: [{ rotate: print.tilt }] },
              ]}
              disabled={!photo || !onOpenPhoto}
              onPress={() => onOpenPhoto?.(index)}
              accessibilityRole={photo && onOpenPhoto ? "imagebutton" : undefined}
              accessibilityLabel={photo ? `${name} work photo ${index + 1}` : undefined}
              accessibilityElementsHidden={!photo}
              importantForAccessibility={photo ? "auto" : "no-hide-descendants"}
              activeOpacity={0.88}
            >
              {round ? (
                <View style={[styles.roundPhoto, { backgroundColor: emptyFill }]}>
                  {photo ? <HeroPhoto uri={photo} /> : <View style={styles.roundLogo}>{renderLogo(72)}</View>}
                </View>
              ) : (
                <>
                  <View style={[styles.photo, { backgroundColor: emptyFill }]}>{photo ? <HeroPhoto uri={photo} /> : null}</View>
                  <Text style={[styles.caption, { color: heroSubOn(paper) }]} numberOfLines={1}>{caption(index)}</Text>
                </>
              )}
            </TouchableOpacity>
          );
        })}
        <View accessible accessibilityRole="header" accessibilityLabel={name} style={styles.nameRow} pointerEvents="none">
          <Text style={[styles.name, { color: heroText }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
            {big.toLowerCase()}
          </Text>
          {tick}
        </View>
      </View>
      <View style={styles.under}>
        <View style={styles.underText}>
          {line ? <Text style={[styles.line, { color: heroText }]} numberOfLines={2}>{line}</Text> : null}
        </View>
        {onBookNow ? (
          <TouchableOpacity
            style={[styles.book, { borderColor: heroText }]}
            onPress={onBookNow}
            accessibilityRole="button"
            accessibilityLabel="Book"
            activeOpacity={0.8}
          >
            <Text style={[styles.bookText, { color: heroText }]}>BOOK</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.foot}>{details}</View>
    </View>
  );
}

/** A caption's quiet ink on the print paper. */
function heroSubOn(paper: string): string {
  return isDarkColor(paper) ? "#B9AC9F" : "#6E6259";
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 24, gap: 16 },
  board: { height: 300 },
  print: {
    position: "absolute",
    paddingTop: PRINT_EDGE,
    paddingHorizontal: PRINT_EDGE,
    paddingBottom: PRINT_FOOT,
    shadowOpacity: 1,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  roundPrint: {
    position: "absolute",
    borderRadius: 999,
    padding: 5,
    shadowOpacity: 1,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  photo: { flex: 1, overflow: "hidden" },
  roundPhoto: { flex: 1, borderRadius: 999, overflow: "hidden" },
  roundLogo: { flex: 1, alignItems: "center", justifyContent: "center" },
  caption: { position: "absolute", left: PRINT_EDGE, right: PRINT_EDGE, bottom: 5, fontFamily: "Jost-Light", fontSize: 8, letterSpacing: 2 },
  nameRow: { position: "absolute", zIndex: 2, left: 0, right: 0, bottom: -8, flexDirection: "row", alignItems: "flex-end", gap: 6 },
  name: { flexShrink: 1, fontFamily: "Jost-Light", fontSize: 76, lineHeight: 80, letterSpacing: -2 },
  under: { flexDirection: "row", alignItems: "center", gap: 10 },
  underText: { flex: 1 },
  line: { fontFamily: "InstrumentSerif-Italic", fontSize: 19, lineHeight: 24 },
  book: { minHeight: 44, borderRadius: 999, borderWidth: 1, paddingHorizontal: 22, alignItems: "center", justifyContent: "center" },
  bookText: { fontFamily: "Jost-Light", fontSize: 12, letterSpacing: 3 },
  foot: { alignItems: "center" },
});
