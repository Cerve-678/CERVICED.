import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import type { ServiceImageDraft } from '../../services/providerRegistrationService';

interface ServiceImageCarouselProps {
  images: ServiceImageDraft[];
  onAddImage: () => void;
  onRemoveImage: (index: number) => void;
  /** Flip one photo between filling its box (cropping) and fitting whole. */
  onToggleFit: (index: number) => void;
  /** Commit a drag: move the photo at `from` to sit at `to`. The first photo
   *  is the one that leads the service everywhere it's shown, so this is the
   *  only way to choose a cover shot without deleting and re-adding. */
  onReorder: (from: number, to: number) => void;
  size?: number;
  styles: any;
}

/** Gap between thumbnails. The stylesheet sets both a container `gap` and a
 *  per-item `marginRight`, which double-spaces them and made the old
 *  `getItemLayout` length wrong; the margin is overridden to 0 below so one
 *  number describes the pitch and the drag maths can trust it. */
const GAP = 10;

/** How long a finger must rest on a thumbnail before it becomes draggable —
 *  matches the category-strip drag in InfoRegScreen, so the two feel the
 *  same. Short enough not to feel stuck, long enough that a scroll flick
 *  never picks a photo up by accident. */
const DRAG_HOLD_MS = 220;

/** Manages a service's ordered image previews plus the add-image action. */
export function ServiceImageCarousel({
  images,
  onAddImage,
  onRemoveImage,
  onToggleFit,
  onReorder,
  size = 80,
  styles,
}: ServiceImageCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const pitch = size + GAP;

  // ── Drag-to-reorder ────────────────────────────────────────────────────
  // dragIndex is the photo being carried; targetIndex is the slot it would
  // land in if the finger lifted now. Both are mirrored into refs because the
  // PanResponder is created once and its callbacks would otherwise close over
  // the first render's values.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const targetIndexRef = useRef<number | null>(null);
  const armedRef = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragX = useRef(new Animated.Value(0)).current;
  const imagesRef = useRef(images);
  imagesRef.current = images;

  const clearHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  const endDrag = useCallback(() => {
    armedRef.current = false;
    dragIndexRef.current = null;
    targetIndexRef.current = null;
    dragX.setValue(0);
    setDragIndex(null);
    setTargetIndex(null);
  }, [dragX]);

  // Arms on hold rather than on touch-down: the strip still scrolls normally,
  // and only a deliberate press-and-hold hands the gesture to the drag.
  const beginHold = useCallback(
    (index: number) => {
      clearHold();
      holdTimer.current = setTimeout(() => {
        armedRef.current = true;
        dragIndexRef.current = index;
        targetIndexRef.current = index;
        dragX.setValue(0);
        setDragIndex(index);
        setTargetIndex(index);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }, DRAG_HOLD_MS);
    },
    [clearHold, dragX],
  );

  // One responder per thumbnail, NOT one on the ScrollView.
  //
  // A PanResponder spread onto a ScrollView never wins: the ScrollView's own
  // responder claims the gesture on the first movement and the handlers below
  // are simply never asked. The working shape is the opposite — each
  // thumbnail claims the touch on touch-DOWN (so the hold timer can start),
  // then *grants termination back* to the ScrollView the moment it asks,
  // which is what a scroll flick looks like. Once the hold has armed, it
  // refuses to hand over, and the drag owns the gesture from there.
  const makePanResponder = useCallback(
    (index: number) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          // The remove and Fill/Fit buttons sit deeper in the tree, so they
          // claim the touch before this ever sees it — arming here can't
          // swallow their taps.
          beginHold(index);
        },
        // Handing the gesture to the ScrollView is what keeps the strip
        // scrollable; refusing once armed is what makes the drag stick.
        onPanResponderTerminationRequest: () => {
          if (armedRef.current) return false;
          clearHold();
          return true;
        },
        onPanResponderMove: (_evt, gesture) => {
          const from = dragIndexRef.current;
          if (!armedRef.current || from == null) {
            // Moved before the hold landed — that's a scroll, not a drag.
            if (Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6) clearHold();
            return;
          }
          dragX.setValue(gesture.dx);
          const count = imagesRef.current.length;
          const next = Math.max(
            0,
            Math.min(count - 1, Math.round(from + gesture.dx / pitch)),
          );
          if (next !== targetIndexRef.current) {
            targetIndexRef.current = next;
            setTargetIndex(next);
            Haptics.selectionAsync().catch(() => {});
          }
        },
        onPanResponderRelease: () => {
          clearHold();
          const from = dragIndexRef.current;
          const to = targetIndexRef.current;
          if (armedRef.current && from != null && to != null && from !== to) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
              () => {},
            );
            onReorder(from, to);
          }
          endDrag();
        },
        onPanResponderTerminate: () => {
          clearHold();
          endDrag();
        },
      }),
    [beginHold, clearHold, dragX, endDrag, onReorder, pitch],
  );

  // Built once per photo rather than inline in the map: a fresh PanResponder
  // on every render would swap the handlers out from under a gesture that is
  // already in flight, and the drag re-renders on every slot it crosses.
  const responders = useMemo(
    () => images.map((_, index) => makePanResponder(index)),
    [images.length, makePanResponder],
  );

  // Where a thumbnail sits while a drag is in flight. The carried photo
  // follows the finger; everything between its old and new slot slides one
  // place over to open the gap it will drop into.
  const shiftFor = useCallback(
    (index: number): number => {
      if (dragIndex == null || targetIndex == null) return 0;
      if (index === dragIndex) return 0;
      if (dragIndex < targetIndex && index > dragIndex && index <= targetIndex)
        return -pitch;
      if (dragIndex > targetIndex && index >= targetIndex && index < dragIndex)
        return pitch;
      return 0;
    },
    [dragIndex, targetIndex, pitch],
  );

  const handleScroll = useCallback(
    (event: any) => {
      setActiveIndex(Math.round(event.nativeEvent.contentOffset.x / pitch));
    },
    [pitch],
  );

  return (
    <View style={styles.carouselContainer}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        // Frozen mid-drag so the strip doesn't slide out from under the photo
        // being carried.
        scrollEnabled={dragIndex == null}
        contentContainerStyle={styles.carouselContent}
      >
        {images.map((image, index) => {
          const isDragging = index === dragIndex;
          return (
            <Animated.View
              // Keyed by uri, not index: an index key would remount every
              // thumbnail after the list it belongs to reorders, which reads
              // as a flash rather than a move.
              key={`${image.uri}-${index}`}
              {...(responders[index]?.panHandlers ?? {})}
              style={[
                styles.carouselImageContainer,
                {
                  width: size,
                  height: size,
                  marginRight: 0,
                  transform: [
                    { translateX: isDragging ? dragX : shiftFor(index) },
                    { scale: isDragging ? 1.08 : 1 },
                  ],
                  opacity: isDragging ? 0.9 : 1,
                  zIndex: isDragging ? 10 : 0,
                },
              ]}
            >
              <Image
                source={{ uri: image.uri }}
                style={[styles.carouselImage, { width: size, height: size }]}
                // The thumbnail previews the provider's own choice, so the
                // toggle shows its effect here rather than only on the client
                // side where they can't see it.
                contentFit={image.fit}
              />
              <TouchableOpacity
                style={styles.removeImageButton}
                onPress={() => {
                  Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Warning,
                  ).catch(() => {});
                  onRemoveImage(index);
                }}
              >
                <Text style={styles.removeImageIcon}>×</Text>
              </TouchableOpacity>
              {index === 0 && dragIndex == null && (
                <View style={styles.coverBadge}>
                  <Text style={styles.coverBadgeText}>Cover</Text>
                </View>
              )}
              {dragIndex == null && (
                <TouchableOpacity
                  style={styles.fitToggle}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    onToggleFit(index);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.fitToggleText}>
                    {image.fit === 'cover' ? 'Fill' : 'Fit'}
                  </Text>
                </TouchableOpacity>
              )}
            </Animated.View>
          );
        })}
        <TouchableOpacity
          style={[styles.addImageButton, { width: size, height: size }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
              () => {},
            );
            onAddImage();
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.addImageIcon}>+</Text>
          <Text style={styles.addImageText}>Add</Text>
        </TouchableOpacity>
      </ScrollView>
      {images.length > 1 && (
        <Text style={styles.carouselHint}>
          Hold a photo to drag it — the first one leads your service. Tap
          Fill/Fit to choose whether it crops.
        </Text>
      )}
      {images.length > 0 && (
        <View style={styles.carouselDots}>
          {images.map((image, index) => (
            <View
              key={`${image.uri}-${index}`}
              style={[
                styles.carouselDot,
                activeIndex === index && styles.carouselDotActive,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}
