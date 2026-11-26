// src/features/providers/HeroPhotoAdjust.tsx
//
// Branding → Your Photos → Adjust: the provider moves and zooms each photo
// their page style's hero shows, in the shape of the slot it fills. The frame
// is kept in Branding's state and saved with everything else
// (setHeroPhotoFrames); the live preview above shows it straight away.
// Looks like ImageCropModal, the app's other full-screen photo tool.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image as NativeImage,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { heroPhotoSlotAspect, type PageHero } from '../../constants/pageStyles';
import { isDarkColor } from '../../constants/providerThemes';
import type { DbPortfolioItem, HeroPhotoFrame } from '../../types/database';
import {
  clampHeroPhotoFrame,
  DEFAULT_HERO_PHOTO_FRAME,
  isDefaultHeroPhotoFrame,
  MAX_HERO_PHOTO_ZOOM,
  panHeroPhotoFrame,
} from '../../utils/heroPhotoFrame';
import { FramedPhoto } from './HeroPhoto';
import { tr } from '../../i18n';
import { useTranslation } from '../../i18n';

const THUMB_HEIGHT = 64;
const ZOOM_STEP = 0.25;

/** The photos the hero shows, each a small framed thumbnail; tapping one opens the adjust sheet. */
export function HeroPhotoAdjustRow({
  photos,
  frames,
  onChange,
  hero,
  accent,
  textColor,
  subColor,
  borderColor,
}: {
  /** The photos the hero shows, in the order it shows them. */
  photos: readonly DbPortfolioItem[];
  /** Each photo's frame, by portfolio item id (null or missing = centred). */
  frames: Readonly<Record<string, HeroPhotoFrame | null>>;
  onChange: (itemId: string, frame: HeroPhotoFrame | null) => void;
  hero: PageHero;
  accent: string;
  textColor: string;
  subColor: string;
  borderColor: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (photos.length === 0) return null;
  const editing = open !== null ? photos[open] : undefined;

  return (
    <View style={row.wrap}>
      <Text style={[row.title, { color: textColor }]}>Adjust how they sit</Text>
      <Text style={[row.sub, { color: subColor }]}>Tap a photo to move it or zoom in.</Text>
      <View style={row.thumbs}>
        {photos.map((item, index) => {
          const aspect = heroPhotoSlotAspect(hero, index, photos.length);
          const width = Math.min(150, Math.max(46, THUMB_HEIGHT * aspect));
          const frame = frames[item.id] ?? null;
          const moved = !isDefaultHeroPhotoFrame(frame);
          return (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.85}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setOpen(index);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Adjust photo ${index + 1} of ${photos.length}${moved ? ', adjusted' : ''}`}
              style={row.thumbCol}
            >
              <View style={[row.thumb, { width, borderColor: moved ? accent : borderColor }]}>
                <FramedPhoto uri={item.image_url} aspectRatio={item.aspect_ratio} frame={frame ?? DEFAULT_HERO_PHOTO_FRAME} />
                <View style={[row.badge, { backgroundColor: accent }]}>
                  <Ionicons name="move" size={11} color={isDarkColor(accent) ? '#FFFFFF' : '#1F1A1C'} />
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <HeroPhotoAdjustSheet
        item={editing ?? null}
        frame={editing ? frames[editing.id] ?? null : null}
        slotAspect={open !== null ? heroPhotoSlotAspect(hero, open, photos.length) : 1}
        progressLabel={photos.length > 1 && open !== null ? `${open + 1} of ${photos.length}` : null}
        accent={accent}
        onCancel={() => setOpen(null)}
        onDone={frame => {
          if (editing) onChange(editing.id, frame);
          setOpen(null);
        }}
      />
    </View>
  );
}

const distance = (event: GestureResponderEvent): number | null => {
  const [a, b] = event.nativeEvent.touches;
  if (!a || !b) return null;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
};

/** Full screen: the photo in its slot's shape. One finger drags it, two pinch to zoom. */
function HeroPhotoAdjustSheet({
  item,
  frame: savedFrame,
  slotAspect,
  progressLabel,
  accent,
  onCancel,
  onDone,
}: {
  item: DbPortfolioItem | null;
  frame: HeroPhotoFrame | null;
  slotAspect: number;
  progressLabel: string | null;
  accent: string;
  onCancel: () => void;
  onDone: (frame: HeroPhotoFrame | null) => void;
}) {
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
  const insets = useSafeAreaInsets();
  const onAccent = isDarkColor(accent) ? '#FFFFFF' : '#1F1A1C';
  const [frame, setFrame] = useState<HeroPhotoFrame>(DEFAULT_HERO_PHOTO_FRAME);
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  const [loadedRatio, setLoadedRatio] = useState<number | null>(null);

  // Opening a photo starts from its saved frame.
  const itemId = item?.id ?? null;
  useEffect(() => {
    setFrame(savedFrame ?? DEFAULT_HERO_PHOTO_FRAME);
    setLoadedRatio(null);
    // Only when a different photo opens; savedFrame changes only on Done.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  // An old row without a ratio: measure the photo so dragging moves it 1:1.
  const uri = item?.image_url ?? null;
  const storedRatio = item?.aspect_ratio && item.aspect_ratio > 0 ? item.aspect_ratio : null;
  useEffect(() => {
    if (!uri || storedRatio) return;
    let active = true;
    NativeImage.getSize(uri, (w, h) => { if (active && w > 0 && h > 0) setLoadedRatio(w / h); }, () => {});
    return () => { active = false; };
  }, [uri, storedRatio]);
  const ratio = storedRatio ?? loadedRatio ?? 1;

  // The slot, as large as fits the space between the bars.
  const box = useMemo(() => {
    if (!area) return null;
    const width = Math.min(area.width, area.height * slotAspect);
    return { width, height: width / slotAspect };
  }, [area, slotAspect]);

  // The responder is made once; it reads the latest values through refs.
  const live = useRef({ frame, box, ratio });
  live.current = { frame, box, ratio };
  const touch = useRef({ fingers: 0, lastX: 0, lastY: 0, pinchFrom: 0, zoomFrom: 1 });

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => { touch.current.fingers = 0; },
        onPanResponderMove: event => {
          const t = touch.current;
          const { frame: current, box: slot, ratio: imageRatio } = live.current;
          if (!slot) return;
          const apart = distance(event);
          if (apart !== null) {
            if (t.fingers !== 2) {
              t.pinchFrom = apart;
              t.zoomFrom = current.zoom;
              t.fingers = 2;
              return;
            }
            if (t.pinchFrom > 0) setFrame(clampHeroPhotoFrame({ ...current, zoom: t.zoomFrom * (apart / t.pinchFrom) }));
            return;
          }
          const finger = event.nativeEvent.touches[0];
          if (!finger) return;
          if (t.fingers !== 1) {
            t.lastX = finger.pageX;
            t.lastY = finger.pageY;
            t.fingers = 1;
            return;
          }
          const dx = finger.pageX - t.lastX;
          const dy = finger.pageY - t.lastY;
          t.lastX = finger.pageX;
          t.lastY = finger.pageY;
          setFrame(panHeroPhotoFrame(current, dx, dy, slot.width, slot.height, imageRatio));
        },
        onPanResponderRelease: () => { touch.current.fingers = 0; },
        onPanResponderTerminate: () => { touch.current.fingers = 0; },
      }),
    [],
  );

  const onAreaLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setArea(prev => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  const zoomBy = (step: number) => {
    Haptics.selectionAsync().catch(() => {});
    setFrame(current => clampHeroPhotoFrame({ ...current, zoom: current.zoom + step }));
  };

  return (
    <Modal visible={!!item} animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View style={[sheet.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        <View style={sheet.topBar}>
          <TouchableOpacity onPress={onCancel} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button">
            <Text style={sheet.cancel}>{tr('common.cancel')}</Text>
          </TouchableOpacity>
          {progressLabel ? <Text style={sheet.progress}>{progressLabel}</Text> : null}
          <TouchableOpacity
            style={[sheet.done, { backgroundColor: accent }]}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              onDone(isDefaultHeroPhotoFrame(frame) ? null : clampHeroPhotoFrame(frame));
            }}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Text style={[sheet.doneText, { color: onAccent }]}>DONE</Text>
          </TouchableOpacity>
        </View>

        <View style={sheet.area} onLayout={onAreaLayout}>
          {item && box ? (
            <View
              {...responder.panHandlers}
              style={[sheet.slot, { width: box.width, height: box.height }]}
              accessibilityLabel="Your photo. Drag to move it, pinch to zoom."
            >
              <FramedPhoto uri={item.image_url} aspectRatio={storedRatio ?? loadedRatio} frame={frame} />
            </View>
          ) : null}
        </View>

        <View style={sheet.controls}>
          <TouchableOpacity
            style={sheet.control}
            onPress={() => zoomBy(-ZOOM_STEP)}
            disabled={frame.zoom <= 1}
            accessibilityRole="button"
            accessibilityLabel="Zoom out"
          >
            <Ionicons name="remove" size={20} color={frame.zoom <= 1 ? 'rgba(255,255,255,0.3)' : '#FFFFFF'} />
          </TouchableOpacity>
          <TouchableOpacity
            style={sheet.reset}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setFrame(DEFAULT_HERO_PHOTO_FRAME);
            }}
            disabled={isDefaultHeroPhotoFrame(frame)}
            accessibilityRole="button"
          >
            <Text style={[sheet.resetText, isDefaultHeroPhotoFrame(frame) && sheet.resetOff]}>{tr('discover.search.reset')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={sheet.control}
            onPress={() => zoomBy(ZOOM_STEP)}
            disabled={frame.zoom >= MAX_HERO_PHOTO_ZOOM}
            accessibilityRole="button"
            accessibilityLabel="Zoom in"
          >
            <Ionicons name="add" size={20} color={frame.zoom >= MAX_HERO_PHOTO_ZOOM ? 'rgba(255,255,255,0.3)' : '#FFFFFF'} />
          </TouchableOpacity>
        </View>
        <Text style={sheet.hint}>Drag to move the photo. Pinch to zoom in.</Text>
      </View>
    </Modal>
  );
}

const row = StyleSheet.create({
  wrap: { marginTop: 18 },
  title: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '700', fontSize: 14 },
  sub: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '500', fontSize: 12, marginTop: 2 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  thumbCol: { alignItems: 'center' },
  thumb: { height: THUMB_HEIGHT, borderRadius: 10, borderWidth: 1.5, overflow: 'hidden', backgroundColor: 'rgba(127,127,127,0.12)' },
  badge: { position: 'absolute', right: 4, bottom: 4, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});

const sheet = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  cancel: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '600', fontSize: 15, color: '#FFFFFF' },
  progress: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '600', fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  done: { minWidth: 104, height: 38, borderRadius: 19, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  doneText: { fontFamily: 'BakbakOne-Regular', fontSize: 13 },
  area: { flex: 1, marginHorizontal: 24, marginVertical: 12, alignItems: 'center', justifyContent: 'center' },
  slot: { borderRadius: 14, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: '#FFFFFF' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginBottom: 12 },
  control: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  reset: { height: 44, paddingHorizontal: 18, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  resetText: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '700', fontSize: 14, color: '#FFFFFF' },
  resetOff: { color: 'rgba(255,255,255,0.35)' },
  hint: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '500', fontSize: 13, lineHeight: 18, color: 'rgba(255,255,255,0.75)', textAlign: 'center', paddingHorizontal: 28 },
});
