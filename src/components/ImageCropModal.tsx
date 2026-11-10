// Free-shape crop for a photo that's already been picked. iOS's built-in editor
// (allowsEditing) only crops to a square, which can't keep a full-length photo.
// The crop starts as the whole photo, so leaving it alone uploads the original.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type PanResponderInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import {
  CROP_HANDLES,
  fitContain,
  moveCrop,
  moveHandle,
  toImageCrop,
  type CropHandle,
  type CropRect,
  type Size,
} from '../utils/cropRect';
import { logger } from '../utils/logger';

const HANDLE_HIT = 44;
const CORNER = 22;
const EDGE_LONG = 32;
const LINE = 3;

interface ImageCropModalProps {
  /** The picked photo. The modal shows while this is set. */
  uri: string | null;
  accent: string;
  onAccent: string;
  onCancel: () => void;
  onDone: (uri: string) => void;
  /** Defaults to "Cancel". A queue of photos says "Skip". */
  cancelLabel?: string;
  /** e.g. "2 of 3" when cropping several photos in a row. */
  progressLabel?: string | null;
}

/** The handle's hit area, centred on its corner or edge of the crop. */
function handleBox(handle: CropHandle, crop: CropRect): { left: number; top: number } {
  const midX = crop.x + crop.width / 2;
  const midY = crop.y + crop.height / 2;
  const right = crop.x + crop.width;
  const bottom = crop.y + crop.height;
  const x = handle === 'top' || handle === 'bottom' ? midX : handle.toLowerCase().includes('left') ? crop.x : right;
  const y = handle === 'left' || handle === 'right' ? midY : handle.toLowerCase().includes('top') ? crop.y : bottom;
  return { left: x - HANDLE_HIT / 2, top: y - HANDLE_HIT / 2 };
}

/** The visible mark inside a handle: an L at a corner, a short bar on an edge. */
function handleMark(handle: CropHandle): object {
  switch (handle) {
    case 'top': return { width: EDGE_LONG, height: LINE, backgroundColor: '#FFFFFF' };
    case 'bottom': return { width: EDGE_LONG, height: LINE, backgroundColor: '#FFFFFF' };
    case 'left': return { width: LINE, height: EDGE_LONG, backgroundColor: '#FFFFFF' };
    case 'right': return { width: LINE, height: EDGE_LONG, backgroundColor: '#FFFFFF' };
    case 'topLeft': return { position: 'absolute', left: HANDLE_HIT / 2, top: HANDLE_HIT / 2, width: CORNER, height: CORNER, borderLeftWidth: LINE, borderTopWidth: LINE, borderColor: '#FFFFFF' };
    case 'topRight': return { position: 'absolute', right: HANDLE_HIT / 2, top: HANDLE_HIT / 2, width: CORNER, height: CORNER, borderRightWidth: LINE, borderTopWidth: LINE, borderColor: '#FFFFFF' };
    case 'bottomLeft': return { position: 'absolute', left: HANDLE_HIT / 2, bottom: HANDLE_HIT / 2, width: CORNER, height: CORNER, borderLeftWidth: LINE, borderBottomWidth: LINE, borderColor: '#FFFFFF' };
    default: return { position: 'absolute', right: HANDLE_HIT / 2, bottom: HANDLE_HIT / 2, width: CORNER, height: CORNER, borderRightWidth: LINE, borderBottomWidth: LINE, borderColor: '#FFFFFF' };
  }
}

export function ImageCropModal({ uri, accent, onAccent, onCancel, onDone, cancelLabel = 'Cancel', progressLabel = null }: ImageCropModalProps) {
  const insets = useSafeAreaInsets();
  const [source, setSource] = useState<ImageRef | null>(null);
  const [imageSize, setImageSize] = useState<Size | null>(null);
  const [area, setArea] = useState<Size | null>(null);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  // Rendered once to read the upright (EXIF-applied) size, which is what crop
  // coordinates are measured against. A photo that won't decode skips the crop
  // rather than losing the pick.
  useEffect(() => {
    setSource(null);
    setImageSize(null);
    setCrop(null);
    setFailed(false);
    setSaving(false);
    if (!uri) return;
    let active = true;
    ImageManipulator.manipulate(uri).renderAsync()
      .then(rendered => {
        if (!active) return;
        setSource(rendered);
        setImageSize({ width: rendered.width, height: rendered.height });
      })
      .catch(error => {
        logger.warn('[ImageCropModal] could not read photo, using it uncropped:', error);
        if (active) onDone(uri);
      });
    return () => { active = false; };
    // onDone is deliberately left out: only a new photo should restart this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  const photo = useMemo(
    () => (imageSize && area ? fitContain(imageSize, area) : null),
    [imageSize, area],
  );

  useEffect(() => {
    setCrop(photo);
  }, [photo]);

  // The responders are built once, so they read the latest values from here.
  const latest = useRef({ crop, photo });
  latest.current = { crop, photo };
  const dragStart = useRef<CropRect | null>(null);

  const responders = useMemo(() => {
    const make = (next: (start: CropRect, dx: number, dy: number, bounds: CropRect) => CropRect): PanResponderInstance =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => { dragStart.current = latest.current.crop; },
        onPanResponderMove: (_, gesture) => {
          const { photo: bounds } = latest.current;
          if (dragStart.current && bounds) setCrop(next(dragStart.current, gesture.dx, gesture.dy, bounds));
        },
      });
    const handles = {} as Record<CropHandle, PanResponderInstance>;
    for (const handle of CROP_HANDLES) {
      handles[handle] = make((start, dx, dy, bounds) => moveHandle(start, handle, dx, dy, bounds));
    }
    return { handles, body: make(moveCrop) };
  }, []);

  const handleUsePhoto = async () => {
    if (!uri || !crop || !photo || !imageSize || !source) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const pixels = toImageCrop(crop, photo, imageSize);
    if (!pixels) {
      onDone(uri);
      return;
    }
    setSaving(true);
    setFailed(false);
    try {
      const cropped = await ImageManipulator.manipulate(source).crop(pixels).renderAsync();
      // Screenshots stay PNG so the text in a policy sheet stays sharp.
      const saved = await cropped.saveAsync(
        /\.png$/i.test(uri) ? { format: SaveFormat.PNG } : { format: SaveFormat.JPEG, compress: 0.9 },
      );
      onDone(saved.uri);
    } catch (error) {
      logger.error('[ImageCropModal] could not crop photo', error);
      setFailed(true);
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!uri} animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View style={[st.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        <View style={st.topBar}>
          <TouchableOpacity onPress={onCancel} disabled={saving} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button">
            <Text style={st.cancel}>{cancelLabel}</Text>
          </TouchableOpacity>
          {progressLabel ? <Text style={st.progress}>{progressLabel}</Text> : null}
          <TouchableOpacity
            testID="crop-use-photo"
            style={[st.use, { backgroundColor: accent, opacity: crop ? 1 : 0.5 }]}
            onPress={handleUsePhoto}
            disabled={!crop || saving}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            {saving ? <ActivityIndicator size="small" color={onAccent} /> : <Text style={[st.useText, { color: onAccent }]}>USE PHOTO</Text>}
          </TouchableOpacity>
        </View>

        <View
          testID="crop-area"
          style={st.area}
          onLayout={e => setArea({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        >
          {uri && photo ? (
            <Image
              source={{ uri }}
              style={{ position: 'absolute', left: photo.x, top: photo.y, width: photo.width, height: photo.height }}
              fadeDuration={0}
            />
          ) : (
            <ActivityIndicator style={StyleSheet.absoluteFill} size="large" color="#FFFFFF" />
          )}

          {photo && crop && (
            <>
              {/* Dims everything outside the crop. */}
              <View pointerEvents="none" style={[st.dim, { left: photo.x, top: photo.y, width: photo.width, height: crop.y - photo.y }]} />
              <View pointerEvents="none" style={[st.dim, { left: photo.x, top: crop.y + crop.height, width: photo.width, height: photo.y + photo.height - crop.y - crop.height }]} />
              <View pointerEvents="none" style={[st.dim, { left: photo.x, top: crop.y, width: crop.x - photo.x, height: crop.height }]} />
              <View pointerEvents="none" style={[st.dim, { left: crop.x + crop.width, top: crop.y, width: photo.x + photo.width - crop.x - crop.width, height: crop.height }]} />

              <View
                {...responders.body.panHandlers}
                style={[st.frame, { left: crop.x, top: crop.y, width: crop.width, height: crop.height }]}
              />
              {CROP_HANDLES.map(handle => (
                <View
                  key={handle}
                  {...responders.handles[handle].panHandlers}
                  style={[st.handle, handleBox(handle, crop)]}
                >
                  <View pointerEvents="none" style={handleMark(handle)} />
                </View>
              ))}
            </>
          )}
        </View>

        <Text style={st.hint}>
          {failed
            ? "Couldn't crop that photo. Try again, or drag back out to use the whole photo."
            : 'Drag the corners or edges to crop. Leave it as it is to use the whole photo.'}
        </Text>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#000000' },
  topBar:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  cancel:  { fontFamily: 'Jura-VariableFont_wght', fontWeight: '600', fontSize: 15, color: '#FFFFFF' },
  progress: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '600', fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  use:     { minWidth: 104, height: 38, borderRadius: 19, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  useText: { fontFamily: 'BakbakOne-Regular', fontSize: 13 },
  area:    { flex: 1, marginHorizontal: 24, marginVertical: 12 },
  dim:     { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.6)' },
  frame:   { position: 'absolute', borderWidth: StyleSheet.hairlineWidth, borderColor: '#FFFFFF' },
  handle:  { position: 'absolute', width: HANDLE_HIT, height: HANDLE_HIT, alignItems: 'center', justifyContent: 'center' },
  hint:    { fontFamily: 'Jura-VariableFont_wght', fontWeight: '500', fontSize: 13, lineHeight: 18, color: 'rgba(255,255,255,0.75)', textAlign: 'center', paddingHorizontal: 28 },
});
