// src/features/providers/PolicyPages.tsx
//
// A provider's uploaded policy pictures as part of their profile, not behind
// a button (owner's picks on the 2026-11-13 canvas,
// https://claude.ai/artifact/Q3iiDvPo8zuXkbPBHYtqW3):
//
//   - PolicyPagesInline: the pages running edge to edge down the profile,
//     either melting into the page around them (B) or on a wavy band of
//     their own colour (A) — Branding → Policy Pictures.
//   - PolicyStoryRings + PolicyStoryViewer: one story-style circle near the
//     top of the profile that opens the pages full screen, one at a time (D).
//   - PolicyPagesCompact: the subtle choices — a small row of page
//     thumbnails, or just a "Read my policy" button — after the services.
//   - PolicyPagesShowcase: more designs after the services — framed prints,
//     a swipe-through, a fanned stack, or a peek at the top page.
//
// Which one shows is the provider's pick (pageStyles.policyPicturePlacement).
//
// Both lean on each page's edge colours (policyImages.ts): saved at upload,
// or worked out on this phone for pages uploaded before that.

import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import type { PolicyPictureLook } from "../../constants/pageStyles";
import { blend } from "../../constants/providerThemes";
import { edgeColoursFromPhoto } from "../provider-registration/photoColours";
import type { PolicyImageEdge } from "./policyImages";
import {
  onAccentInk,
  PageSectionHeading,
  sheetInk,
  WaveEdge,
  type PageStylePalette,
} from "./ProfilePageStyle";
import { tr } from '../../i18n';
import { useTranslation } from '../../i18n';

// ── Edge colours ─────────────────────────────────────────────────────────────

/** Worked-out edge colours for pages with none saved, shared across every
 *  profile opened this session so each page is read at most once. */
const computedEdges = new Map<string, Promise<PolicyImageEdge | null>>();

/**
 * Every page's edge colours: the saved ones, plus — for pages uploaded before
 * those were saved — colours read from the page on this phone. Until a page's
 * colours arrive it has none, and the views fall back to the page colour.
 */
export function usePolicyEdgeColours(
  urls: readonly string[],
  saved: Record<string, PolicyImageEdge>,
): Record<string, PolicyImageEdge> {
  const [read, setRead] = useState<Record<string, PolicyImageEdge>>({});
  const missing = urls.filter(url => !saved[url]).join("\n");

  useEffect(() => {
    if (!missing) return;
    let active = true;
    for (const url of missing.split("\n")) {
      let pending = computedEdges.get(url);
      if (!pending) {
        pending = edgeColoursFromPhoto(url).catch(() => null);
        computedEdges.set(url, pending);
      }
      void pending.then(edge => {
        if (active && edge) setRead(prev => (prev[url] ? prev : { ...prev, [url]: edge }));
      });
    }
    return () => {
      active = false;
    };
  }, [missing]);

  return useMemo(() => ({ ...read, ...saved }), [read, saved]);
}

// ── In the page ──────────────────────────────────────────────────────────────

/** One page at the screen's full width and as tall as the picture really is. */
function InlinePage({
  uri,
  width,
  placeholder,
  label,
  onPress,
}: {
  uri: string;
  width: number;
  placeholder: string;
  label: string;
  onPress: () => void;
}) {
  const [ratio, setRatio] = useState<number | null>(null);
  return (
    <TouchableOpacity activeOpacity={0.94} onPress={onPress} accessibilityRole="imagebutton" accessibilityLabel={label}>
      <Image
        source={{ uri }}
        style={{ width, height: ratio ? width / ratio : width * 1.3, backgroundColor: placeholder }}
        contentFit="cover"
        transition={0}
        onLoad={event => {
          const { width: w, height: h } = event.source;
          if (w > 0 && h > 0) setRatio(w / h);
        }}
      />
    </TouchableOpacity>
  );
}

/**
 * The policy pages down the profile, edge to edge. `look` decides how they
 * meet the page: Melt in fades from the page colour into each page's own
 * edge colour (and from one page into the next); Bleed sits them on a band
 * of their own colour with wavy ends. Tapping a page opens the zoomable
 * viewer. Bleeds out of the content sheet's 20pt side padding.
 */
export function PolicyPagesInline({
  urls,
  edges,
  look,
  palette,
  onOpen,
}: {
  urls: readonly string[];
  edges: Record<string, PolicyImageEdge>;
  look: PolicyPictureLook;
  palette: PageStylePalette;
  onOpen: () => void;
}) {
  const { width } = useWindowDimensions();
  const sheet = palette.background;
  const ink = sheetInk(sheet);
  if (urls.length === 0) return null;

  const top = (url: string) => edges[url]?.top ?? sheet;
  const bottom = (url: string) => edges[url]?.bottom ?? sheet;
  const first = urls[0]!;
  const last = urls[urls.length - 1]!;
  const label = (index: number) =>
    urls.length > 1 ? `Policy page ${index + 1} of ${urls.length}. Tap to read it up close` : "Policy page. Tap to read it up close";

  const pages = urls.map((url, index) => (
    <React.Fragment key={url}>
      <InlinePage uri={url} width={width} placeholder={top(url)} label={label(index)} onPress={onOpen} />
      {look === "melt" && index < urls.length - 1 ? (
        <LinearGradient colors={[bottom(url), top(urls[index + 1]!)]} style={styles.between} />
      ) : null}
    </React.Fragment>
  ));

  return (
    <View style={styles.inlineWrap}>
      <View style={styles.inlineHeading}>
        <PageSectionHeading section="policyPages" palette={palette} />
      </View>
      {look === "melt" ? (
        <LinearGradient colors={[sheet, top(first)]} style={styles.meltEnd} />
      ) : (
        <WaveEdge color={top(first)} position="top" width={width} />
      )}
      <View style={look === "bleed" ? styles.bleedJoin : undefined}>{pages}</View>
      {look === "melt" ? (
        <LinearGradient colors={[bottom(last), sheet]} style={styles.meltEnd} />
      ) : (
        <WaveEdge color={bottom(last)} position="bottom" width={width} />
      )}
      <TouchableOpacity
        style={[styles.readCloser, { borderColor: ink.border }]}
        onPress={onOpen}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Read the policy up close"
      >
        <Ionicons name="expand-outline" size={16} color={ink.text} />
        <Text style={[styles.readCloserText, { color: ink.text }]}>Tap to read up close</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Thumbnails and the button ────────────────────────────────────────────────

/**
 * The subtle choices, after the services under the same heading as the full
 * pages: a row of small page thumbnails (a tap opens that page full screen),
 * or a single "Read my policy" button that opens the pages to read.
 */
export function PolicyPagesCompact({
  urls,
  look,
  palette,
  onOpenPage,
  onOpenAll,
}: {
  urls: readonly string[];
  look: "thumbs" | "button";
  palette: PageStylePalette;
  /** Opens one page full screen, like a story (thumbnails). */
  onOpenPage: (index: number) => void;
  /** Opens every page in the zoomable reader (the button). */
  onOpenAll: () => void;
}) {
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
  if (urls.length === 0) return null;
  const ink = sheetInk(palette.background);
  const pageCount = urls.length === 1 ? "1 page" : `${urls.length} pages`;
  return (
    <View style={styles.compactWrap}>
      <PageSectionHeading section="policyPages" palette={palette} />
      {look === "thumbs" ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow} style={styles.thumbScroll}>
          {urls.map((url, index) => (
            <TouchableOpacity
              key={url}
              style={styles.thumbItem}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onOpenPage(index);
              }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={urls.length === 1 ? "Open their policy" : `Open policy page ${index + 1} of ${urls.length}`}
            >
              <View style={[styles.thumb, { borderColor: ink.border }]}>
                <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" transition={0} />
              </View>
              <Text style={[styles.thumbLabel, { color: ink.sub }]} numberOfLines={1}>
                {urls.length === 1 ? tr('discover.profile.tab.policy') : `Page ${index + 1}`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <TouchableOpacity
          style={[styles.readButton, { borderColor: ink.border }]}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onOpenAll();
          }}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Read my policy, ${pageCount}`}
        >
          <Ionicons name="document-text-outline" size={18} color={ink.text} />
          <Text style={[styles.readButtonText, { color: ink.text }]}>Read my policy</Text>
          <Text style={[styles.readButtonCount, { color: ink.sub }]}>{pageCount}</Text>
          <Ionicons name="chevron-forward" size={16} color={ink.sub} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Framed, Swipe, Fanned, Peek ──────────────────────────────────────────────

/** A page at its own shape: the width given, the height from the picture. */
function SizedPage({ uri, width, background }: { uri: string; width: number; background: string }) {
  const [ratio, setRatio] = useState<number | null>(null);
  return (
    <Image
      source={{ uri }}
      style={{ width, height: ratio ? width / ratio : width * 1.3, backgroundColor: background }}
      contentFit="cover"
      transition={0}
      onLoad={event => {
        const { width: w, height: h } = event.source;
        if (w > 0 && h > 0) setRatio(w / h);
      }}
    />
  );
}

/**
 * More ways to set the pages in the page, after the services:
 *   - framed: each page as a print in a card-coloured mount with a soft shadow
 *   - swipe: full width, one page at a time, with dots
 *   - fan: up to three pages fanned like cards, the first on top
 *   - peek: the top of the first page fading into the page, then a button
 */
export function PolicyPagesShowcase({
  urls,
  edges,
  look,
  palette,
  onOpenPage,
  onOpenAll,
}: {
  urls: readonly string[];
  edges: Record<string, PolicyImageEdge>;
  look: "framed" | "swipe" | "fan" | "peek";
  palette: PageStylePalette;
  onOpenPage: (index: number) => void;
  onOpenAll: () => void;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const [current, setCurrent] = useState(0);
  if (urls.length === 0) return null;
  // The content sheet keeps 20pt each side.
  const width = screenWidth - 40;
  const ink = sheetInk(palette.background);
  const edgeOf = (url: string) => edges[url]?.top ?? palette.cardBackground;
  const pageLabel = (index: number) =>
    urls.length > 1 ? `Policy page ${index + 1} of ${urls.length}. Tap to read it up close` : "Policy page. Tap to read it up close";
  const readMore = (
    <TouchableOpacity
      style={[styles.readCloser, { borderColor: ink.border }]}
      onPress={onOpenAll}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="Read the full policy"
    >
      <Ionicons name="document-text-outline" size={16} color={ink.text} />
      <Text style={[styles.readCloserText, { color: ink.text }]}>Read the full policy</Text>
    </TouchableOpacity>
  );

  let body: React.ReactNode;
  if (look === "framed") {
    body = (
      <View style={styles.framedList}>
        {urls.map((url, index) => (
          <TouchableOpacity
            key={url}
            activeOpacity={0.94}
            onPress={onOpenAll}
            accessibilityRole="imagebutton"
            accessibilityLabel={pageLabel(index)}
            style={[styles.frame, { backgroundColor: palette.cardBackground }]}
          >
            <SizedPage uri={url} width={width - 24} background={edgeOf(url)} />
          </TouchableOpacity>
        ))}
      </View>
    );
  } else if (look === "swipe") {
    body = (
      <>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={[styles.swipe, { width }]}
          onMomentumScrollEnd={event => setCurrent(Math.round(event.nativeEvent.contentOffset.x / width))}
        >
          {urls.map((url, index) => (
            <TouchableOpacity
              key={url}
              activeOpacity={0.94}
              onPress={() => onOpenPage(index)}
              accessibilityRole="imagebutton"
              accessibilityLabel={pageLabel(index)}
            >
              <Image
                source={{ uri: url }}
                style={{ width, height: width * 1.3, backgroundColor: edgeOf(url) }}
                contentFit="contain"
                transition={0}
              />
            </TouchableOpacity>
          ))}
        </ScrollView>
        {urls.length > 1 ? (
          <View style={styles.dots} accessible accessibilityLabel={`Page ${current + 1} of ${urls.length}`}>
            {urls.map((url, index) => (
              <View key={url} style={[styles.dot, { backgroundColor: ink.text, opacity: index === current ? 1 : 0.25 }]} />
            ))}
          </View>
        ) : null}
      </>
    );
  } else if (look === "fan") {
    const fanned = urls.slice(0, 3);
    // The first page on top, the others tilted out behind it.
    const tilts = fanned.length === 1 ? [0] : fanned.length === 2 ? [-5, 6] : [-9, 0, 9];
    const order = fanned.map((_, i) => i).reverse();
    body = (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => onOpenPage(0)}
        accessibilityRole="button"
        accessibilityLabel={urls.length > 1 ? `Open their policy, ${urls.length} pages` : "Open their policy"}
        style={styles.fan}
      >
        {order.map(i => {
          const tilt = tilts[i] ?? 0;
          return (
            <View
              key={fanned[i]}
              style={[
                styles.fanCard,
                {
                  backgroundColor: edgeOf(fanned[i]!),
                  transform: [{ translateX: tilt * 5 }, { rotate: `${tilt}deg` }],
                },
              ]}
            >
              <Image source={{ uri: fanned[i]! }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" transition={0} />
            </View>
          );
        })}
        <Text style={[styles.fanCaption, { color: ink.sub }]}>
          {urls.length > 1 ? `${urls.length} pages · Tap to read` : "Tap to read"}
        </Text>
      </TouchableOpacity>
    );
  } else {
    // peek
    const first = urls[0]!;
    body = (
      <>
        <TouchableOpacity
          activeOpacity={0.94}
          onPress={onOpenAll}
          accessibilityRole="imagebutton"
          accessibilityLabel="The top of their policy. Tap to read it all"
          style={[styles.peek, { width }]}
        >
          <SizedPage uri={first} width={width} background={edgeOf(first)} />
          <LinearGradient
            colors={[withAlphaHex(palette.background, 0), palette.background]}
            style={styles.peekFade}
            pointerEvents="none"
          />
        </TouchableOpacity>
        {readMore}
      </>
    );
  }

  return (
    <View style={styles.compactWrap}>
      <PageSectionHeading section="policyPages" palette={palette} />
      {body}
      {look === "framed" || look === "swipe" ? readMore : null}
    </View>
  );
}

/** A #RRGGBB colour at an opacity, so a fade ends in the page's own colour
 *  rather than through grey (a plain "transparent" fades through black). */
function withAlphaHex(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return `rgba(0,0,0,${alpha})`;
  const n = parseInt(match[1]!, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// ── Story rings ──────────────────────────────────────────────────────────────

/** One "Policy" circle near the top of the profile, showing the top of the
 *  first page; a tap opens the story on page 1, and every other page follows
 *  in the same story (the owner asked on 2026-11-19 for one circle, not one
 *  per page). */
export function PolicyStoryRings({
  urls,
  accent,
  sheet,
  onOpen,
}: {
  urls: readonly string[];
  accent: string;
  sheet: string;
  onOpen: () => void;
}) {
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
  const first = urls[0];
  if (!first) return null;
  const ink = sheetInk(sheet);
  return (
    <View style={styles.ringRow}>
      <TouchableOpacity
        style={styles.ringItem}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onOpen();
        }}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={urls.length === 1 ? "Open their policy" : `Open their policy, ${urls.length} pages`}
      >
        <LinearGradient colors={[accent, blend(accent, "#FFFFFF", 0.5)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ring}>
          <View style={[styles.ringInner, { borderColor: sheet }]}>
            <Image source={{ uri: first }} style={styles.ringImage} contentFit="cover" contentPosition="top" transition={0} />
          </View>
        </LinearGradient>
        <Text style={[styles.ringLabel, { color: ink.text }]} numberOfLines={1}>{tr('discover.profile.tab.policy')}</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * The policy pages full screen, one at a time, like a story: tap the right of
 * the screen for the next page, the left for the one before. No timer — a
 * policy is something to read, not watch go by. Zoom hands over to the
 * zoomable viewer for the small print.
 */
export function PolicyStoryViewer({
  urls,
  edges,
  startIndex,
  title,
  onClose,
  onZoom,
}: {
  urls: readonly string[];
  edges: Record<string, PolicyImageEdge>;
  /** The page to open on; null when closed. */
  startIndex: number | null;
  title: string;
  onClose: () => void;
  onZoom: () => void;
}) {
  return (
    <Modal visible={startIndex != null} animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      {/* A Modal is its own native surface: the app root's safe-area provider can't reach it. */}
      <SafeAreaProvider>
        {startIndex != null ? (
          <StoryBody urls={urls} edges={edges} startIndex={startIndex} title={title} onClose={onClose} onZoom={onZoom} />
        ) : null}
      </SafeAreaProvider>
    </Modal>
  );
}

function StoryBody({
  urls,
  edges,
  startIndex,
  title,
  onClose,
  onZoom,
}: {
  urls: readonly string[];
  edges: Record<string, PolicyImageEdge>;
  startIndex: number;
  title: string;
  onClose: () => void;
  onZoom: () => void;
}) {
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(Math.min(startIndex, Math.max(urls.length - 1, 0)));
  const url = urls[index];
  const edge = (url && edges[url]) || { top: "#141212", bottom: "#141212" };
  const ink = onAccentInk(edge.top);

  const go = (step: 1 | -1) => {
    const next = index + step;
    if (next < 0) return;
    if (next >= urls.length) {
      onClose();
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    setIndex(next);
  };

  if (!url) return null;
  return (
    <LinearGradient colors={[edge.top, edge.bottom]} style={styles.storyRoot}>
      <View style={[styles.storyBars, { top: insets.top + 10 }]}>
        {urls.map((page, i) => (
          <View key={page} style={[styles.storyBar, { backgroundColor: ink.text, opacity: i <= index ? 1 : 0.35 }]} />
        ))}
      </View>
      <View style={[styles.storyHeader, { top: insets.top + 22 }]}>
        <Text style={[styles.storyTitle, { color: ink.text }]} numberOfLines={1}>{title}</Text>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close the policy"
        >
          <Ionicons name="close" size={26} color={ink.text} />
        </TouchableOpacity>
      </View>

      <View style={[styles.storyStage, { top: insets.top + 62, bottom: insets.bottom + 84 }]}>
        <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} accessibilityLabel={urls.length > 1 ? `Policy page ${index + 1} of ${urls.length}` : "Policy page"} />
        <Pressable
          style={styles.tapBack}
          onPress={() => go(-1)}
          accessibilityRole="button"
          accessibilityLabel="Previous page"
          disabled={index === 0}
        />
        <Pressable
          style={styles.tapNext}
          onPress={() => go(1)}
          accessibilityRole="button"
          accessibilityLabel={index === urls.length - 1 ? "Close the policy" : "Next page"}
        />
      </View>

      <View style={[styles.storyActions, { bottom: insets.bottom + 20 }]}>
        <TouchableOpacity
          style={[styles.storyButton, { borderColor: ink.sub }]}
          onPress={onZoom}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Zoom in to read the small print"
        >
          <Ionicons name="expand-outline" size={16} color={ink.text} />
          <Text style={[styles.storyButtonText, { color: ink.text }]}>Zoom</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.storyButton, styles.storyButtonSolid, { backgroundColor: ink.text }]}
          onPress={onClose}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Text style={[styles.storyButtonText, { color: edge.top }]}>{tr('common.done')}</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  inlineWrap: { marginHorizontal: -20, marginBottom: 26 },
  inlineHeading: { paddingHorizontal: 20 },
  meltEnd: { height: 56 },
  between: { height: 40 },
  bleedJoin: { marginVertical: -1 },
  readCloser: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 100,
    borderWidth: 1,
    marginTop: 12,
  },
  readCloserText: { fontFamily: "Jura-VariableFont_wght", fontWeight: "700", fontSize: 13 },

  compactWrap: { marginBottom: 26 },
  framedList: { gap: 18 },
  frame: {
    padding: 12, borderRadius: 4, alignSelf: "center",
    shadowColor: "#26201E", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.14, shadowRadius: 12, elevation: 4,
  },
  swipe: { alignSelf: "center", borderRadius: 6 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 12 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  fan: { height: 270, alignItems: "center", justifyContent: "flex-start", paddingTop: 8 },
  fanCard: {
    position: "absolute", top: 8, width: 150, height: 200, borderRadius: 6, overflow: "hidden",
    shadowColor: "#26201E", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.16, shadowRadius: 8, elevation: 3,
  },
  fanCaption: { position: "absolute", bottom: 0, fontFamily: "Jura-VariableFont_wght", fontWeight: "700", fontSize: 13 },
  peek: { alignSelf: "center", height: 220, overflow: "hidden", borderRadius: 6 },
  peekFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 120 },
  thumbScroll: { marginHorizontal: -20 },
  thumbRow: { gap: 12, paddingHorizontal: 20 },
  thumbItem: { alignItems: "center", gap: 6 },
  thumb: { width: 84, height: 112, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  thumbLabel: { fontFamily: "Jura-VariableFont_wght", fontWeight: "700", fontSize: 12 },
  readButton: {
    flexDirection: "row", alignItems: "center", gap: 10,
    minHeight: 52, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1,
  },
  readButtonText: { fontFamily: "Jura-VariableFont_wght", fontWeight: "700", fontSize: 15, flex: 1 },
  readButtonCount: { fontFamily: "Jura-VariableFont_wght", fontWeight: "600", fontSize: 13 },

  ringRow: { flexDirection: "row", marginBottom: 18 },
  ringItem: { alignItems: "center", gap: 6, width: 72 },
  ring: { width: 70, height: 70, borderRadius: 35, padding: 3 },
  ringInner: { flex: 1, borderRadius: 32, borderWidth: 3, overflow: "hidden" },
  ringImage: { width: "100%", height: "100%" },
  ringLabel: { fontFamily: "Jura-VariableFont_wght", fontWeight: "700", fontSize: 12 },

  storyRoot: { flex: 1 },
  storyBars: { position: "absolute", left: 14, right: 14, flexDirection: "row", gap: 4 },
  storyBar: { flex: 1, height: 3, borderRadius: 2 },
  storyHeader: { position: "absolute", left: 16, right: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  storyTitle: { flex: 1, fontFamily: "BakbakOne-Regular", fontSize: 14 },
  storyStage: { position: "absolute", left: 0, right: 0 },
  tapBack: { position: "absolute", left: 0, top: 0, bottom: 0, width: "35%" },
  tapNext: { position: "absolute", right: 0, top: 0, bottom: 0, width: "65%" },
  storyActions: { position: "absolute", left: 16, right: 16, flexDirection: "row", gap: 10 },
  storyButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 100,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  storyButtonSolid: { borderWidth: 0 },
  storyButtonText: { fontFamily: "BakbakOne-Regular", fontSize: 14 },
});
