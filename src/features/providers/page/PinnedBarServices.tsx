// Riviera's pinned Book bar shows their services, not their business name
// (user, 2026-11-23: "shouldn't have business name, and should interchange
// with the service recommendations"). It takes turns through a few of them,
// the cheapest first, fading from one to the next. Shared by the profile and
// Branding's preview so both read the same.

import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Text, View, type StyleProp, type TextStyle } from "react-native";

/** How many services the bar takes turns through. */
export const PINNED_BAR_SERVICE_LIMIT = 5;
/** How long each one shows before the next. */
export const PINNED_BAR_ROTATE_MS = 3500;
const FADE_MS = 280;

/**
 * The services the pinned bar takes turns through: the cheapest first, then
 * the rest in the order the menu lists them. Only priced services, one per
 * name, up to the limit.
 */
export function pinnedBarServices<T extends { name: string; price: number | string }>(
  services: readonly T[],
  limit: number = PINNED_BAR_SERVICE_LIMIT,
): T[] {
  const priced = services.filter(service => {
    const value = Number(service.price);
    return Number.isFinite(value) && value > 0;
  });
  if (priced.length === 0) return [];
  const cheapest = priced.reduce((low, service) => (Number(service.price) < Number(low.price) ? service : low));
  const seen = new Set<string>();
  const picked: T[] = [];
  for (const service of [cheapest, ...priced]) {
    const key = service.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(service);
    if (picked.length >= limit) break;
  }
  return picked;
}

export interface PinnedBarLine {
  /** Keeps the line steady when the list is rebuilt with the same services. */
  key: string;
  name: string;
  /** Under the name: the price, and its length when there is one. */
  detail: string;
}

/** The two lines of text in the bar, taking turns through the services. */
export function PinnedBarServiceText({
  lines,
  nameStyle,
  detailStyle,
}: {
  lines: readonly PinnedBarLine[];
  nameStyle: StyleProp<TextStyle>;
  detailStyle: StyleProp<TextStyle>;
}) {
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;
  const count = lines.length;

  // A new list starts again from the cheapest.
  const listKey = lines.map(line => line.key).join("|");
  useEffect(() => {
    setIndex(0);
    opacity.setValue(1);
  }, [listKey, opacity]);

  useEffect(() => {
    if (count < 2) return undefined;
    let reduceMotion = false;
    AccessibilityInfo.isReduceMotionEnabled().then(on => { reduceMotion = on; }).catch(() => {});
    const timer = setInterval(() => {
      if (reduceMotion) {
        setIndex(current => (current + 1) % count);
        return;
      }
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(({ finished }) => {
        if (!finished) return;
        setIndex(current => (current + 1) % count);
        Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
      });
    }, PINNED_BAR_ROTATE_MS);
    return () => {
      clearInterval(timer);
      opacity.stopAnimation();
    };
  }, [count, opacity]);

  const line = lines[index % Math.max(count, 1)];
  if (!line) return null;
  return (
    <Animated.View style={{ opacity }}>
      <View accessible accessibilityLabel={`${line.name}, ${line.detail}`}>
        <Text style={nameStyle} numberOfLines={1}>{line.name}</Text>
        <Text style={detailStyle} numberOfLines={1}>{line.detail}</Text>
      </View>
    </Animated.View>
  );
}
