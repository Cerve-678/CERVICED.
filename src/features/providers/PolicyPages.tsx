// src/features/providers/PolicyPages.tsx
//
// A provider's uploaded policy pictures as part of their profile, not behind
// a button (owner's picks on the 2026-11-13 canvas,
// https://claude.ai/artifact/Q3iiDvPo8zuXkbPBHYtqW3):
//
//   - PolicyPagesInline: the pages running edge to edge down the profile,
//     either melting into the page around them (B) or on a wavy band of
//     their own colour (A) — Branding → Policy Pictures.
//   - PolicyStoryRings + PolicyStoryViewer: story-style circles near the top
//     of the profile that open the pages full screen, one at a time (D).
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
  useWindowDimensions,
  View,
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

// ── Story rings ──────────────────────────────────────────────────────────────

/** A circle per policy page near the top of the profile, each showing the
 *  top of its page; a tap opens that page full screen. */
export function PolicyStoryRings({
  urls,
  accent,
  sheet,
  onOpen,
}: {
  urls: readonly string[];
  accent: string;
  sheet: string;
  onOpen: (index: number) => void;
}) {
  if (urls.length === 0) return null;
  const ink = sheetInk(sheet);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ringRow} style={styles.ringScroll}>
      {urls.map((url, index) => {
        const name = urls.length === 1 ? "Policy" : `Page ${index + 1}`;
        return (
          <TouchableOpacity
            key={url}
            style={styles.ringItem}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onOpen(index);
            }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={urls.length === 1 ? "Open their policy" : `Open policy page ${index + 1} of ${urls.length}`}
          >
            <LinearGradient colors={[accent, blend(accent, "#FFFFFF", 0.5)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ring}>
              <View style={[styles.ringInner, { borderColor: sheet }]}>
                <Image source={{ uri: url }} style={styles.ringImage} contentFit="cover" contentPosition="top" transition={0} />
              </View>
            </LinearGradient>
            <Text style={[styles.ringLabel, { color: ink.text }]} numberOfLines={1}>{name}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
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
          <Text style={[styles.storyButtonText, { color: edge.top }]}>Done</Text>
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

  ringScroll: { marginBottom: 18, marginHorizontal: -20 },
  ringRow: { gap: 16, paddingHorizontal: 20 },
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
