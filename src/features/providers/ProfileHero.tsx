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
import Svg, { Circle, Defs, Path, Polygon, Text as SvgText, TextPath } from "react-native-svg";

import { LogoCircle } from "../../components/FramedLogo";
import type { PageStyle } from "../../constants/pageStyles";
import { blend, isDarkColor, withAlpha } from "../../constants/providerThemes";
import type { LogoFraming } from "../../types/database";

/** The business name under the logo; a thin script is drawn larger than
 *  this (see resolveProviderFontScale), and Cover larger still (nameScale). */
export const HERO_NAME_SIZE = 30;
export const HERO_NAME_LINE_HEIGHT = 42;

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
  badge,
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
  /** A small round button on the logo's lower-right edge (the profile's Recommend). */
  badge?: React.ReactNode;
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
            || pageStyle.logo === "accentRing"
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
          {badge ? (
            // Centred on a round logo's edge at 45°, which is 0.146 of the
            // size in from the box's corner; half the badge's width back out.
            <View style={[styles.badge, { right: size * 0.146 - BADGE_HALF, bottom: size * 0.146 - BADGE_HALF }]}>
              {badge}
            </View>
          ) : null}
        </View>
        </View>
      </View>
    </View>
  );
}

/** Half of a HeroLogo badge's width (RecommendBadge is 30pt). */
const BADGE_HALF = 15;

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
      // The name is the cover line, low over the photo, with a small logo
      // sitting on top of it at the right.
      return (
        <View style={layout.coverTop}>
          <View style={layout.coverLogo}>{renderLogo(58)}</View>
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
      // Heritage: their name curved round the top of a dotted seal, the logo
      // in the middle, and what they do with their area under it.
      const curveName = name.toUpperCase();
      const curveSize = Math.max(9, Math.min(17, (290 / Math.max(curveName.length, 1) - 3) / 0.72));
      const phrase = kickerPhrase(kicker);
      return (
        <View style={[layout.infoCenter, layout.sealTop]}>
          <View style={layout.seal} accessible accessibilityRole="header" accessibilityLabel={name}>
            <SealRing
              name={curveName}
              font="Cinzel-Bold"
              size={curveSize}
              text={heroText}
              ring={heroIsDark ? withAlpha(heroText, 0.8) : accent}
            />
            <View style={layout.sealLogo}>{renderLogo(128)}</View>
          </View>
          {tick}
          {phrase ? <Text style={[layout.sealPhrase, { color: heroText }, shadow]}>{phrase}</Text> : null}
          {location ? (
            <Text style={[layout.sealLocated, { color: heroSub }, shadow]} numberOfLines={2}>
              {location.toUpperCase()}
            </Text>
          ) : null}
          {details}
        </View>
      );
    }

    case "duet": {
      // Duet: a white welcome card on a soft accent shadow, the logo beside
      // the name, then what they do as filled pills.
      const [script, caps] = splitFirst(name);
      const cardAccent = isDarkColor(accent) ? accent : blend(accent, "#000000", 0.35);
      const pillInk = isDarkColor(accent) ? "#FFFFFF" : "#1F1A1C";
      const pills = kicker.split("·").map(part => part.trim()).filter(Boolean);
      return (
        <View style={layout.duetWrap}>
          <View>
            <View style={[layout.duetCardShadow, { backgroundColor: blend(accent, "#FFFFFF", 0.45) }]} pointerEvents="none" />
            <View style={layout.duetCard}>
              <View style={layout.duetCardRow}>
              <View style={layout.logoNoGap}>{renderLogo(92)}</View>
              <View style={layout.duetCardText} accessible accessibilityRole="header" accessibilityLabel={name}>
                <Text style={layout.duetHey}>HEY GORGEOUS, WELCOME TO</Text>
                <Text style={[layout.duetScript, { color: cardAccent }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
                  {script}
                </Text>
                {caps ? (
                  <Text style={layout.duetCaps} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
                    {caps.toUpperCase()}
                  </Text>
                ) : null}
                {/* The stars sit on the location's line (owner, 2026-11-15),
                    so the line under the card holds only what they do and
                    their years. The profile leaves its own stars out here. */}
                {location || rating ? (
                  <View style={layout.duetLocRow}>
                    {location ? <Text style={layout.duetLocated} numberOfLines={2}>{location.toUpperCase()}</Text> : null}
                    {rating ? (
                      <View style={layout.duetStars} accessible accessibilityLabel={`Rated ${rating}`}>
                        {[1, 2, 3, 4, 5].map(star => (
                          <Ionicons key={star} name="star" size={10} color="#FFD700" />
                        ))}
                        <Text style={layout.duetRating}>{rating}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {tick}
              </View>
              </View>
              {/* What they do, the stars and their years share one line in
                  the card, the slots pill with Instagram under it (owner,
                  2026-11-15: the card was too long with each on a line of its
                  own). The profile puts the slots pill on a line of its own
                  and draws these in DETAILS_ON_CARD_INK, as the card is white. */}
              <View style={layout.duetInfoRow}>
                {pills.map(label => (
                  <View key={label} style={[layout.duetPill, { backgroundColor: accent }]}>
                    <Text style={[layout.duetPillText, { color: pillInk }]} numberOfLines={1}>{label}</Text>
                  </View>
                ))}
                {details}
              </View>
            </View>
          </View>
        </View>
      );
    }

    case "groovy": {
      // Groovy: a sticker sheet. The logo as a round sticker, their rating as a
      // starburst, the name on a tilted pill with a hard shadow, and tag stickers.
      const badgeInk = isDarkColor(accent) ? "#FFFFFF" : "#1E2A4A";
      return (
        <View style={layout.groovyWrap}>
          <View style={layout.groovyTopRow}>
            <View style={layout.groovyLogo}>{renderLogo(100)}</View>
            {rating ? <Starburst rating={rating} fill={heroText} ink={heroIsDark ? "#1F1A18" : "#FFFFFF"} /> : null}
          </View>
          <View style={layout.groovyBadgeWrap} accessible accessibilityRole="header" accessibilityLabel={name}>
            <View style={[layout.groovyBadgeShadow, { backgroundColor: heroText }]} pointerEvents="none" />
            <View style={[layout.groovyBadge, { backgroundColor: accent, borderColor: heroText }]}>
              <Text
                style={[
                  layout.groovyBadgeName,
                  { color: badgeInk },
                ]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
              >
                {name.toLowerCase()}
              </Text>
              {tick}
            </View>
          </View>
          <View style={layout.groovyTags}>
            {location ? (
              <View style={[layout.groovyTag, layout.groovyTagLeft, { backgroundColor: blend(accent, "#FFFFFF", 0.6), borderColor: heroText }]}>
                <Text style={layout.groovyTagText} numberOfLines={2}>{location.toUpperCase()}</Text>
              </View>
            ) : null}
            {kicker ? (
              <View style={[layout.groovyTag, layout.groovyTagRight, { borderColor: heroText }]}>
                <Text style={layout.groovyTagText} numberOfLines={2}>{kicker}</Text>
              </View>
            ) : null}
          </View>
          <View style={layout.infoCenter}>{details}</View>
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
            <Text
              style={[
                layout.galleryName,
                { color: heroText },
                shadow,
              ]} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.6}>
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
      // Apothecary: a paper tag hanging on a string over their photo.
      const phrase = kickerPhrase(kicker).toLowerCase();
      return (
        <View style={layout.tagWrap}>
          <Svg width={240} height={64} viewBox="0 0 240 64" pointerEvents="none">
            <Path
              d="M60 0C80 28 108 46 116 64M180 0C160 28 132 46 124 64"
              fill="none"
              stroke={heroIsDark ? "#D9CBA6" : "#8C7A55"}
              strokeWidth={1.5}
            />
          </Svg>
          <View style={layout.tag}>
            <Svg width={240} height={30} viewBox="0 0 240 30" pointerEvents="none">
              <Polygon points="48,0 192,0 240,30 0,30" fill={TAG_PAPER} />
              <Circle cx={120} cy={16} r={6} fill="none" stroke="#B9A57A" strokeWidth={2} />
            </Svg>
            <View style={layout.tagBody}>
              <View style={layout.logoNoGap}>{renderLogo(64)}</View>
              <View style={layout.tickRow} accessible accessibilityRole="header" accessibilityLabel={name}>
                <Text
                  style={[
                    layout.tagName,
                  ]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {name.toUpperCase()}
                </Text>
                {tick}
              </View>
              <View style={[layout.tagRule, { backgroundColor: accent }]} />
              {phrase ? <Text style={layout.tagPhrase}>{phrase}</Text> : null}
              {location ? <Text style={layout.tagCaption} numberOfLines={1}>{location.toUpperCase()}</Text> : null}
            </View>
          </View>
          <View style={layout.labelDetails}>{details}</View>
        </View>
      );
    }

    case "blockName": {
      // Snapshot: three of their photos edge to edge, then the name huge in
      // condensed caps on a block of the accent, the logo beside it, then the
      // area and what they do as square tags.
      const blockInk = isDarkColor(accent) ? "#FFFFFF" : "#111111";
      const tags = kicker.split("·").map(part => part.trim()).filter(Boolean);
      return (
        <View style={layout.blockWrap}>
          <View style={layout.blockPhotos}>
            {(["left", "middle", "right"] as const).map((slot, i) => (
              <View key={slot} style={[layout.blockPhoto, { backgroundColor: blend(accent, "#FFFFFF", i === 1 ? 0.4 : 0.6) }]}>
                {photoUris?.[i] ? (
                  <Image source={{ uri: photoUris[i] }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
                ) : null}
              </View>
            ))}
          </View>
          <View style={[layout.blockBox, { backgroundColor: accent }]}>
            <View style={layout.blockNameCol} accessible accessibilityRole="header" accessibilityLabel={name}>
              <Text style={[layout.blockName, { color: blockInk }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.5}>
                {name.toUpperCase()}
              </Text>
              {tick}
            </View>
            <View style={layout.logoNoGap}>{renderLogo(72)}</View>
          </View>
          <View style={layout.blockInfo}>
            {location ? <Text style={[layout.blockArea, { color: heroText }, shadow]} numberOfLines={1}>{location.toUpperCase()}</Text> : null}
            {tags.length ? (
              <View style={layout.blockTags}>
                {tags.map(label => (
                  <View key={label} style={[layout.blockTag, { borderColor: heroText }]}>
                    <Text style={[layout.blockTagText, { color: heroText }]} numberOfLines={1}>{label}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={layout.leftDetails}>{details}</View>
          </View>
        </View>
      );
    }

    case "signed": {
      // Signature: a big logo in an accent ring, the whole name signed across
      // its foot in a pen signature, the words round it in Gloock. Every line
      // is in full ink: the pale accent and the faded sub colour read too faint
      // under a fine pen script (owner, 2026-11-15).
      const pen = heroIsDark ? "#FFFFFF" : blend(accent, "#000000", 0.5);
      return (
        <View style={[layout.infoCenter, layout.textFirst]}>
          <Text style={[layout.signedWelcome, { color: heroText }, shadow]}>WELCOME TO</Text>
          <View style={layout.signedLogo}>{renderLogo(148)}</View>
          <View style={layout.signedNameRow} accessible accessibilityRole="header" accessibilityLabel={name}>
            <Text
              style={[layout.signedName, { color: pen }, heroIsDark ? shadow : { textShadowColor: pen, textShadowRadius: 1 }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.45}
            >
              {name}
            </Text>
            {tick}
          </View>
          {location ? <Text style={[layout.signedLocated, { color: heroText }, shadow]} numberOfLines={2}>{location.toUpperCase()}</Text> : null}
          {kicker ? <Text style={[layout.signedKicker, { color: heroText }, shadow]} numberOfLines={2}>{kicker}</Text> : null}
          <View style={layout.signedDetails}>{details}</View>
        </View>
      );
    }

    case "quietBand": {
      // Quiet: their photo left clear, then a pale band across it with the
      // name and a ringed logo. The band is paper, so its ink is fixed.
      const phrase = kickerPhrase(kicker);
      return (
        <View style={layout.quietWrap}>
          {location ? <Text style={[layout.quietArea, { color: heroText }, shadow]} numberOfLines={1}>{location.toUpperCase()}</Text> : null}
          <View style={layout.quietBand}>
            <View style={layout.quietRow}>
              <View style={layout.quietText} accessible accessibilityRole="header" accessibilityLabel={name}>
                <View style={layout.tickRow}>
                  <Text style={layout.quietName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>{name.toUpperCase()}</Text>
                  {tick}
                </View>
                {phrase ? <Text style={layout.quietPhrase}>{phrase}</Text> : null}
              </View>
              <View style={[layout.quietRing, { borderColor: accent }]}>
                <View style={layout.logoNoGap}>{renderLogo(72)}</View>
              </View>
            </View>
            {kicker ? (
              <>
                <View style={layout.quietRule} />
                <Text style={layout.quietKicker}>{kicker.split(" · ").join(" ✦ ")}</Text>
              </>
            ) : null}
          </View>
          <View style={layout.quietDetails}>{details}</View>
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

/** Heritage's seal: their name round the top, a star at the foot, a dotted ring. */
function SealRing({
  name, font, size, text, ring,
}: { name: string; font: string; size: number; text: string; ring: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <Svg width={250} height={250} viewBox="0 0 220 220" style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Path id={`sealTop${id}`} d="M14 110A96 96 0 0 1 206 110" fill="none" />
      </Defs>
      <SvgText fill={text} fontSize={size} letterSpacing={3} fontFamily={font}>
        <TextPath href={`#sealTop${id}`} startOffset="50%" textAnchor="middle">{name}</TextPath>
      </SvgText>
      <SvgText x={110} y={205} fill={text} fontSize={11} textAnchor="middle">✦</SvgText>
      <Circle cx={110} cy={110} r={74} fill="none" stroke={ring} strokeWidth={3.5} strokeDasharray="0.1 7" strokeLinecap="round" />
    </Svg>
  );
}

/**
 * Whether this style draws the stars, years and slots pill on a white card
 * (Duet) rather than straight on the hero, so the profile inks them dark.
 */
export function detailsSitOnCard(pageStyle: PageStyle): boolean {
  return pageStyle.hero === "duet";
}

/** The ink for details on that card. */
/** On that card the slots pill takes a line of its own under the pills and years. */
export const DETAILS_OWN_LINE = { width: "100%", alignItems: "center" } as const;

export const DETAILS_ON_CARD_INK = { text: "#1F1A1C", sub: "#6A5A60" } as const;

/** Apothecary's tag paper and ink: the tag is a physical object, so its colours are fixed. */
const TAG_PAPER = "#F6F1E4";

/** How much lower a hero that opens on text starts than one that opens on the logo. */
const TEXT_FIRST_DROP = 48;

const layout = StyleSheet.create({
  shadow: { textShadowColor: "rgba(0,0,0,0.55)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  infoCenter: { alignItems: "center", marginBottom: 30, paddingHorizontal: 20 },
  infoCenterTight: { alignItems: "center", paddingHorizontal: 20 },
  coverTop: { paddingTop: 64 },
  // HeroLogo keeps 20pt under itself; pull the name back up under the logo.
  coverLogo: { alignSelf: "flex-end", marginRight: 28, marginBottom: -14 },
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
  meet: { fontFamily: "PinyonScript_400Regular", fontSize: 34, lineHeight: 50 },
  meetName: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 26, lineHeight: 34, marginBottom: 6 },
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
  edLight: { fontFamily: "LeagueSpartan-Light", fontSize: 50, lineHeight: 64, letterSpacing: -1 },
  edBold: { fontFamily: "LeagueSpartan-ExtraBold", fontSize: 44, lineHeight: 57, letterSpacing: -1.2, flexShrink: 1 },
  edCards: { width: 132, height: 146 },
  edBack: {
    position: "absolute", left: 0, top: 14, width: 84, height: 118, borderRadius: 12, overflow: "hidden",
    transform: [{ rotate: "-5deg" }],
  },
  edFront: { position: "absolute", right: 0, top: 4, transform: [{ rotate: "5deg" }] },
  edRule: { flexDirection: "row", justifyContent: "space-between", gap: 12, borderTopWidth: 1.5, paddingTop: 10 },
  edKicker: { fontFamily: "LeagueSpartan-ExtraBold", fontSize: 11, letterSpacing: 1.6, flexShrink: 1 },
  edLocation: { fontFamily: "LeagueSpartan-Light", fontSize: 12, flexShrink: 1, textAlign: "right" },
  logoNoGap: { marginBottom: -20 },
  // Heritage
  sealTop: { marginTop: 24 },
  seal: { width: 250, height: 250 },
  sealLogo: { position: "absolute", top: 61, left: 61 },
  sealPhrase: { fontFamily: "LibreBaskerville-Italic", fontSize: 18, marginTop: 6 },
  sealLocated: { fontFamily: "Cinzel-Medium", fontSize: 11, letterSpacing: 3, marginTop: 6, marginBottom: 10, textAlign: "center" },
  // Duet
  duetWrap: { paddingHorizontal: 22, marginTop: TEXT_FIRST_DROP + 24, marginBottom: 26 },
  duetCardShadow: { position: "absolute", top: 8, left: 7, right: -7, bottom: -8, borderRadius: 28 },
  duetCard: {
    backgroundColor: "#FFFFFF", borderWidth: 1.5,
    borderColor: "#1F1A1C", borderRadius: 28, paddingVertical: 20, paddingHorizontal: 16,
  },
  // A wider gap than the other rows: the accent ring stands out round the
  // logo, and the script's first letter swings left into that space.
  duetCardRow: { flexDirection: "row", alignItems: "center", gap: 20 },
  duetCardText: { flex: 1, minWidth: 0 },
  duetHey: { fontFamily: "Montserrat-Medium", fontSize: 8.5, letterSpacing: 2, color: "#6A5A60" },
  // paddingLeft: Ms Madi's capitals start left of the text box, and RN clips
  // whatever falls outside it, so the first letter looked cut by the logo.
  duetScript: { fontFamily: "MsMadi-Regular", fontSize: 60, lineHeight: 87, marginBottom: -20, paddingLeft: 10 },
  duetCaps: { fontFamily: "Montserrat-ExtraBold", fontSize: 15, letterSpacing: 4, color: "#1F1A1C", paddingLeft: 28 },
  duetLocRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4, marginTop: 8 },
  duetLocated: { fontFamily: "Montserrat-Medium", fontSize: 8.5, letterSpacing: 2, color: "#6A5A60", flexShrink: 1 },
  duetStars: { flexDirection: "row", alignItems: "center", gap: 2 },
  duetRating: { fontFamily: "Montserrat-ExtraBold", fontSize: 10, color: "#1F1A1C", marginLeft: 3 },
  duetInfoRow: {
    flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center",
    columnGap: 10, rowGap: 12, marginTop: 18,
  },
  duetPill: { minHeight: 30, justifyContent: "center", paddingHorizontal: 14, paddingVertical: 5, borderRadius: 100 },
  duetPillText: { fontFamily: "Montserrat-ExtraBold", fontSize: 10, letterSpacing: 1 },
  // Groovy
  groovyWrap: { paddingHorizontal: 22, marginTop: TEXT_FIRST_DROP, marginBottom: 6 },
  groovyTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 12 },
  groovyLogo: { transform: [{ rotate: "-8deg" }], marginBottom: -20, zIndex: 2 },
  groovyBadgeWrap: { marginTop: -6, transform: [{ rotate: "-4deg" }] },
  groovyBadgeShadow: { position: "absolute", top: 7, left: 6, right: -6, bottom: -7, borderRadius: 100 },
  groovyBadge: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 2.5, borderRadius: 100,
    paddingVertical: 14, paddingHorizontal: 18,
  },
  groovyBadgeName: { fontFamily: "Fraunces-SoftBlackItalic", fontSize: 50, lineHeight: 64, letterSpacing: -1.5, textAlign: "center", flexShrink: 1 },
  groovyTags: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 14, marginTop: 22, marginBottom: 18 },
  // As wide as the row allows, and two lines if it needs them: a 200pt cap
  // cut "KENSINGTON AND CHELSEA" off.
  groovyTag: { borderWidth: 2, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: "#FFFDF6", maxWidth: "100%" },
  groovyTagLeft: { transform: [{ rotate: "5deg" }] },
  groovyTagRight: { transform: [{ rotate: "-6deg" }] },
  groovyTagText: { fontSize: 11, fontWeight: "800", letterSpacing: 1.4, color: "#1E2A4A", textAlign: "center" },
  starburst: { width: 96, height: 96, alignItems: "center", justifyContent: "center", transform: [{ rotate: "14deg" }] },
  starburstStar: { fontSize: 12, lineHeight: 14 },
  starburstRating: { fontFamily: "Fraunces-SoftBlackItalic", fontSize: 22, lineHeight: 29 },
  starburstWord: { fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  // Gallery
  galleryWrap: { paddingHorizontal: 20, marginTop: TEXT_FIRST_DROP, marginBottom: 26 },
  galleryLabels: { flexDirection: "row", gap: 10, borderTopWidth: 1, paddingTop: 8 },
  galleryLabel: { flex: 1, fontFamily: "DidactGothic-Regular", fontSize: 10, letterSpacing: 1.2, lineHeight: 15 },
  galleryLabelEnd: { textAlign: "right" },
  galleryName: { fontFamily: "InstrumentSerif-Regular", fontSize: 60, lineHeight: 77, letterSpacing: -1.5, marginTop: 22, flexShrink: 1 },
  galleryPhrase: { fontFamily: "InstrumentSerif-Italic", fontSize: 21, marginTop: 6 },
  galleryArt: { alignItems: "center", marginTop: 26 },
  // Apothecary: the tag is a physical object, so its ink is fixed.
  tagWrap: { alignItems: "center", marginTop: 20, marginBottom: 26 },
  tag: {
    width: 240, marginTop: -2, transform: [{ rotate: "-4deg" }], transformOrigin: "top",
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 10 },
  },
  tagBody: { backgroundColor: TAG_PAPER, alignItems: "center", paddingHorizontal: 20, paddingTop: 6, paddingBottom: 24, marginTop: -1 },
  tagName: {
    fontFamily: "MarcellusSC-Regular", fontSize: 32, lineHeight: 41, letterSpacing: 6, color: "#2C3527",
    textAlign: "center", flexShrink: 1, marginTop: 10,
  },
  tagRule: { height: 1, alignSelf: "stretch", marginHorizontal: 30, marginVertical: 8 },
  tagPhrase: { fontFamily: "Marcellus-Regular", fontSize: 15, color: "#56614F", textAlign: "center" },
  tagCaption: { fontSize: 9, letterSpacing: 2.4, color: "#56614F", marginTop: 8 },
  labelDetails: { alignItems: "center", marginTop: 22 },
  // Snapshot
  blockWrap: { marginBottom: 26 },
  blockPhotos: { flexDirection: "row" },
  blockPhoto: { flex: 1, height: 220, overflow: "hidden" },
  blockBox: {
    flexDirection: "row", alignItems: "center", gap: 12, marginTop: -58, marginRight: 40,
    paddingLeft: 20, paddingRight: 14, paddingVertical: 16,
  },
  blockNameCol: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 },
  blockName: { fontFamily: "Anton-Regular", fontSize: 54, lineHeight: 70, letterSpacing: 0.5, flexShrink: 1 },
  blockInfo: { paddingHorizontal: 20, marginTop: 16 },
  blockArea: { fontSize: 11, fontWeight: "800", letterSpacing: 1.6 },
  blockTags: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  blockTag: { borderWidth: 2, paddingHorizontal: 10, paddingVertical: 5 },
  blockTagText: { fontSize: 10.5, fontWeight: "800", letterSpacing: 1.2 },
  // Signature
  signedWelcome: { fontFamily: "Gloock-Regular", fontSize: 13, letterSpacing: 4, marginBottom: 14 },
  signedLogo: { marginBottom: -20 },
  signedNameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: -50, alignSelf: "stretch", justifyContent: "center" },
  signedName: { fontFamily: "MrsSaintDelafield-Regular", fontSize: 82, lineHeight: 120, flexShrink: 1, textAlign: "center" },
  signedLocated: { fontFamily: "Gloock-Regular", fontSize: 14, letterSpacing: 3, marginTop: 2, textAlign: "center" },
  signedKicker: { fontFamily: "Gloock-Regular", fontSize: 12.5, letterSpacing: 2, marginTop: 6, textAlign: "center" },
  signedDetails: { alignItems: "center", marginTop: 14 },
  // Quiet: the band is paper, so its ink is fixed.
  quietWrap: { marginTop: TEXT_FIRST_DROP, marginBottom: 26 },
  quietArea: { fontSize: 10, letterSpacing: 3, paddingHorizontal: 24 },
  quietBand: { backgroundColor: "#FBFCF8", marginTop: 170, paddingHorizontal: 24, paddingVertical: 22 },
  quietRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  quietText: { flex: 1, minWidth: 0 },
  // Josefin Sans, so Quiet no longer shares Apothecary's Marcellus.
  quietName: { fontFamily: "JosefinSans_600SemiBold", fontSize: 36, lineHeight: 47, letterSpacing: 6, color: "#2C3527", flexShrink: 1 },
  quietPhrase: { fontFamily: "JosefinSans_400Regular", fontSize: 16, lineHeight: 22, color: "#56614F", marginTop: 4 },
  quietRing: { width: 84, height: 84, borderRadius: 42, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  quietRule: { height: StyleSheet.hairlineWidth * 2, backgroundColor: "#BFCAB6", marginTop: 16, marginBottom: 12 },
  quietKicker: { fontSize: 9.5, letterSpacing: 2.2, color: "#2C3527" },
  quietDetails: { alignItems: "center", marginTop: 18 },
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
  badge: { position: "absolute" },
  initialsWrap: { alignItems: "center", justifyContent: "center" },
  initials: { color: "#fff", fontSize: 28, fontWeight: "800" },
  arch: { borderRadius: 10, borderTopLeftRadius: 74, borderTopRightRadius: 74 },
  polaroidPhoto: { borderRadius: 0, borderWidth: 0, shadowOpacity: 0, elevation: 0 },
  thinRim: { borderWidth: 2 },
  tilted: { borderWidth: 3, borderColor: "#FFFFFF" },
  squareLogo: { borderRadius: 4, borderWidth: 3, shadowOpacity: 0, elevation: 0 },
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
