import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image as RNImage,
  Modal,
  PanResponder,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { logger } from '../../utils/logger';
import type { ServiceImageDraft } from '../../services/providerRegistrationService';


/** Framing presets, as width ÷ height. "Original" keeps the photo's own shape
 *  and skips cropping entirely — the provider is saying "this is already the
 *  picture I want", not picking a different rectangle. */
const PRESETS: { key: string; label: string; ratio: number | null }[] = [
  { key: 'original', label: 'Original', ratio: null },
  { key: 'portrait', label: '4:5', ratio: 4 / 5 },
  { key: 'square', label: '1:1', ratio: 1 },
];

interface ServiceImageCropperProps {
  visible: boolean;
  /** Local URIs straight from the picker, cropped one at a time in order. */
  uris: string[];
  onDone: (images: ServiceImageDraft[]) => void;
  onCancel: () => void;
  palette: { bg: string; card: string; text: string; sub: string; accent: string };
}

/**
 * Frames each newly-picked service photo before it's uploaded.
 *
 * Two jobs, and the second one is invisible but arguably more important:
 *
 * 1. The provider chooses what stays in frame. Previously the app cropped
 *    every photo to whatever box the carousel happened to be, so a nail set or
 *    a face could lose its edges with nobody having chosen that.
 * 2. **Everything that passes through here is re-encoded as JPEG**, including
 *    photos the provider leaves on "Original". iOS hands back HEIC from the
 *    library, which used to be uploaded under a `.jpg` name and served as
 *    `image/jpeg` — fine on iOS, undecodable on Android and web. Rendering
 *    through the manipulator makes the bytes match the label.
 *
 * The crop window is fixed and the photo pans behind it, rather than a
 * pinch-to-zoom canvas: it's a smaller surface to get wrong, and the offset
 * can be clamped so a crop can never include empty space.
 */
export function ServiceImageCropper({
  visible,
  uris,
  onDone,
  onCancel,
  palette,
}: ServiceImageCropperProps) {
  const [index, setIndex] = useState(0);
  const [presetKey, setPresetKey] = useState('original');
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const resultsRef = useRef<ServiceImageDraft[]>([]);

  const uri = uris[index];
  const preset = PRESETS.find(p => p.key === presetKey) ?? PRESETS[0]!;

  // Offset of the photo behind the crop window, in display pixels. A ref
  // shadows the Animated value because the PanResponder needs to read the
  // committed offset synchronously when a new drag starts.
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const offsetRef = useRef({ x: 0, y: 0 });

  // Measure the real pixel size — the crop rect has to be expressed in source
  // pixels, not in whatever size we happen to draw it at.
  useEffect(() => {
    if (!uri) return;
    setNatural(null);
    let cancelled = false;
    RNImage.getSize(
      uri,
      (w, h) => {
        if (!cancelled) setNatural({ w, h });
      },
      error => {
        if (cancelled) return;
        logger.error('[ServiceImageCropper] could not measure image:', error);
        // Unmeasurable means we can't compute a crop rect, so the photo can
        // still be used — just never cropped — rather than blocking the add.
        setNatural(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const naturalRatio = natural ? natural.w / natural.h : 1;
  const frameRatio = preset.ratio ?? naturalRatio;
  // Measured per render, not at module load, so the crop frame is still right
  // after a rotation or in split-screen.
  const { width: screenWidth } = useWindowDimensions();
  const frameW = Math.min(screenWidth - 48, 320);
  const frameH = frameW / frameRatio;

  // Cover the frame: the photo is drawn at the smallest scale that leaves no
  // empty space, so any offset within the clamp is a valid crop.
  const layout = useMemo(() => {
    if (!natural) return null;
    const scale = Math.max(frameW / natural.w, frameH / natural.h);
    const dispW = natural.w * scale;
    const dispH = natural.h * scale;
    return {
      scale,
      dispW,
      dispH,
      minX: frameW - dispW,
      minY: frameH - dispH,
    };
  }, [natural, frameH, frameW]);

  // Re-centre whenever the photo or the chosen shape changes — the old offset
  // describes a window that no longer exists.
  useEffect(() => {
    if (!layout) return;
    const centred = { x: layout.minX / 2, y: layout.minY / 2 };
    offsetRef.current = centred;
    pan.setValue(centred);
  }, [layout, pan]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_evt, gesture) => {
          if (!layout) return;
          // Clamped every frame rather than on release, so the photo visibly
          // stops at its edge instead of springing back afterwards.
          const x = Math.min(
            0,
            Math.max(layout.minX, offsetRef.current.x + gesture.dx),
          );
          const y = Math.min(
            0,
            Math.max(layout.minY, offsetRef.current.y + gesture.dy),
          );
          pan.setValue({ x, y });
        },
        onPanResponderRelease: (_evt, gesture) => {
          if (!layout) return;
          offsetRef.current = {
            x: Math.min(0, Math.max(layout.minX, offsetRef.current.x + gesture.dx)),
            y: Math.min(0, Math.max(layout.minY, offsetRef.current.y + gesture.dy)),
          };
        },
      }),
    [layout, pan],
  );

  const finish = useCallback(
    (images: ServiceImageDraft[]) => {
      resultsRef.current = [];
      setIndex(0);
      setPresetKey('original');
      onDone(images);
    },
    [onDone],
  );

  const handleUse = useCallback(async () => {
    if (!uri || busy) return;
    setBusy(true);
    try {
      const context = ImageManipulator.manipulate(uri);
      // Only an explicitly-chosen shape crops. "Original" still renders and
      // saves, which is what normalises HEIC to JPEG.
      if (preset.ratio != null && layout && natural) {
        context.crop({
          originX: Math.round(-offsetRef.current.x / layout.scale),
          originY: Math.round(-offsetRef.current.y / layout.scale),
          width: Math.round(frameW / layout.scale),
          height: Math.round(frameH / layout.scale),
        });
      }
      const rendered = await context.renderAsync();
      const saved = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.85,
      });
      resultsRef.current.push({ uri: saved.uri, fit: 'cover' });
    } catch (error) {
      // A manipulator failure must not cost the provider the photo — fall
      // back to the original file, which is exactly today's behaviour.
      logger.error('[ServiceImageCropper] crop failed, using original:', error);
      resultsRef.current.push({ uri, fit: 'cover' });
    } finally {
      setBusy(false);
    }

    Haptics.selectionAsync().catch(() => {});
    if (index + 1 >= uris.length) {
      finish(resultsRef.current);
    } else {
      setIndex(index + 1);
      setPresetKey('original');
    }
  }, [uri, busy, preset.ratio, layout, natural, frameH, frameW, index, uris.length, finish]);

  const handleCancel = useCallback(() => {
    resultsRef.current = [];
    setIndex(0);
    setPresetKey('original');
    onCancel();
  }, [onCancel]);

  if (!visible || !uri) return null;

  return (
    <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={handleCancel}>
      <View style={[st.backdrop, { backgroundColor: palette.bg }]}>
        <View style={st.header}>
          <TouchableOpacity onPress={handleCancel} activeOpacity={0.7}>
            <Text style={[st.cancel, { color: palette.sub }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[st.counter, { color: palette.text }]}>
            Photo {index + 1} of {uris.length}
          </Text>
          <View style={st.headerSpacer} />
        </View>

        <Text style={[st.hint, { color: palette.sub }]}>
          Drag to choose what stays in frame.
        </Text>

        <View
          style={[st.frame, { width: frameW, height: frameH }]}
          {...panResponder.panHandlers}
        >
          {layout ? (
            <Animated.View
              style={{
                width: layout.dispW,
                height: layout.dispH,
                transform: [{ translateX: pan.x }, { translateY: pan.y }],
              }}
            >
              <Image
                source={{ uri }}
                style={{ width: layout.dispW, height: layout.dispH }}
                contentFit="cover"
                transition={0}
              />
            </Animated.View>
          ) : (
            <ActivityIndicator color={palette.accent} />
          )}
        </View>

        <View style={st.presets}>
          {PRESETS.map(p => {
            const active = p.key === presetKey;
            return (
              <TouchableOpacity
                key={p.key}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setPresetKey(p.key);
                }}
                activeOpacity={0.7}
                style={[
                  st.preset,
                  {
                    backgroundColor: active ? palette.accent : palette.card,
                  },
                ]}
              >
                <Text
                  style={[
                    st.presetText,
                    { color: active ? '#FFFFFF' : palette.text },
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          onPress={handleUse}
          disabled={busy}
          activeOpacity={0.8}
          style={[
            st.use,
            { backgroundColor: palette.accent, opacity: busy ? 0.6 : 1 },
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={st.useText}>
              {index + 1 >= uris.length ? 'Done' : 'Next photo'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  cancel: { fontSize: 15, fontWeight: '600' },
  counter: { fontSize: 15, fontWeight: '700' },
  headerSpacer: { width: 52 },
  hint: { fontSize: 12, marginBottom: 14, textAlign: 'center' },
  frame: {
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presets: { flexDirection: 'row', gap: 10, marginTop: 18 },
  preset: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10 },
  presetText: { fontSize: 13, fontWeight: '700' },
  use: {
    marginTop: 22,
    paddingHorizontal: 34,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 170,
    alignItems: 'center',
  },
  useText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
