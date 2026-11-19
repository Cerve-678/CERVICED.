// src/features/providers/HeroPhoto.tsx
//
// A portfolio photo in a page style's hero slot, moved and zoomed the way the
// provider framed it in Branding → Your Photos (portfolio_items.hero_frame).
// The heroes draw it in place of a plain cover-fit <Image>. The frames reach
// it through HeroPhotoFramesContext, keyed by photo URL, so heroes in other
// files (Hush, Bow) need no extra props threaded through them.

import React, { createContext, useCallback, useContext, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Image, type ImageLoadEventData } from 'expo-image';

import type { HeroPhotoFrame } from '../../types/database';
import { heroPhotoLayout, isDefaultHeroPhotoFrame } from '../../utils/heroPhotoFrame';

/** One hero photo's framing: its shape (width ÷ height, when known) and frame. */
export interface HeroPhotoFraming {
  aspectRatio: number | null;
  frame: HeroPhotoFrame | null;
}

/** Framing by photo URL. */
export type HeroPhotoFrames = Readonly<Record<string, HeroPhotoFraming>>;

const NO_FRAMES: HeroPhotoFrames = {};

export const HeroPhotoFramesContext = createContext<HeroPhotoFrames>(NO_FRAMES);

/** The framing for each photo, by URL, from portfolio rows. */
export function heroPhotoFramesOf(
  items: readonly { image_url: string; aspect_ratio: number | null; hero_frame?: HeroPhotoFrame | null }[],
): HeroPhotoFrames {
  const frames: Record<string, HeroPhotoFraming> = {};
  for (const item of items) {
    if (!item.image_url || isDefaultHeroPhotoFrame(item.hero_frame)) continue;
    frames[item.image_url] = { aspectRatio: item.aspect_ratio, frame: item.hero_frame ?? null };
  }
  return frames;
}

/**
 * Fills its slot (absolutely, like StyleSheet.absoluteFill) with the photo as
 * framed. The slot must clip (overflow: "hidden"). With no frame it's the
 * plain cover-fit image the heroes always drew.
 */
export function HeroPhoto({ uri }: { uri: string }) {
  const framing = useContext(HeroPhotoFramesContext)[uri];
  if (!framing?.frame || isDefaultHeroPhotoFrame(framing.frame)) {
    return <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} recyclingKey={uri} />;
  }
  return <FramedPhoto uri={uri} aspectRatio={framing.aspectRatio} frame={framing.frame} />;
}

/** The photo moved and zoomed inside a slot it measures for itself. */
export function FramedPhoto({
  uri,
  aspectRatio,
  frame,
}: {
  uri: string;
  aspectRatio: number | null;
  frame: HeroPhotoFrame;
}) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  // An old row can lack a ratio: take it from the image once it loads.
  const [loadedRatio, setLoadedRatio] = useState<number | null>(null);
  const ratio = aspectRatio && aspectRatio > 0 ? aspectRatio : loadedRatio;

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox(prev => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);
  const onLoad = useCallback((event: ImageLoadEventData) => {
    const { width, height } = event.source;
    if (width > 0 && height > 0) setLoadedRatio(prev => prev ?? width / height);
  }, []);

  const placed = box && box.width > 0 && box.height > 0 && ratio ? heroPhotoLayout(box.width, box.height, ratio, frame) : null;
  return (
    <View style={styles.slot} onLayout={onLayout} pointerEvents="none">
      <Image
        source={{ uri }}
        style={placed ? { position: 'absolute', ...placed } : StyleSheet.absoluteFill}
        contentFit="cover"
        transition={0}
        recyclingKey={uri}
        onLoad={onLoad}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden' },
});
