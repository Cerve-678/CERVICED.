// src/features/providers/ProfileHero.tsx
//
// Pieces of the public profile's hero that the profile and Branding's preview
// both draw, so the preview can't drift from what clients actually see: the
// logo in its page-style frame, Cover's pills, and the business name's size.

import React, { useId } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle, Defs, Ellipse, G, Path, Polygon, Text as SvgText, TextPath } from "react-native-svg";

import { LogoCircle } from "../../components/FramedLogo";
import type { PageStyle } from "../../constants/pageStyles";
import { blend, withAlpha } from "../../constants/providerThemes";
import type { LogoFraming } from "../../types/database";

/** The business name under the logo; a thin script is drawn larger than
 *  this (see resolveProviderFontScale), and Cover larger still (nameScale). */
export const HERO_NAME_SIZE = 30;
export const HERO_NAME_LINE_HEIGHT = 40;

/** Up to two initials, for a provider with no logo. */
export function logoInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map(word => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * The logo in the hero, in the page style's frame: Scrapbook mounts it as a
 * polaroid, Spa adds a fine outer ring, Glossy a shiny one, Arch and Framed
 * round only its top. Without a logo it shows the initials on the accent.
 */
export function HeroLogo({
  uri,
  framing,
  name,
  fallbackColor,
  accent,
  heroText,
  pageStyle,
  onPress,
  accessibilityLabel,
  size = 148,
}: {
  uri: string | null | undefined;
  framing?: LogoFraming | null;
  name: string;
  fallbackColor: string;
  accent: string;
  /** The hero's text colour; Spa's outer ring follows it. */
  heroText: string;
  pageStyle: PageStyle;
  /** Tap to see the logo in full. Left out in the preview. */
  onPress?: () => void;
  accessibilityLabel?: string;
  /** The logo's width and height; the hero layouts draw it smaller beside text. */
  size?: number;
}) {
  // Everything below is drawn for 148pt; other sizes scale it.
  const box = { width: size, height: size, borderRadius: size / 2 };
  const ringOut = (extra: number) => ({
    top: -extra, left: -extra, width: size + extra * 2, height: size + extra * 2, borderRadius: size / 2 + extra,
  });
  const frame =
    pageStyle.logo === "arch"
      ? [styles.arch, { borderTopLeftRadius: size / 2, borderTopRightRadius: size / 2 }]
      : pageStyle.logo === "polaroid" || pageStyle.logo === "mat"
        ? styles.polaroidPhoto
        : pageStyle.logo === "tilted"
          ? [styles.tilted, { borderRadius: Math.round(size * 0.16) }]
          : pageStyle.logo === "doubleRing" || pageStyle.logo === "glossRing"
            || pageStyle.logo === "accentRing" || pageStyle.logo === "flower"
            ? styles.thinRim
            : null;

  const logo = uri ? (
    <LogoCircle uri={uri} framing={framing} style={[styles.logo, box, frame]} />
  ) : (
    <View style={[styles.logo, box, frame, styles.initialsWrap, { backgroundColor: fallbackColor }]}>
      <Text style={[styles.initials, { fontSize: 28 * (size / 148) }]}>{logoInitials(name)}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View
        style={
          pageStyle.logo === "polaroid" ? styles.polaroid
          : pageStyle.logo === "mat" ? styles.matFrame
          : undefined
        }
      >
        <View style={pageStyle.logo === "mat" ? [styles.mat, { padding: Math.round(size * 0.08) }] : undefined}>
        <View style={[styles.wrapper, { width: size, height: size }]}>
          {pageStyle.logo === "flower" ? (
            // Groovy: a scalloped flower of the accent behind the logo.
            <Svg
              width={size * 1.4}
              height={size * 1.4}
              viewBox="0 0 100 100"
              style={{ position: "absolute", top: -size * 0.2, left: -size * 0.2 }}
              pointerEvents="none"
            >
              <G fill={accent}>
                {FLOWER_PETALS.map(([cx, cy]) => (
                  <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={17} />
                ))}
                <Circle cx={50} cy={50} r={36} />
              </G>
            </Svg>
          ) : null}
          {pageStyle.logo === "accentRing" ? (
            <View style={[styles.doubleRing, ringOut(9 * (size / 148)), { borderColor: accent, borderWidth: 2 }]} pointerEvents="none" />
          ) : null}
          {pageStyle.logo === "glossRing" ? (
            <LinearGradient
              colors={["#FFFFFF", blend(accent, "#FFFFFF", 0.45), "#FFFFFF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.glossRing, ringOut(8 * (size / 148))]}
              pointerEvents="none"
            />
          ) : null}
          {pageStyle.logo === "doubleRing" ? (
            <View style={[styles.doubleRing, ringOut(11 * (size / 148)), { borderColor: withAlpha(heroText, 0.7) }]} pointerEvents="none" />
          ) : null}
          {uri && onPress ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onPress}
              accessibilityRole="imagebutton"
              accessibilityLabel={accessibilityLabel}
            >
              {logo}
            </TouchableOpacity>
          ) : (
            logo
          )}
          {/* Sits on top of the logo, so it must let taps through. */}
          <LinearGradient
            colors={["rgba(255,255,255,0.3)", "transparent"]}
            style={[styles.gloss, box, frame]}
            pointerEvents="none"
          />
        </View>
        </View>
      </View>
    </View>
  );
}

/** Petal centres round Groovy's flower frame (viewBox 0–100). */
const FLOWER_PETALS: readonly [number, number][] = [
  [84, 50], [74, 74], [50, 84], [26, 74], [16, 50], [26, 26], [50, 16], [74, 26],
];

// ── Hero layouts ─────────────────────────────────────────────────────────────

export interface ProfileHeroLayoutProps {
  pageStyle: PageStyle;
  name: string;
  /** What they do ("LASHES · BROWS"): Arch's curved caption and Spa's top line. */
  kicker: string;
  location: string;
  heroText: string;
  heroSub: string;
  heroIsDark: boolean;
  /** The logo at a given size. */
  renderLogo: (size: number) => React.ReactNode;
  /** The name row (name + verified tick) at a multiple of the standard size. */
  renderName: (options: { scale: number; letterSpacing?: number }) => React.ReactNode;
  /** The small-caps line under the name, or Cover's pills. */
  meta: React.ReactNode;
  /** Stars, years of experience and the slots pill with its bell (or a
   *  link-only provider's Book block). Every layout shows these. */
  details: React.ReactNode;
  /** Their About, for the layouts that carry it in the hero (Arch, Framed, Duet). */
  about: React.ReactNode;
  /** The theme accent: Editorial's full stop, Heritage's script, Duet's film strip. */
  accent: string;
  /** Up to two of their portfolio photos (Editorial's back card, Duet's film strip). */
  photoUris?: readonly string[];
  /** Their star rating, for Groovy's starburst. Left out when there are no CERVICED reviews. */
  rating?: string | null;
  /** The verified tick beside the name, for the layouts that draw the name themselves. */
  isVerified?: boolean;
}

/** "LASHES · BROWS" → "Lashes & brows" (Gallery's line under the name, Apothecary's label). */
export function kickerPhrase(kicker: string): string {
  const parts = kicker.split("·").map(part => part.trim().toLowerCase()).filter(Boolean);
  if (parts.length === 0) return "";
  const joined = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} & ${parts[parts.length - 1]}`;
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/** The name split for the two-voice heroes: all but the last word, and the last word. */
function splitLast(name: string): [string, string] {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return [words[0] ?? "", ""];
  return [words.slice(0, -1).join(" "), words[words.length - 1]!];
}

/** The name split the other way: the first word, and the rest. */
function splitFirst(name: string): [string, string] {
  const words = name.trim().split(/\s+/);
  return [words[0] ?? "", words.slice(1).join(" ")];
}

/**
 * The top of the profile, laid out by the page style (pageStyles.PageHero).
 * Classic and Glossy stack the logo over the name as the profile always has;
 * the others move the name, the logo and the words round them as their
 * template did on the 2026-11-13 canvas.
 */
export function ProfileHeroLayout({
  pageStyle,
  name,
  kicker,
  location,
  heroText,
  heroSub,
  heroIsDark,
  renderLogo,
  renderName,
  meta,
  details,
  about,
  accent,
  photoUris,
  rating,
  isVerified,
}: ProfileHeroLayoutProps) {
  const shadow = heroIsDark ? layout.shadow : null;
  const tick = isVerified ? (
    <Ionicons name="checkmark-circle" size={18} color={heroIsDark ? "#FFFFFF" : "#007AFF"} accessibilityLabel="Verified" />
  ) : null;
  // The accent stays the accent on a pale hero; over a dark photo it is lifted
  // so it still reads.
  const heroAccent = heroIsDark ? blend(accent, "#FFFFFF", 0.55) : accent;

  switch (pageStyle.hero) {
    case "cover":
      // No logo: the name is the cover line, low over the photo.
      return (
        <View style={layout.coverTop}>
          <View style={layout.infoCenter}>
            {renderName({ scale: 1.6 })}
            {meta}
            {details}
          </View>
        </View>
      );

    case "masthead": {
      // Arch: the name as the page's heading, then the arched logo with
      // what they do curved over it, beside "Meet …" and their About.
      const firstName = name.split(" ")[0] ?? name;
      return (
        <>
          <View style={layout.mastHead}>
            <Text style={[layout.kicker, { color: heroSub }, shadow]}>WELCOME TO MY BOOKING PAGE</Text>
            {renderName({ scale: 1.45 })}
            {location ? (
              <Text style={[layout.located, { color: heroSub }, shadow]}>Located in {location}</Text>
            ) : null}
          </View>
          <View style={layout.mastRow}>
            <View style={layout.mastLogo}>
              {kicker ? <CurvedCaption text={kicker} color={heroText} width={158} /> : null}
              {renderLogo(124)}
            </View>
            <View style={layout.mastAbout}>
              <Text style={[layout.meet, { color: heroText }, shadow]}>Meet</Text>
              <Text style={[layout.meetName, { color: heroText }, shadow]} numberOfLines={2}>{firstName}</Text>
              {about}
            </View>
          </View>
          <View style={layout.infoCenter}>{details}</View>
        </>
      );
    }

    case "sideBySide":
      // Framed: the logo on the left, the welcome on the right.
      return (
        <>
          <View style={layout.sideRow}>
            {renderLogo(118)}
            <View style={layout.sideText}>
              <Text style={[layout.welcome, { color: heroSub }, shadow]}>WELCOME TO</Text>
              {renderName({ scale: 0.95 })}
              {about}
              {location ? (
                <View style={layout.locatedRow}>
                  <Ionicons name="location-outline" size={13} color={heroSub} />
                  <Text style={[layout.locatedScript, { color: heroSub }, shadow]}>located in</Text>
                  <Text style={[layout.locatedPlace, { color: heroText }, shadow]} numberOfLines={2}>{location}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={layout.infoCenter}>{details}</View>
        </>
      );

    case "poster":
      // Scrapbook: a polaroid and a big name.
      return (
        <>
          {renderLogo(112)}
          <View style={layout.infoCenterTight}>
            {renderName({ scale: 1.4 })}
            {meta}
          </View>
          <View style={layout.infoCenter}>{details}</View>
        </>
      );

    case "spa":
      // Spa: a quiet line of what they do, the name spaced out, a ringed logo.
      return (
        <View style={[layout.infoCenter, layout.textFirst]}>
          {kicker ? <Text style={[layout.spaKicker, { color: heroSub }, shadow]}>{kicker}</Text> : null}
          {renderName({ scale: 1.15, letterSpacing: 4 })}
          <View style={layout.spaLogo}>{renderLogo(116)}</View>
          {details}
        </View>
      );

    case "editorial": {
      // Editorial: "Zara" light over "OKAFOR." bold, two tilted cards beside it.
      const [first, rest] = splitFirst(name);
      const bold = (rest || first).toUpperCase();
      return (
        <View style={layout.edWrap}>
          <View style={layout.edTop}>
            <View style={layout.edNameCol} accessible accessibilityRole="header" accessibilityLabel={name}>
              {rest ? (
                <Text style={[layout.edLight, { color: heroText }, shadow]} numberOfLines={1} adjustsFontSizeToFit>
                  {first}
                </Text>
              ) : null}
              <View style={layout.tickRow}>
                <Text
                  style={[layout.edBold, { color: heroText }, shadow]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.55}
                >
                  {bold}
                  <Text style={{ color: heroAccent }}>.</Text>
                </Text>
                {tick}
              </View>
            </View>
            <View style={layout.edCards}>
              <View style={[layout.edBack, { backgroundColor: blend(accent, "#FFFFFF", 0.45) }]}>
                {photoUris?.[0] ? (
                  <Image source={{ uri: photoUris[0] }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
                ) : null}
              </View>
              <View style={layout.edFront}>{renderLogo(86)}</View>
            </View>
          </View>
          <View style={[layout.edRule, { borderTopColor: heroText }]}>
            <Text style={[layout.edKicker, { color: heroText }, shadow]} numberOfLines={1}>{kicker}</Text>
            {location ? (
              <Text style={[layout.edLocation, { color: heroSub }, shadow]} numberOfLines={1}>{location}</Text>
            ) : null}
          </View>
          <View style={layout.leftDetails}>{details}</View>
        </View>
      );
    }

    case "crest": {
      // Heritage: a ringed monogram, a spaced caps line, the name in serif with
      // its last word in script, then double rules.
      const [serif, script] = splitLast(name);
      const caption = [location, kicker].filter(Boolean).join(" · ").toUpperCase();
      const rule = heroIsDark ? withAlpha(heroText, 0.7) : accent;
      return (
        <View style={[layout.infoCenter, layout.crestTop]}>
          {renderLogo(84)}
          {caption ? (
            <Text style={[layout.crestCaption, { color: heroSub }, shadow]} numberOfLines={2}>{caption}</Text>
          ) : null}
          <View style={layout.crestName} accessible accessibilityRole="header" accessibilityLabel={name}>
          <View style={layout.tickRow}>
            <Text style={[layout.crestSerif, { color: heroText }, shadow]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
              {serif}
            </Text>
            {script ? null : tick}
          </View>
          {script ? (
            <View style={[layout.tickRow, layout.crestScriptRow]}>
              <Text style={[layout.crestScript, { color: heroAccent }, shadow]} numberOfLines={1} adjustsFontSizeToFit>{script}</Text>
              {tick}
            </View>
          ) : null}
          </View>
          <View style={layout.doubleRuleRow}>
            <View style={[layout.doubleRule, { borderColor: rule }]} />
            <Text style={[layout.crestStar, { color: rule }]}>✦</Text>
            <View style={[layout.doubleRule, { borderColor: rule }]} />
          </View>
          {details}
        </View>
      );
    }

    case "duet": {
      // Duet: "Hey gorgeous!", the first word as script with the rest in caps
      // over its foot, and a film strip of their photos at the right edge.
      const [script, caps] = splitFirst(name);
      const firstName = name.split(" ")[0] ?? name;
      const pills = kicker.split("·").map(part => part.trim()).filter(Boolean);
      return (
        <>
          <View style={layout.duetRow}>
            <View style={layout.duetText}>
              <Text style={[layout.duetHey, { color: heroText }, shadow]}>HEY GORGEOUS! WELCOME TO</Text>
              <View accessible accessibilityRole="header" accessibilityLabel={name}>
              <Text style={[layout.duetScript, { color: heroAccent }, shadow]} numberOfLines={1} adjustsFontSizeToFit>
                {script}
              </Text>
              {caps ? (
                <View style={[layout.tickRow, layout.duetCapsRow]}>
                  <Text style={[layout.duetCaps, { color: heroText }, shadow]} numberOfLines={2} adjustsFontSizeToFit>
                    {caps.toUpperCase()}
                  </Text>
                  {tick}
                </View>
              ) : tick}
              </View>
              {location ? (
                <Text style={[layout.duetLocated, { color: heroSub }, shadow]} numberOfLines={2}>
                  {location.toUpperCase()}
                </Text>
              ) : null}
            </View>
            <View style={[layout.filmStrip, { backgroundColor: accent }]}>
              {(["first", "second"] as const).map((frame, i) => (
                <View key={frame} style={[layout.filmFrame, { backgroundColor: blend(accent, "#FFFFFF", 0.5) }]}>
                  {photoUris?.[i] ? (
                    <Image source={{ uri: photoUris[i] }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
                  ) : null}
                </View>
              ))}
            </View>
          </View>
          {pills.length ? (
            <View style={layout.duetPills}>
              {pills.map(label => (
                <View key={label} style={[layout.duetPill, { shadowColor: blend(accent, "#FFFFFF", 0.5) }]}>
                  <Text style={layout.duetPillText} numberOfLines={1}>{label}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={layout.duetMeet}>
            <View style={layout.duetMeetLogo}>{renderLogo(100)}</View>
            <View style={layout.duetMeetText}>
              <Text style={[layout.duetMeetScript, { color: heroAccent }, shadow]} numberOfLines={1}>{firstName}</Text>
              <Text style={[layout.duetMeetCaps, { color: heroText }, shadow]}>YOUR ARTIST</Text>
              {about}
            </View>
          </View>
          <View style={layout.infoCenter}>{details}</View>
        </>
      );
    }

    case "groovy": {
      // Groovy: a flower logo, the name huge and soft, the rest in the accent
      // with a hard offset shadow, and a starburst with their rating.
      const [first, rest] = splitFirst(name);
      const shadowInk = heroIsDark ? "rgba(0,0,0,0.6)" : heroText;
      return (
        <View style={layout.groovyWrap}>
          <View style={layout.groovyTop}>
            {renderLogo(78)}
            <Text style={[layout.groovyCaption, { color: heroText }, shadow]} numberOfLines={3}>
              {kicker}
              {location ? `\n${location.toUpperCase()}` : ""}
            </Text>
          </View>
          <View accessible accessibilityRole="header" accessibilityLabel={name}>
          <View style={layout.tickRow}>
            <Text style={[layout.groovyBig, { color: heroText }, shadow]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
              {first.toLowerCase()}
            </Text>
            {rest ? null : tick}
          </View>
          {rest ? (
            <View style={[layout.tickRow, layout.groovyRestRow]}>
              <Text
                style={[layout.groovyRest, { color: heroAccent, textShadowColor: shadowInk }]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {rest.toLowerCase()}
              </Text>
              {tick}
            </View>
          ) : null}
          </View>
          {rating ? <Starburst rating={rating} fill={heroText} ink={heroIsDark ? "#1F1A18" : "#FFFFFF"} /> : null}
          <View style={layout.leftDetails}>{details}</View>
        </View>
      );
    }

    case "exhibition": {
      // Gallery: a wall label over a rule, the name large, then the logo
      // framed and matted.
      const phrase = kickerPhrase(kicker);
      return (
        <View style={layout.galleryWrap}>
          <View style={[layout.galleryLabels, { borderTopColor: heroText }]}>
            <Text style={[layout.galleryLabel, { color: heroSub }, shadow]} numberOfLines={2}>{name.toUpperCase()}</Text>
            <Text style={[layout.galleryLabel, { color: heroSub }, shadow]} numberOfLines={2}>{kicker}</Text>
            <Text style={[layout.galleryLabel, layout.galleryLabelEnd, { color: heroSub }, shadow]} numberOfLines={2}>
              {location.toUpperCase()}
            </Text>
          </View>
          <View style={layout.tickRow}>
            <Text style={[layout.galleryName, { color: heroText }, shadow]} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.6}>
              {name}
            </Text>
            {tick}
          </View>
          {phrase ? <Text style={[layout.galleryPhrase, { color: heroSub }, shadow]}>{phrase}.</Text> : null}
          <View style={layout.galleryArt}>{renderLogo(176)}</View>
          <View style={layout.leftDetails}>{details}</View>
        </View>
      );
    }

    case "label": {
      // Apothecary: an oval label like a bottle's, low over their photo.
      const phrase = kickerPhrase(kicker).toLowerCase();
      const caption = [kicker, location.toUpperCase()].filter(Boolean).join(" · ");
      return (
        <View style={layout.labelWrap}>
          <View style={layout.labelOval}>
            <View style={[layout.labelInner, { borderColor: withAlpha(accent, 0.8) }]} pointerEvents="none" />
            <View style={layout.labelLogo}>{renderLogo(46)}</View>
            {caption ? <Text style={layout.labelCaption} numberOfLines={2}>{caption}</Text> : null}
            <View style={layout.tickRow} accessible accessibilityRole="header" accessibilityLabel={name}>
              <Text style={layout.labelName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
                {name.toUpperCase()}
              </Text>
              {tick}
            </View>
            {phrase ? <Text style={layout.labelPhrase}>{phrase}</Text> : null}
            <Sprig color={accent} />
          </View>
          <View style={layout.labelDetails}>{details}</View>
        </View>
      );
    }

    default:
      return (
        <>
          {renderLogo(148)}
          <View style={layout.infoCenter}>
            {renderName({ scale: 1 })}
            {meta}
            {details}
          </View>
        </>
      );
  }
}

/** Words curved over the top of Arch's logo. */
function CurvedCaption({ text, color, width }: { text: string; color: string; width: number }) {
  const id = `arc${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const r = (width - 20) / 2;
  return (
    <Svg width={width} height={r * 0.62} viewBox={`0 0 ${width} ${r * 0.62}`} style={layout.caption} pointerEvents="none">
      <Defs>
        <Path id={id} d={`M10 ${r * 0.62 + r * 0.6} A${r} ${r} 0 0 1 ${width - 10} ${r * 0.62 + r * 0.6}`} fill="none" />
      </Defs>
      <SvgText fill={color} fontSize={9.5} letterSpacing={2.2} fontFamily="Jura-VariableFont_wght" fontWeight="700">
        <TextPath href={`#${id}`} startOffset="50%" textAnchor="middle">
          {text.toUpperCase()}
        </TextPath>
      </SvgText>
    </Svg>
  );
}

/** Groovy's starburst sticker with their rating. */
function Starburst({ rating, fill, ink }: { rating: string; fill: string; ink: string }) {
  return (
    <View style={layout.starburst} pointerEvents="none" accessible accessibilityLabel={`Rated ${rating}`}>
      <Svg width={100} height={100} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Polygon
          fill={fill}
          points="100,50 89.6,60.6 93.3,75 79,79 75,93.3 60.6,89.6 50,100 39.4,89.6 25,93.3 21,79 6.7,75 10.4,60.6 0,50 10.4,39.4 6.7,25 21,21 25,6.7 39.4,10.4 50,0 60.6,10.4 75,6.7 79,21 93.3,25 89.6,39.4"
        />
      </Svg>
      <Text style={[layout.starburstStar, { color: ink }]}>★</Text>
      <Text style={[layout.starburstRating, { color: ink }]}>{rating}</Text>
      <Text style={[layout.starburstWord, { color: ink }]}>RATED</Text>
    </View>
  );
}

/** Apothecary's little sprig under the name. */
function Sprig({ color }: { color: string }) {
  return (
    <Svg width={70} height={16} viewBox="0 0 70 16" style={layout.sprig} pointerEvents="none">
      <Path d="M4 8H66" stroke={color} strokeWidth={1} />
      <G fill={color}>
        {[18, 35, 52].map(x => (
          <React.Fragment key={x}>
            <Ellipse cx={x} cy={5} rx={6} ry={2.2} transform={`rotate(-30 ${x} 5)`} />
            <Ellipse cx={x} cy={11} rx={6} ry={2.2} transform={`rotate(30 ${x} 11)`} />
          </React.Fragment>
        ))}
      </G>
    </Svg>
  );
}

/** How much lower a hero that opens on text starts than one that opens on the logo. */
const TEXT_FIRST_DROP = 48;

const layout = StyleSheet.create({
  shadow: { textShadowColor: "rgba(0,0,0,0.55)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  infoCenter: { alignItems: "center", marginBottom: 30, paddingHorizontal: 20 },
  infoCenterTight: { alignItems: "center", paddingHorizontal: 20 },
  coverTop: { paddingTop: 120 },
  kicker: { fontFamily: "Jura-VariableFont_wght", fontWeight: "800", fontSize: 10, letterSpacing: 2.4, marginBottom: 8 },
  // Arch, Spa and Framed open on a line of text (Framed's beside its logo),
  // not on the logo alone, so they start lower:
  // at the logo's height the first line sat under the header buttons.
  mastHead: { alignItems: "center", paddingHorizontal: 20, marginTop: TEXT_FIRST_DROP, marginBottom: 18 },
  located: { fontFamily: "Jura-VariableFont_wght", fontWeight: "700", fontSize: 12, letterSpacing: 0.6, marginTop: 4 },
  mastRow: { flexDirection: "row", alignItems: "flex-end", gap: 14, paddingHorizontal: 20, marginBottom: 10 },
  mastLogo: { alignItems: "center" },
  caption: { marginBottom: -6 },
  mastAbout: { flex: 1, paddingBottom: 20 },
  meet: { fontFamily: "PinyonScript_400Regular", fontSize: 34, lineHeight: 40 },
  meetName: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 26, lineHeight: 30, marginBottom: 6 },
  sideRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, marginTop: TEXT_FIRST_DROP, marginBottom: 6 },
  sideText: { flex: 1, alignItems: "center" },
  welcome: { fontFamily: "Jura-VariableFont_wght", fontWeight: "800", fontSize: 11, letterSpacing: 2 },
  locatedRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  locatedScript: { fontFamily: "Sacramento_400Regular", fontSize: 18 },
  locatedPlace: { fontFamily: "Jura-VariableFont_wght", fontWeight: "800", fontSize: 12, flexShrink: 1 },
  textFirst: { marginTop: TEXT_FIRST_DROP },
  spaKicker: { fontFamily: "TenorSans_400Regular", fontSize: 10, letterSpacing: 4, marginBottom: 10, textAlign: "center" },
  spaLogo: { marginTop: 16 },
  tickRow: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  leftDetails: { alignItems: "flex-start", marginTop: 12 },
  // Editorial
  edWrap: { paddingHorizontal: 20, marginTop: TEXT_FIRST_DROP, marginBottom: 26 },
  edTop: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginBottom: 14 },
  edNameCol: { flex: 1, minWidth: 0 },
  edLight: { fontFamily: "LeagueSpartan-Light", fontSize: 50, lineHeight: 52, letterSpacing: -1 },
  edBold: { fontFamily: "LeagueSpartan-ExtraBold", fontSize: 44, lineHeight: 46, letterSpacing: -1.2, flexShrink: 1 },
  edCards: { width: 132, height: 146 },
  edBack: {
    position: "absolute", left: 0, top: 14, width: 84, height: 118, borderRadius: 12, overflow: "hidden",
    transform: [{ rotate: "-5deg" }],
  },
  edFront: { position: "absolute", right: 0, top: 4, transform: [{ rotate: "5deg" }] },
  edRule: { flexDirection: "row", justifyContent: "space-between", gap: 12, borderTopWidth: 1.5, paddingTop: 10 },
  edKicker: { fontFamily: "LeagueSpartan-ExtraBold", fontSize: 11, letterSpacing: 1.6, flexShrink: 1 },
  edLocation: { fontFamily: "LeagueSpartan-Light", fontSize: 12, flexShrink: 1, textAlign: "right" },
  // Heritage
  crestTop: { marginTop: 20 },
  crestName: { alignItems: "center" },
  crestCaption: { fontSize: 10, letterSpacing: 3, textAlign: "center", marginTop: -6 },
  crestSerif: { fontFamily: "BodoniModa-ExtraBold", fontSize: 46, lineHeight: 52, letterSpacing: -1.2, textAlign: "center", marginTop: 10, flexShrink: 1 },
  crestScriptRow: { marginTop: -16, paddingLeft: 70 },
  crestScript: { fontFamily: "PinyonScript_400Regular", fontSize: 54, lineHeight: 74 },
  doubleRuleRow: { flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "stretch", marginTop: 6, marginBottom: 12 },
  doubleRule: { flex: 1, height: 4, borderTopWidth: 1, borderBottomWidth: 1 },
  crestStar: { fontSize: 12 },
  // Duet
  duetRow: { flexDirection: "row", gap: 12, paddingLeft: 20, marginTop: TEXT_FIRST_DROP },
  duetText: { flex: 1, minWidth: 0, paddingTop: 4 },
  duetHey: { fontFamily: "Montserrat-Medium", fontSize: 9.5, letterSpacing: 2.4 },
  duetScript: { fontFamily: "GreatVibes_400Regular", fontSize: 76, lineHeight: 96, marginLeft: -4 },
  duetCapsRow: { marginTop: -30, paddingLeft: 44 },
  duetCaps: { fontFamily: "Montserrat-ExtraBold", fontSize: 21, letterSpacing: 0.5, flexShrink: 1 },
  duetLocated: { fontFamily: "Montserrat-Medium", fontSize: 9.5, letterSpacing: 2.2, marginTop: 10 },
  filmStrip: { width: 112, paddingVertical: 6, paddingLeft: 6, borderTopLeftRadius: 4, borderBottomLeftRadius: 4, gap: 6 },
  filmFrame: { height: 92, overflow: "hidden" },
  duetPills: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 20, marginTop: 16 },
  duetPill: {
    minHeight: 30, justifyContent: "center", paddingHorizontal: 14, paddingVertical: 5, borderRadius: 100,
    borderWidth: 1.5, borderColor: "#1F1A1C", backgroundColor: "#FFFFFF",
    shadowOffset: { width: 3, height: 4 }, shadowOpacity: 1, shadowRadius: 0,
  },
  duetPillText: { fontFamily: "Montserrat-ExtraBold", fontSize: 10, letterSpacing: 1, color: "#1F1A1C" },
  duetMeet: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, marginTop: 24 },
  duetMeetLogo: { marginBottom: -20 },
  duetMeetText: { flex: 1, paddingBottom: 6 },
  duetMeetScript: { fontFamily: "GreatVibes_400Regular", fontSize: 44, lineHeight: 58, paddingLeft: 18 },
  duetMeetCaps: { fontFamily: "Montserrat-ExtraBold", fontSize: 14, letterSpacing: 0.5, marginTop: -18, marginBottom: 6 },
  // Groovy
  groovyWrap: { paddingHorizontal: 20, marginTop: 12, marginBottom: 26 },
  groovyTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  groovyCaption: { fontSize: 11, fontWeight: "800", letterSpacing: 1.6, lineHeight: 16, flexShrink: 1, marginTop: -20 },
  groovyBig: { fontFamily: "Fraunces-SoftBlackItalic", fontSize: 88, lineHeight: 92, letterSpacing: -2, marginTop: -4, flexShrink: 1 },
  groovyRestRow: { paddingLeft: 70, marginTop: -10 },
  groovyRest: {
    fontFamily: "Fraunces-SoftBlackItalic", fontSize: 58, lineHeight: 64, letterSpacing: -1, flexShrink: 1,
    textShadowOffset: { width: 3, height: 3 }, textShadowRadius: 0,
  },
  starburst: {
    position: "absolute", right: 14, top: 104, width: 100, height: 100,
    alignItems: "center", justifyContent: "center", transform: [{ rotate: "12deg" }],
  },
  starburstStar: { fontSize: 12, lineHeight: 14 },
  starburstRating: { fontFamily: "Fraunces-SoftBlackItalic", fontSize: 24, lineHeight: 28 },
  starburstWord: { fontSize: 8.5, fontWeight: "800", letterSpacing: 1 },
  // Gallery
  galleryWrap: { paddingHorizontal: 20, marginTop: TEXT_FIRST_DROP, marginBottom: 26 },
  galleryLabels: { flexDirection: "row", gap: 10, borderTopWidth: 1, paddingTop: 8 },
  galleryLabel: { flex: 1, fontFamily: "DidactGothic-Regular", fontSize: 10, letterSpacing: 1.2, lineHeight: 15 },
  galleryLabelEnd: { textAlign: "right" },
  galleryName: { fontFamily: "InstrumentSerif-Regular", fontSize: 60, lineHeight: 60, letterSpacing: -1.5, marginTop: 22, flexShrink: 1 },
  galleryPhrase: { fontFamily: "InstrumentSerif-Italic", fontSize: 21, marginTop: 6 },
  galleryArt: { alignItems: "center", marginTop: 26 },
  // Apothecary: the label is a cream object, so its ink is fixed.
  labelWrap: { paddingHorizontal: 24, marginTop: 90, marginBottom: 26 },
  labelOval: {
    minHeight: 200, borderRadius: 120, backgroundColor: "#FBFCF8", borderWidth: 1, borderColor: "#2C3527",
    alignItems: "center", justifyContent: "center", paddingVertical: 22, paddingHorizontal: 34,
    shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  labelInner: { position: "absolute", top: 6, left: 6, right: 6, bottom: 6, borderRadius: 114, borderWidth: 1 },
  labelLogo: { marginBottom: -12 },
  labelCaption: { fontSize: 9, letterSpacing: 2.4, color: "#56614F", textAlign: "center", marginTop: 4 },
  labelName: {
    fontFamily: "CormorantGaramond-SemiBold", fontSize: 34, lineHeight: 40, letterSpacing: 6, color: "#2C3527",
    textAlign: "center", flexShrink: 1,
  },
  labelPhrase: { fontFamily: "CormorantGaramond-MediumItalic", fontSize: 17, color: "#56614F" },
  sprig: { marginTop: 4 },
  labelDetails: { alignItems: "center", marginTop: 18 },
});

/** Cover's white pills under the name. */
export function HeroPills({ labels }: { labels: readonly string[] }) {
  return (
    <View style={styles.pillRow}>
      {labels.map(label => (
        <View key={label} style={styles.pill}>
          <Text style={styles.pillText} numberOfLines={1}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", marginBottom: 20, marginTop: 0 },
  wrapper: { position: "relative", width: 148, height: 148 },
  logo: {
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 4,
    borderColor: "rgba(255, 253, 251, 0.9)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 10,
  },
  gloss: { position: "absolute", top: 0, left: 0, width: 148, height: 148, borderRadius: 74 },
  initialsWrap: { alignItems: "center", justifyContent: "center" },
  initials: { color: "#fff", fontSize: 28, fontWeight: "800" },
  arch: { borderRadius: 10, borderTopLeftRadius: 74, borderTopRightRadius: 74 },
  polaroidPhoto: { borderRadius: 0, borderWidth: 0, shadowOpacity: 0, elevation: 0 },
  thinRim: { borderWidth: 2 },
  tilted: { borderWidth: 3, borderColor: "#FFFFFF" },
  matFrame: {
    backgroundColor: "#1F1F1F", padding: 4,
    shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 14, elevation: 8,
  },
  mat: { backgroundColor: "#FBFAF7" },
  polaroid: {
    backgroundColor: "#FFFFFF",
    padding: 8,
    paddingBottom: 30,
    transform: [{ rotate: "-3deg" }],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
  },
  glossRing: { position: "absolute", top: -8, left: -8, width: 164, height: 164, borderRadius: 82 },
  doubleRing: { position: "absolute", top: -11, left: -11, width: 170, height: 170, borderRadius: 85, borderWidth: 1.5 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, paddingHorizontal: 24, marginBottom: 12 },
  // minHeight, not height: the label grows with the chosen text size.
  pill: { minHeight: 28, paddingVertical: 4, paddingHorizontal: 12, borderRadius: 100, backgroundColor: "#FFFFFF", justifyContent: "center", maxWidth: 220 },
  pillText: { fontFamily: "BakbakOne-Regular", fontSize: 10, letterSpacing: 1, color: "#1F1A18" },
});
