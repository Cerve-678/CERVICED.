import React, { useCallback, useState } from "react";
import {
  findNodeHandle,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import type { ScrollViewInstance, ViewInstance } from "react-native";
import * as Haptics from "expo-haptics";

import { DynamicText } from "../../components/DynamicText";
import { aboutPreview } from "./aboutPreview";

interface ExpandableAboutTextProps {
  text: string;
  textStyle: StyleProp<TextStyle>;
  /** The touchable around "More" / "Show Less" (alignment). */
  linkStyle: StyleProp<ViewStyle>;
  /** The "More" / "Show Less" label itself. */
  linkTextStyle: StyleProp<TextStyle>;
  /** Provider-written text on a client screen goes through DynamicText so it
   *  translates live when that feature is on. Previews of the provider's own
   *  draft (which may be placeholder copy) leave it off. */
  translate?: boolean;
  /** Called after the text collapses, so the screen can bring the card it
   *  sits in back into view — collapsing a long bio from its bottom would
   *  otherwise leave the reader a screen or more below it. */
  onCollapse?: () => void;
}

/**
 * A provider's About text, clamped to a preview with "More". Once a long text
 * is open it has a "Show Less" at its top as well as its bottom, so a reader
 * who has seen enough near the start doesn't have to scroll through the rest
 * to close it. Short text shows whole, with neither control.
 */
export function ExpandableAboutText({
  text,
  textStyle,
  linkStyle,
  linkTextStyle,
  translate = false,
  onCollapse,
}: ExpandableAboutTextProps) {
  const [expanded, setExpanded] = useState(false);
  const { isLong, collapsed } = aboutPreview(text);
  const shown = isLong && expanded ? text : collapsed;

  const toggle = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    if (expanded) onCollapse?.();
    setExpanded(!expanded);
  }, [expanded, onCollapse]);

  const link = (label: string, extra?: StyleProp<ViewStyle>) => (
    <TouchableOpacity
      onPress={toggle}
      style={[linkStyle, extra]}
      activeOpacity={0.5}
      accessibilityRole="button"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={linkTextStyle}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View>
      {isLong && expanded && link("Show Less", styles.topLink)}
      {translate ? (
        <DynamicText style={textStyle} text={shown} />
      ) : (
        <Text style={textStyle}>{shown}</Text>
      )}
      {isLong && link(expanded ? "Show Less" : "More")}
    </View>
  );
}

/**
 * After an About text collapses, scroll back so its card's top sits just
 * under the header — but only when that top has scrolled out of view. If the
 * card is already on screen nothing moves.
 */
export function revealIfScrolledPast({
  scroll,
  target,
  scrollY,
  topInset,
}: {
  scroll: ScrollViewInstance | null;
  target: ViewInstance | null;
  scrollY: number;
  topInset: number;
}): void {
  if (!scroll || !target) return;
  // Static UIManager.measureLayout with node handles, as ProviderProfileScreen
  // already does for its Services jump — calling measureLayout as a method on
  // the ref logs a "must be called with a ref to a native component" warning.
  const scrollHandle = findNodeHandle(scroll);
  const targetHandle = findNodeHandle(target);
  if (!scrollHandle || !targetHandle) return;
  UIManager.measureLayout(
    targetHandle,
    scrollHandle,
    () => {},
    (_x: number, y: number) => {
      const wanted = Math.max(y - topInset, 0);
      if (wanted < scrollY) scroll.scrollTo({ y: wanted, animated: true });
    },
  );
}

const styles = StyleSheet.create({
  topLink: {
    marginBottom: 10,
  },
});
