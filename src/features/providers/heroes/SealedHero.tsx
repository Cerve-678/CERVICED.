// src/features/providers/heroes/SealedHero.tsx
//
// The Sealed page style's hero pieces: the back of an envelope closed with a
// wax seal of their initial, a cream card tucked behind it with only its corner
// (and their logo) showing, and a postmark of their area over the flap.
// The envelope is a physical object, so its paper colours are fixed; only the
// wax follows their accent.

import React, { useId } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Path, Polygon, Text as SvgText, TextPath } from "react-native-svg";

import { WaxSeal } from "../WaxSeal";

const ENVELOPE_W = 250;
const ENVELOPE_H = 162;
/** The envelope's left edge inside the stage; the stage is wider so the card can peek out. */
const ENVELOPE_X = 18;
const SEAL = 82;

const PAPER = {
  back: "#EADCC8",
  left: "#E2D2BC",
  right: "#DFCEB6",
  bottom: "#E7D9C4",
  flap: "#F3E9DA",
  card: "#FBF6EE",
  postmark: "#5A3A35",
} as const;

export function SealedEnvelope({
  wax,
  initial,
  logo,
  postmark,
}: {
  /** waxColour(accent). */
  wax: string;
  /** Their initial, pressed into the seal. */
  initial: string;
  /** Their logo, drawn at LOGO_SIZE; sits on the card's showing corner. */
  logo: React.ReactNode;
  /** Words round the postmark (their area). Left out with nothing to say. */
  postmark?: string;
}) {
  return (
    <View style={styles.stage}>
      {/* Behind the envelope: a card tucked in, tilted so one corner shows. */}
      <View style={styles.card}>
        <View style={styles.cardRule} pointerEvents="none" />
        <View style={styles.cardLogo}>{logo}</View>
      </View>

      <View style={styles.envelope} pointerEvents="none">
        <Svg width={ENVELOPE_W} height={ENVELOPE_H} viewBox={`0 0 ${ENVELOPE_W} ${ENVELOPE_H}`}>
          <Polygon points={`0,0 135,90 0,${ENVELOPE_H}`} fill={PAPER.left} />
          <Polygon points={`${ENVELOPE_W},0 115,90 ${ENVELOPE_W},${ENVELOPE_H}`} fill={PAPER.right} />
          <Polygon points={`0,${ENVELOPE_H} 125,74 ${ENVELOPE_W},${ENVELOPE_H}`} fill={PAPER.bottom} />
          {/* The flap's shadow, then the flap. */}
          <Polygon points={`0,2 ${ENVELOPE_W},2 125,104`} fill="rgba(0,0,0,0.12)" />
          <Polygon points={`0,0 ${ENVELOPE_W},0 125,100`} fill={PAPER.flap} />
        </Svg>
        {postmark ? <Postmark text={postmark} /> : null}
      </View>

      <View style={styles.seal} pointerEvents="none">
        <WaxSeal size={SEAL} wax={wax} letter={initial} />
      </View>
    </View>
  );
}

/** The logo's size on the tucked card. */
export const SEALED_LOGO_SIZE = 58;

/** A round postmark with their area round its ring, and wavy cancel lines. */
function Postmark({ text }: { text: string }) {
  const id = `pm${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  // The ring holds about 28 characters at this size; longer areas are cut at a word.
  const words = text.toUpperCase().split(/\s+/);
  let ring = "";
  for (const word of words) {
    if ((ring + " " + word).trim().length > 26) break;
    ring = (ring + " " + word).trim();
  }
  return (
    <View style={styles.postmark}>
      <Svg width={124} height={70} viewBox="0 0 124 70">
        <Defs>
          <Path id={id} d="M35 35 m-25 0 a25 25 0 1 1 50 0 a25 25 0 1 1 -50 0" fill="none" />
        </Defs>
        <Circle cx={35} cy={35} r={32} fill="none" stroke={PAPER.postmark} strokeWidth={1.3} />
        <Circle cx={35} cy={35} r={18} fill="none" stroke={PAPER.postmark} strokeWidth={1} />
        <SvgText fill={PAPER.postmark} fontSize={7.5} letterSpacing={1.6} fontFamily="EBGaramond-SemiBold">
          <TextPath href={`#${id}`}>{`${ring} · ${ring} ·`}</TextPath>
        </SvgText>
        <SvgText x={35} y={39} fill={PAPER.postmark} fontSize={11} textAnchor="middle">✦</SvgText>
        <Path
          d="M70 20q7 -5 13 0t13 0t13 0t13 0M70 31q7 -5 13 0t13 0t13 0t13 0M70 42q7 -5 13 0t13 0t13 0t13 0M70 53q7 -5 13 0t13 0t13 0t13 0"
          fill="none"
          stroke={PAPER.postmark}
          strokeWidth={1.2}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: 300, height: 222, alignSelf: "center" },
  envelope: {
    position: "absolute", left: ENVELOPE_X, top: 0, width: ENVELOPE_W, height: ENVELOPE_H,
    backgroundColor: PAPER.back, borderRadius: 4,
    shadowColor: "#000000", shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
  },
  // Tucked behind the envelope's lower-right corner; about a third of it shows.
  card: {
    position: "absolute", left: 186, top: 98, width: 108, height: 116,
    backgroundColor: PAPER.card, borderRadius: 3, transform: [{ rotate: "-9deg" }],
    shadowColor: "#000000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 8, elevation: 4,
  },
  cardRule: { position: "absolute", top: 5, left: 5, right: 5, bottom: 5, borderWidth: 1, borderColor: "rgba(90,58,53,0.25)" },
  // HeroLogo keeps 20pt under itself; cancel it so the logo sits in the corner.
  cardLogo: { position: "absolute", right: 9, bottom: 9 - 20 },
  seal: {
    position: "absolute", left: ENVELOPE_X + ENVELOPE_W / 2 - SEAL / 2, top: 100 - SEAL / 2,
    shadowColor: "#000000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 4,
  },
  postmark: { position: "absolute", top: 8, right: -18, opacity: 0.55, transform: [{ rotate: "-10deg" }] },
});
