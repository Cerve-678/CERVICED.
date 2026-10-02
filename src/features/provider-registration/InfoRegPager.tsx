import React, { forwardRef, useCallback, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import type { InfoRegSection, InfoRegSectionKey } from './infoRegSections';

interface InfoRegPagerProps {
  sections: readonly InfoRegSection[];
  activeIndex: number;
  pageWidth: number;
  scrollEnabled: boolean;
  colors: {
    background: string;
    border: string;
    accent: string;
    mutedText: string;
    onAccent: string;
  };
  onActiveIndexChange: (index: number) => void;
  onSectionPress: (key: InfoRegSectionKey) => void;
  children: React.ReactNode;
}

/**
 * Owns all horizontal-navigation behaviour for Info Reg. Form pages remain
 * mounted as children, so swiping never discards unsaved input.
 */
export const InfoRegPager = forwardRef<ScrollView, InfoRegPagerProps>(
  function InfoRegPager(
    {
      sections,
      activeIndex,
      pageWidth,
      scrollEnabled,
      colors,
      onActiveIndexChange,
      onSectionPress,
      children,
    },
    ref,
  ) {
    const [lineEnds, setLineEnds] = useState<{ first: number; last: number } | null>(null);

    const recordEnd = useCallback(
      (index: number, isLast: boolean) => (event: LayoutChangeEvent) => {
        if (index !== 0 && !isLast) return;
        const { x, width } = event.nativeEvent.layout;
        const center = x + width / 2;
        setLineEnds(previous => ({
          first: index === 0 ? center : previous?.first ?? center,
          last: isLast ? center : previous?.last ?? center,
        }));
      },
      [],
    );

    const handleMomentumEnd = useCallback(
      (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (pageWidth <= 0) return;
        const rawIndex = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
        const index = Math.max(0, Math.min(sections.length - 1, rawIndex));
        onActiveIndexChange(index);
      },
      [onActiveIndexChange, pageWidth, sections.length],
    );

    const lineWidth = lineEnds ? Math.max(0, lineEnds.last - lineEnds.first) : 0;
    const progress = sections.length > 1 ? activeIndex / (sections.length - 1) : 0;

    return (
      <View style={styles.root}>
        <View
          style={styles.waypointRow}
          accessibilityRole="tablist"
          accessibilityLabel="Profile setup sections"
        >
          <View
            pointerEvents="none"
            style={[
              styles.track,
              { backgroundColor: colors.border },
              lineEnds && { left: lineEnds.first, right: undefined, width: lineWidth },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.fill,
              { backgroundColor: colors.accent },
              lineEnds
                ? { left: lineEnds.first, width: lineWidth * progress }
                : { width: `${progress * 100}%` },
            ]}
          />
          {sections.map((section, index) => {
            const current = index === activeIndex;
            const visited = index < activeIndex;
            return (
              <TouchableOpacity
                key={section.key}
                onPress={() => onSectionPress(section.key)}
                onLayout={recordEnd(index, index === sections.length - 1)}
                hitSlop={{ top: 10, bottom: 10 }}
                style={styles.waypointButton}
                activeOpacity={0.6}
                accessibilityRole="tab"
                accessibilityState={{ selected: current }}
                accessibilityLabel={`${section.num} ${section.title}`}
              >
                <View
                  style={[
                    styles.chip,
                    { backgroundColor: colors.background, borderColor: colors.border },
                    visited && { borderColor: colors.accent },
                    current && {
                      backgroundColor: colors.accent,
                      borderColor: colors.accent,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 3 },
                      shadowOpacity: 0.28,
                      shadowRadius: 8,
                      elevation: 3,
                    },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.chipText,
                      { color: colors.mutedText },
                      visited && { color: colors.accent },
                      current && { color: colors.onAccent, fontSize: 11 },
                    ]}
                  >
                    {section.short}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <ScrollView
          ref={ref}
          horizontal
          pagingEnabled
          style={styles.pager}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleMomentumEnd}
          scrollEventThrottle={16}
          scrollEnabled={scrollEnabled}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  root: { flex: 1 },
  waypointRow: {
    position: 'relative',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  track: {
    position: 'absolute',
    left: 30,
    right: 30,
    top: 24,
    height: 2,
    borderRadius: 1,
  },
  fill: {
    position: 'absolute',
    left: 30,
    top: 24,
    height: 2,
    borderRadius: 1,
  },
  waypointButton: { alignItems: 'center', zIndex: 1 },
  chip: {
    height: 26,
    paddingHorizontal: 9,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1.5,
  },
  chipText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 10,
  },
  pager: { flex: 1 },
});
