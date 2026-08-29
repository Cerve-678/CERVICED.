import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Dimensions,
  ScrollView,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
  PanResponder,
  Platform,
} from 'react-native';
// expo-image instead of RN's Image — see PortfolioCard.tsx for why (Explore's
// masonry grid is unvirtualized, so caching matters more here than elsewhere).
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useBookmarkStore } from '../stores/useBookmarkStore';
import { PortfolioItem } from '../types/providers';
import TabIcon from './TabIcon';
import Icon from './IconLibrary';
import { fonts, spacing } from '../constants/PlatformDimensions';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ImageDetailModalProps {
  visible: boolean;
  item: PortfolioItem | null;
  onClose: () => void;
  onViewProfile: (
    providerId: string,
    providerName: string,
    providerService: string,
    providerLogo: any,
  ) => void;
  onBookNow: (
    providerId: string,
    providerName: string,
    providerService: string,
    providerLogo: any,
    serviceId?: string,
  ) => void;
  /** Pool to draw "More Like This" suggestions from — typically the caller's
   *  currently-loaded feed. Optional so the modal still works for callers
   *  that don't have a pool handy; the section just won't render. */
  similarItems?: PortfolioItem[];
  /** Swaps the modal to show a different item without closing it, so tapping
   *  a "More Like This" suggestion reads as browsing onward rather than
   *  starting over. */
  onSelectItem?: (item: PortfolioItem) => void;
}

export const ImageDetailModal = ({
  visible,
  item,
  onClose,
  onViewProfile,
  onBookNow,
  similarItems,
  onSelectItem,
}: ImageDetailModalProps) => {
  const { isDarkMode, palette: P } = useTheme();
  const { isPortfolioSaved, savePortfolioItem, unsavePortfolioItem } =
    useBookmarkStore();

  // Anchored to whichever item the modal was *opened* with, not whatever's
  // currently displayed — tapping a suggestion swaps `item` in place (see
  // onSelectItem), and re-scoring/re-sorting relative to the newly-displayed
  // photo on every tap reshuffled the whole row out from under the user
  // (items appearing to swap or disappear a few positions from the one they
  // just tapped). Only refreshes on a fresh open, not on every in-modal hop.
  const [anchorItem, setAnchorItem] = useState<PortfolioItem | null>(null);
  useEffect(() => {
    if (visible) setAnchorItem(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Same category as the anchor item (portfolio photos and services both
  // eligible — an aesthetics service should be able to surface other
  // aesthetics services, not just bare aesthetics photos), different item,
  // ranked by shared tags first (a rough proxy for "similar look" without
  // needing real image-similarity infra) and different-provider matches
  // next — so this surfaces other providers doing similar work rather than
  // just repeating the same provider's other shots.
  // The row itself stays completely static once computed — selecting a
  // thumbnail swaps the main image but never removes or reorders anything
  // here, only the anchor item (the one the modal was opened with) is left
  // out, since suggesting a photo as similar to itself doesn't make sense.
  const { items: moreLikeThis, isFallback: moreLikeThisIsFallback } =
    useMemo(() => {
      const anchor = anchorItem ?? item;
      if (!anchor || !similarItems || similarItems.length === 0)
        return { items: [], isFallback: false };

      const eligibleKind = (si: PortfolioItem) =>
        si.kind == null || si.kind === 'portfolio' || si.kind === 'service';
      const currentTags = new Set(anchor.tags ?? []);
      const rank = (pool: PortfolioItem[]) =>
        pool
          .map((si) => {
            const sharedTags = (si.tags ?? []).filter((t) =>
              currentTags.has(t),
            ).length;
            const differentProvider =
              si.providerId !== anchor.providerId ? 1 : 0;
            return { si, score: sharedTags * 2 + differentProvider };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 12)
          .map((s) => s.si);

      const sameCategory = similarItems.filter(
        (si) =>
          si.id !== anchor.id &&
          si.category === anchor.category &&
          eligibleKind(si),
      );
      if (sameCategory.length > 0) {
        return { items: rank(sameCategory), isFallback: false };
      }
      // Nothing in this category — fall back to a broader pool under a
      // different heading rather than hiding the section outright.
      const anyCategory = similarItems.filter(
        (si) => si.id !== anchor.id && eligibleKind(si),
      );
      return { items: rank(anyCategory), isFallback: true };
    }, [anchorItem, item, similarItems]);

  // Jumping to a different photo (via a "More Like This" tap) swaps `item`
  // in place without closing the modal — without this, the content
  // ScrollView kept whatever scroll position it was at for the *previous*
  // photo, so the new one could open already scrolled past its info card.
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (visible) scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [item?.id, visible]);

  // Navigating straight after onClose() loses the push. This <Modal> is a
  // native pageSheet — a presented view controller sitting on top of the
  // navigation controller — so a navigate() issued while it is still
  // dismissing lands on a stack that is not yet in charge of the screen and
  // is silently dropped. Same failure this app already hit with
  // ExploreNavigator's fullScreenModal group swallowing card pushes; the
  // symptom is identical (a tap that simply does nothing).
  //
  // So: stash the navigation, close, and run it once the dismissal has
  // actually finished. onDismiss is iOS-only, hence the Platform fallback.
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  const runPendingNavigation = () => {
    const pending = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    pending?.();
  };
  const closeThen = (navigate: () => void) => {
    pendingNavigationRef.current = navigate;
    onClose();
    if (Platform.OS !== 'ios') {
      // Android's Modal never fires onDismiss — a frame after the close is
      // enough for it to be off the screen stack.
      requestAnimationFrame(runPendingNavigation);
    }
  };

  if (!item) return null;

  const hasProvider = !!item.providerName;

  const isSaved = isPortfolioSaved(item.id);
  // A specific bookable service (has its own serviceId) goes straight to
  // Book Now; a bare portfolio/provider photo has nothing specific to book,
  // so its primary action is viewing the provider instead.
  const isBookableService = item.kind === 'service';

  const handleBookmark = () => {
    if (isSaved) {
      unsavePortfolioItem(item.id);
    } else {
      savePortfolioItem(item.id);
    }
  };

  const handleViewProfile = () => {
    if (!hasProvider) return;
    const logoSource = item.providerLogoUri
      ? { uri: item.providerLogoUri }
      : null;
    closeThen(() =>
      onViewProfile(
        item.providerSlug ?? item.providerId,
        item.providerName ?? '',
        item.category,
        logoSource,
      ),
    );
  };

  const handleBookNow = () => {
    if (!hasProvider) return;
    const logoSource = item.providerLogoUri
      ? { uri: item.providerLogoUri }
      : null;
    // Always goes to the profile first, own account or not — the
    // can't-book-yourself toast is raised there on arrival, so the client
    // still lands somewhere useful instead of being stopped in the modal.
    closeThen(() =>
      onBookNow(
        item.providerSlug ?? item.providerId,
        item.providerName ?? '',
        item.category,
        logoSource,
        item.serviceId,
      ),
    );
  };

  return (
    <Modal
      visible={visible}
      presentationStyle="pageSheet"
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={runPendingNavigation}
    >
      {/* Modal content renders into its own native surface, separate from
          the app's root — the outer SafeAreaProvider (App.tsx) doesn't
          measure it, so useSafeAreaInsets() here would return stale/zero
          values without its own nested provider. See ProviderProfileScreen
          and InfoRegScreen for the same pattern used elsewhere. */}
      <SafeAreaProvider>
        <ModalBody
          item={item}
          palette={P}
          isDarkMode={isDarkMode}
          hasProvider={hasProvider}
          isSaved={isSaved}
          isBookableService={isBookableService}
          moreLikeThis={moreLikeThis}
          moreLikeThisIsFallback={moreLikeThisIsFallback}
          scrollRef={scrollRef}
          onClose={onClose}
          onSelectItem={onSelectItem}
          handleBookmark={handleBookmark}
          handleViewProfile={handleViewProfile}
          handleBookNow={handleBookNow}
        />
      </SafeAreaProvider>
    </Modal>
  );
};

// Full-width paged carousel for the modal's hero image. Reports its active
// page up via onIndexChange so the pagination dots — rendered separately,
// pinned to a fixed screen position (see ModalBody) rather than layered on
// the image itself — always stay in sync and always stay visible regardless
// of scroll position. Resets to the first photo whenever `itemKey` changes
// (i.e. the modal is now showing a different card) rather than preserving
// whatever page a previously-viewed service was left on.
interface CarouselController {
  scrollToOffset: (offset: number, animated: boolean) => void;
}

const ImageCarousel: React.FC<{
  images: PortfolioItem['image'][];
  height: number;
  /** Framing for the photo at `index` — the provider's own per-photo choice
   *  where there is one, otherwise the caller's mixed-ratio fallback. */
  fitFor: (index: number) => 'cover' | 'contain';
  backgroundColor: string;
  itemKey: string;
  initialIndex: number;
  controllerRef: React.MutableRefObject<CarouselController | null>;
  onIndexChange: (index: number) => void;
}> = ({
  images,
  height,
  fitFor,
  backgroundColor,
  itemKey,
  initialIndex,
  controllerRef,
  onIndexChange,
}) => {
  const listRef = useRef<FlatList<PortfolioItem['image']>>(null);
  const activeIndexRef = useRef(initialIndex);

  useEffect(() => {
    activeIndexRef.current = initialIndex;
    onIndexChange(initialIndex);
    listRef.current?.scrollToOffset({
      offset: initialIndex * SCREEN_WIDTH,
      animated: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey]);

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    activeIndexRef.current = index;
    onIndexChange(index);
  };

  useEffect(() => {
    controllerRef.current = {
      scrollToOffset: (offset, animated) => {
        listRef.current?.scrollToOffset({ offset, animated });
      },
    };
    return () => {
      controllerRef.current = null;
    };
  }, [controllerRef]);

  return (
    <FlatList
        ref={listRef}
        data={images}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onMomentumScrollEnd}
        keyExtractor={(_, i) => `${itemKey}-${i}`}
        style={{ width: SCREEN_WIDTH, height }}
        getItemLayout={(_, i) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * i,
          index: i,
        })}
      // Opens on whichever photo was actually tapped (see initialImageIndex
      // in ModalBody), not always the first — needs getItemLayout above to
      // jump there without first measuring everything in between.
        initialScrollIndex={initialIndex}
      // Without these, FlatList's defaults (initialNumToRender: 10) mount
      // and start loading every photo in a multi-photo service at once —
      // only the photo actually shown needs to load immediately; the rest
      // can load lazily as the user swipes.
        initialNumToRender={1}
        windowSize={3}
        maxToRenderPerBatch={2}
        renderItem={({ item: source, index }) => (
        // source is PortfolioItem['image'] (RN's broad ImageSourcePropType)
        // but always constructed as { uri: string } — see PortfolioCard.tsx
        // for why this narrowing is needed for expo-image's stricter type.
        <Image
          source={{ uri: (source as { uri: string }).uri }}
          style={{ width: SCREEN_WIDTH, height, backgroundColor }}
          contentFit={fitFor(index)}
          transition={0}
        />
        )}
    />
  );
};

interface ModalBodyProps {
  item: PortfolioItem;
  palette: ReturnType<typeof useTheme>['palette'];
  isDarkMode: boolean;
  hasProvider: boolean;
  isSaved: boolean;
  isBookableService: boolean;
  moreLikeThis: PortfolioItem[];
  moreLikeThisIsFallback: boolean;
  scrollRef: React.RefObject<ScrollView | null>;
  onClose: () => void;
  onSelectItem?: ((item: PortfolioItem) => void) | undefined;
  handleBookmark: () => void;
  handleViewProfile: () => void;
  handleBookNow: () => void;
}

function ModalBody({
  item,
  palette: P,
  isDarkMode,
  hasProvider,
  isSaved,
  isBookableService,
  moreLikeThis,
  moreLikeThisIsFallback,
  scrollRef,
  onClose,
  onSelectItem,
  handleBookmark,
  handleViewProfile,
  handleBookNow,
}: ModalBodyProps) {
  const insets = useSafeAreaInsets();
  // The carousel gets ONE height for the whole photo set, taken from the
  // set's median ratio — not from `item.aspectRatio`, which is only the
  // ratio of the photo that happened to be tapped. Explore fans a service
  // into one card per photo (see mapDbServiceToCards), so sizing off the
  // tapped card meant the same service opened at a different height
  // depending on which photo you came in through, and every other photo in
  // the set was then cover-cropped to fit it. The median is stable whichever
  // card is the entry point, and it's the ratio that leaves the set as a
  // whole least distorted.
  //
  // A single-photo item (every portfolio and provider card) has a
  // one-element set, so its median IS its own ratio and nothing about those
  // changes.
  const setRatios =
    item.imageAspectRatios && item.imageAspectRatios.length > 0
      ? item.imageAspectRatios.filter((r) => Number.isFinite(r) && r > 0)
      : [item.aspectRatio];
  const boxRatio = useMemo(() => {
    const sorted = [...setRatios].sort((a, b) => a - b);
    if (sorted.length === 0) return item.aspectRatio;
    const mid = Math.floor(sorted.length / 2);
    // Even count: average the middle pair rather than picking arbitrarily,
    // so a two-photo set sits between its two shapes instead of snapping to
    // the taller one.
    return sorted.length % 2 === 1
      ? (sorted[mid] as number)
      : (((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setRatios.join(','), item.aspectRatio]);
  // Capped so a very tall/narrow photo doesn't push the card off-screen. The
  // cap is generous (0.85 of the screen, not 0.6) so the box tracks real
  // proportions almost always.
  const imageHeight = Math.min(SCREEN_HEIGHT * 0.85, SCREEN_WIDTH / boxRatio);
  // With one box for a mixed-ratio set, "cover" would crop whichever photos
  // don't match the median — the exact thing this is fixing — so those sets
  // letterbox against the surface colour instead. A set whose photos all
  // share a shape (and every single-photo item) still fills the box edge to
  // edge, because there "contain" and "cover" resolve identically.
  const setHasMixedRatios = setRatios.some(
    (r) => Math.abs(r - boxRatio) > 0.01,
  );
  // Per photo, the provider's stored choice wins outright — that control
  // exists precisely so the app stops deciding this for them. Only where
  // there's no choice to honour (a portfolio photo, or a service saved before
  // the column existed) does the mixed-ratio fallback above apply.
  const fitFor = (index: number): 'cover' | 'contain' =>
    item.imageFits?.[index] ?? (setHasMixedRatios ? 'contain' : 'cover');
  // How much of the photo's bottom the card visually rests on at open —
  // the card is an absolutely-positioned layer painted in front of the
  // image (see the image/ScrollView stacking below), so it now scrolls up
  // *over* the photo rather than starting its scrollable region beneath
  // it. Kept small so only a little scrolling is needed to bring
  // additional content (description, More Like This) into view.
  const CARD_OVERLAP = 64;
  // Full photo set when this is a service card (see PortfolioItem.images);
  // anything else (portfolio/provider cards) only ever has the one photo.
  const images =
    item.images && item.images.length > 0 ? item.images : [item.image];
  // Explore fans each service photo into its own PortfolioItem, ids suffixed
  // `__<index>` (see mapDbServiceToCards) — start the carousel on whichever
  // photo the user actually tapped, not always the service's first photo.
  const initialImageIndex = useMemo(() => {
    const match = /__(\d+)$/.exec(item.id);
    const idx = match ? parseInt(match[1] ?? '0', 10) : 0;
    return idx >= 0 && idx < images.length ? idx : 0;
  }, [item.id, images.length]);
  const [activeImageIndex, setActiveImageIndex] = useState(initialImageIndex);
  const activeImageIndexRef = useRef(initialImageIndex);
  const carouselRef = useRef<CarouselController | null>(null);
  const panStartOffsetRef = useRef(0);
  const pendingCarouselOffsetRef = useRef<number | null>(null);
  const carouselFrameRef = useRef<number | null>(null);

  const cancelPendingCarouselFrame = useCallback(() => {
    if (carouselFrameRef.current !== null) {
      cancelAnimationFrame(carouselFrameRef.current);
      carouselFrameRef.current = null;
    }
    pendingCarouselOffsetRef.current = null;
  }, []);

  const trackCarouselOffset = useCallback((offset: number) => {
    // PanResponder can emit more move events than the display can paint.
    // Coalescing them to one native FlatList update per frame keeps the image
    // attached to the finger without flooding the JS/native bridge.
    pendingCarouselOffsetRef.current = offset;
    if (carouselFrameRef.current !== null) return;
    carouselFrameRef.current = requestAnimationFrame(() => {
      carouselFrameRef.current = null;
      const nextOffset = pendingCarouselOffsetRef.current;
      pendingCarouselOffsetRef.current = null;
      if (nextOffset !== null) {
        carouselRef.current?.scrollToOffset(nextOffset, false);
      }
    });
  }, []);

  useEffect(() => cancelPendingCarouselFrame, [cancelPendingCarouselFrame]);

  useEffect(() => {
    activeImageIndexRef.current = initialImageIndex;
  }, [initialImageIndex]);

  const carouselPanResponder = useMemo(
    () =>
      PanResponder.create({
        // This transparent surface covers only the exposed image, never the
        // card, so it can own a gallery gesture without affecting card scroll.
        // This view sits above the card so it must claim the touch from the
        // start; waiting for a move lets the overlapping ScrollView consume
        // the gesture before the carousel ever sees it.
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          cancelPendingCarouselFrame();
          panStartOffsetRef.current = activeImageIndexRef.current * SCREEN_WIDTH;
        },
        onPanResponderMove: (_, gesture) => {
          const maxOffset = (images.length - 1) * SCREEN_WIDTH;
          const offset = Math.max(
            0,
            Math.min(maxOffset, panStartOffsetRef.current - gesture.dx),
          );
          trackCarouselOffset(offset);
        },
        onPanResponderRelease: (_, gesture) => {
          cancelPendingCarouselFrame();
          const maxIndex = images.length - 1;
          // A light, unmistakably horizontal flick or a short drag commits
          // one page. Anything smaller settles back to the page it began on.
          const isDeliberateSwipe =
            Math.abs(gesture.dx) >= SCREEN_WIDTH * 0.09 ||
            Math.abs(gesture.vx) >= 0.18;
          const startIndex = Math.round(panStartOffsetRef.current / SCREEN_WIDTH);
          const isTap = Math.abs(gesture.dx) < 8 && Math.abs(gesture.dy) < 8;
          const rawIndex = isTap
            ? startIndex + (gesture.x0 < SCREEN_WIDTH / 2 ? -1 : 1)
            : isDeliberateSwipe
              ? startIndex + (gesture.dx < 0 ? 1 : -1)
              : startIndex;
          const nextIndex = Math.max(0, Math.min(maxIndex, rawIndex));
          activeImageIndexRef.current = nextIndex;
          setActiveImageIndex(nextIndex);
          carouselRef.current?.scrollToOffset(nextIndex * SCREEN_WIDTH, true);
        },
        onPanResponderTerminate: () => {
          cancelPendingCarouselFrame();
          carouselRef.current?.scrollToOffset(
            activeImageIndexRef.current * SCREEN_WIDTH,
            true,
          );
        },
      }),
    [cancelPendingCarouselFrame, images.length, trackCarouselOffset],
  );

  return (
    <View style={[styles.container, { backgroundColor: P.bg }]}>
      {/* Close button */}
      <TouchableOpacity
        style={[styles.closeButton, { top: insets.top + 12 }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
            () => {},
          );
          onClose();
        }}
        activeOpacity={0.65}
      >
        <BlurView
          intensity={60}
          tint={isDarkMode ? 'dark' : 'light'}
          style={styles.iconBlur}
        >
          <Text style={[styles.closeText, { color: P.text }]}>✕</Text>
        </BlurView>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.saveButton, { top: insets.top + 12 }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
            () => {},
          );
          handleBookmark();
        }}
        activeOpacity={0.65}
      >
        <BlurView
          intensity={60}
          tint={isDarkMode ? 'dark' : 'light'}
          style={styles.iconBlur}
        >
          <TabIcon
            name="heart"
            size={16}
            // highlightColor (pale blue-grey) barely reads against the photo/
            // blur — same fixed bright-pink "favourited" fix as PortfolioCard's heart.
            color={isSaved ? '#FF2D78' : '#FFFFFF'}
          />
        </BlurView>
      </TouchableOpacity>

      {/* Pagination dots — pinned to a constant screen position, a sibling
          of the ScrollView rather than inside it, so they're always in the
          same spot and never scroll away with the image. */}
      {images.length > 1 && (
        <View
          style={[styles.carouselDotsWrap, { top: insets.top + 56 }]}
          pointerEvents="none"
        >
          <View style={styles.carouselDotsScrim}>
            {images.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.carouselDot,
                  { width: activeImageIndex === i ? 18 : 6 },
                  {
                    backgroundColor:
                      activeImageIndex === i
                        ? '#FFFFFF'
                        : 'rgba(255,255,255,0.5)',
                  },
                ]}
              />
            ))}
          </View>
        </View>
      )}

      {/* Keep the original two-layer composition: the image stays fixed behind
          the card, while the card scrolls over it. `box-none` is the key to
          making the carousel usable without changing that visual overlap —
          the empty photo area passes touches through to the FlatList below,
          but the card remains a normal vertical ScrollView. */}
      <View style={[styles.imageLayer, { height: imageHeight }]}>
        <ImageCarousel
          images={images}
          height={imageHeight}
          fitFor={fitFor}
          backgroundColor={P.surface}
          itemKey={item.id}
          initialIndex={initialImageIndex}
          controllerRef={carouselRef}
          onIndexChange={(index) => {
            activeImageIndexRef.current = index;
            setActiveImageIndex(index);
          }}
        />
      </View>
      {images.length > 1 && (
        <>
          <View
            style={[
              styles.carouselTapZones,
              { height: imageHeight - CARD_OVERLAP },
            ]}
            {...carouselPanResponder.panHandlers}
          />
          {/* Visual cue only — the full exposed image remains the swipe/tap
              target, so these never steal the gesture. */}
          <View
            pointerEvents="none"
            style={[
              styles.carouselArrowRow,
              { height: imageHeight - CARD_OVERLAP },
            ]}
          >
            <View style={styles.carouselArrow}>
              <Text style={styles.carouselArrowText}>‹</Text>
            </View>
            <View style={styles.carouselArrow}>
              <Text style={styles.carouselArrowText}>›</Text>
            </View>
          </View>
        </>
      )}
      <ScrollView
        ref={scrollRef}
        style={styles.cardScroll}
        pointerEvents="box-none"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.contentContainer,
          { paddingTop: imageHeight - CARD_OVERLAP },
        ]}
        bounces
        alwaysBounceVertical
      >
        {/* paddingBottom lives on the card itself (not the ScrollView's
            content container) so the card's own background extends all the
            way to the bottom of the safe area. */}
        <View
          style={[
            styles.infoCard,
            {
              backgroundColor: P.card,
              paddingBottom: insets.bottom + 24,
            },
          ]}
        >
          {/* Provider row — tapping it opens the profile, so this row
              covers what the old separate "View Profile" button did
              without adding a second button that led somewhere very
              similar to Book Now. */}
          {hasProvider && (
            <TouchableOpacity
              style={styles.providerRow}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                  () => {},
                );
                handleViewProfile();
              }}
              activeOpacity={0.5}
            >
              {item.providerLogoUri ? (
                <Image
                  source={{ uri: item.providerLogoUri }}
                  style={[
                    styles.providerLogo,
                    { backgroundColor: P.surface },
                  ]}
                  contentFit="cover"
                  transition={0}
                />
              ) : (
                <View
                  style={[
                    styles.providerLogo,
                    { backgroundColor: P.surface },
                  ]}
                />
              )}
              <View style={styles.providerInfo}>
                <Text style={[styles.providerName, { color: P.text }]}>
                  {item.providerName}
                </Text>
                {item.providerRating != null && (
                  <View style={styles.ratingRow}>
                    <TabIcon name="star" size={12} color="#FFD700" />
                    <Text style={[styles.ratingText, { color: P.text }]}>
                      {item.providerRating}
                    </Text>
                    {item.providerReviewCount != null && (
                      <Text
                        style={[
                          styles.reviewCount,
                          { color: P.sub },
                        ]}
                      >
                        ({item.providerReviewCount})
                      </Text>
                    )}
                  </View>
                )}
              </View>
              <View
                style={[
                  styles.categoryChip,
                  { backgroundColor: P.secondary },
                ]}
              >
                <Text style={[styles.categoryText, { color: '#3F1E36' }]}>
                  {item.category}
                </Text>
              </View>
              <Icon
                name="chevron-right"
                size={16}
                color={P.sub}
                style={styles.providerChevron}
              />
            </TouchableOpacity>
          )}

          {/* Primary action — label/icon/haptic depend on what this card
              actually is: a specific bookable service goes straight to
              Book Now, a bare portfolio or provider photo has nothing
              specific to book yet, so it goes to View Profile instead
              (in addition to the provider row above also doing that). */}
          {hasProvider && (
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  Haptics.impactAsync(
                    isBookableService
                      ? Haptics.ImpactFeedbackStyle.Heavy
                      : Haptics.ImpactFeedbackStyle.Medium,
                  ).catch(() => {});
                  if (isBookableService) handleBookNow();
                  else handleViewProfile();
                }}
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.bookNowInner,
                    { backgroundColor: P.accent },
                  ]}
                >
                  <TabIcon
                    name={isBookableService ? 'basket-shopping' : 'user'}
                    size={14}
                    color={P.onAccent}
                  />
                  <Text style={[styles.bookNowText, { color: P.onAccent }]}>
                    {isBookableService
                      ? 'Book Now'
                      : item.isUnclaimed
                        ? 'View & Claim'
                        : 'View Profile'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {(hasProvider || item.serviceName != null || item.price != null) && (
            <View style={[styles.divider, { backgroundColor: P.border }]} />
          )}

          {/* Service name and price share a row so price reads as directly
              attached to the service it's for, with description as
              supporting text below both — this now comes before "More Like
              This" so the actual service being viewed is described first. */}
          {(item.serviceName || item.price) && (
            <View style={styles.nameRow}>
              {item.serviceName && (
                <Text
                  style={[styles.serviceName, { color: P.text }]}
                  numberOfLines={2}
                >
                  {item.serviceName}
                </Text>
              )}
              {item.price && (
                <Text style={[styles.price, { color: P.accentText }]}>
                  {item.price}
                </Text>
              )}
            </View>
          )}

          {item.caption && (
            <Text style={[styles.caption, { color: P.text }]}>
              {item.caption}
            </Text>
          )}

          {/* Tags */}
          {item.tags && item.tags.length > 0 && (
            <View style={styles.tagsRow}>
              {item.tags.slice(0, 5).map((tag) => (
                <View
                  key={tag}
                  style={[
                    styles.tag,
                    { backgroundColor: P.secondary },
                  ]}
                >
                  <Text style={[styles.tagText, { color: '#3F1E36' }]}>
                    #{tag}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* More Like This — after the service's own details rather than
              before them, so the thing the user actually opened is
              described first. Heading swaps to "You Might Also Like" when
              there's nothing in the same category (moreLikeThisIsFallback),
              so the section doesn't claim to be "more like this" when it
              isn't actually category-matched. */}
          {moreLikeThis.length > 0 && (
            <>
              <Text
                style={[
                  styles.sectionTitle,
                  { color: P.text, marginTop: spacing.md },
                ]}
              >
                {moreLikeThisIsFallback
                  ? 'You Might Also Like'
                  : 'More Like This'}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.moreLikeThisRow}
              >
                {moreLikeThis.map((si) => (
                  <TouchableOpacity
                    key={si.id}
                    style={styles.moreLikeThisCard}
                    onPress={() => {
                      Haptics.impactAsync(
                        Haptics.ImpactFeedbackStyle.Light,
                      ).catch(() => {});
                      onSelectItem?.(si);
                    }}
                    activeOpacity={0.5}
                  >
                    <Image
                      source={{ uri: (si.image as { uri: string }).uri }}
                      style={[
                        styles.moreLikeThisImage,
                        { backgroundColor: P.surface },
                      ]}
                      contentFit="cover"
                      transition={0}
                    />
                    {si.providerName && (
                      <Text
                        style={[
                          styles.moreLikeThisProvider,
                          { color: P.sub },
                        ]}
                        numberOfLines={1}
                      >
                        {si.providerName}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fills the native pageSheet's own presented area (presentationStyle on
  // the Modal) — the OS handles the sheet chrome/safe-area positioning.
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
  },
  closeText: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Pinned to a constant screen position (top-left, below the safe area) —
  // a sibling of the ScrollView, not inside it, so it's always in the same
  // spot regardless of scroll position and never scrolls away.
  carouselDotsWrap: {
    position: 'absolute',
    left: 16,
    zIndex: 20,
  },
  // Dark scrim pill behind the dots so they stay legible over light/busy
  // photos instead of relying on translucency alone.
  carouselDotsScrim: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  carouselDot: {
    height: 6,
    borderRadius: 3,
  },
  imageLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  // Invisible, dedicated hit areas above the exposed part of the image. They
  // deliberately stop at the card overlap so the card's vertical scrolling
  // and its original visual stacking remain untouched.
  carouselTapZones: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    zIndex: 5,
  },
  carouselArrowRow: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 6,
  },
  carouselArrow: {
    width: 34,
    height: 52,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.24)',
  },
  carouselArrowText: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '300',
    lineHeight: 38,
    marginTop: -3,
  },
  // This stays above the image visually, but box-none lets taps in its empty
  // top padding fall through to the carousel's native FlatList.
  cardScroll: {
    ...StyleSheet.absoluteFillObject,
  },
  // flexGrow ensures the card's background fills the whole scrollable area
  // even when there's little content, instead of the sheet's white/dark
  // background stopping short and showing the modal's base background
  // through the remaining space.
  contentContainer: {
    flexGrow: 1,
  },
  iconBlur: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  saveButton: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 10,
  },
  infoCard: {
    flexGrow: 1,
    padding: spacing.lg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  providerLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  providerInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  providerName: {
    fontSize: fonts.providerName,
    fontWeight: '700',
    fontFamily: 'BakbakOne-Regular',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Jura-VariableFont_wght',
  },
  reviewCount: {
    fontSize: 11,
    fontFamily: 'Jura-VariableFont_wght',
  },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Jura-VariableFont_wght',
    letterSpacing: 0.5,
  },
  providerChevron: {
    marginLeft: spacing.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  serviceName: {
    flex: 1,
    fontSize: fonts.title.small,
    fontWeight: '700',
    fontFamily: 'BakbakOne-Regular',
  },
  caption: {
    fontSize: fonts.body.medium,
    fontFamily: 'Jura-VariableFont_wght',
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  price: {
    fontSize: fonts.title.small,
    fontWeight: '700',
    fontFamily: 'BakbakOne-Regular',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.md,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  tagText: {
    fontSize: 10,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginVertical: spacing.md,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    borderRadius: 100,
    overflow: 'hidden',
  },
  bookNowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  bookNowText: {
    fontSize: fonts.buttonText.medium,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'BakbakOne-Regular',
  },
  sectionTitle: {
    fontSize: fonts.body.medium,
    fontWeight: '700',
    fontFamily: 'BakbakOne-Regular',
    marginBottom: spacing.sm,
  },
  moreLikeThisRow: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  moreLikeThisCard: {
    width: 110,
  },
  moreLikeThisImage: {
    width: 110,
    height: 140,
    borderRadius: 14,
    marginBottom: 4,
  },
  moreLikeThisProvider: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Jura-VariableFont_wght',
  },
});
