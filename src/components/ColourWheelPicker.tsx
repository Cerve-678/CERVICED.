// ColourWheelPicker.tsx
// Any colour, three ways: drag on the shade square (how much colour, how
// light), drag along the hue bar (which colour), or type an exact hex code
// for a brand colour. Used by Branding → Custom for each of the set's three
// colours.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { hexToHsv, hsvToHex, parseHexInput, type Hsv } from '../utils/color';

const SQUARE_HEIGHT = 168;
const HUE_BAR_HEIGHT = 24;
const THUMB = 24;
// Seven stops so the bar runs red → yellow → green → cyan → blue → magenta → red.
const HUE_STOPS = ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'] as const;

export interface ColourWheelPickerProps {
  /** '#RRGGBB' */
  value: string;
  onChange: (hex: string) => void;
  /** True while a finger is dragging on the square or bar, so the screen
   *  around it can stop scrolling under the drag. */
  onDraggingChange?: ((dragging: boolean) => void) | undefined;
  textColor: string;
  subColor: string;
  borderColor: string;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

const ColourWheelPicker: React.FC<ColourWheelPickerProps> = ({
  value, onChange, onDraggingChange, textColor, subColor, borderColor,
}) => {
  // HSV is kept here rather than re-derived from the hex each render: at
  // black or grey the hex has no hue, so deriving it would snap the hue bar
  // back to red the moment the shade thumb touches an edge.
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [hexText, setHexText] = useState(value);
  const [squareWidth, setSquareWidth] = useState(0);
  const [barWidth, setBarWidth] = useState(0);
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;

  // A colour set from outside (a photo swatch, switching which colour is being
  // edited) moves the thumbs; our own drags already match, so they're left be.
  useEffect(() => {
    if (hsvToHex(hsvRef.current) !== value) setHsv(hexToHsv(value));
    setHexText(value);
  }, [value]);

  const commit = useCallback((next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    setHexText(hex);
    onChange(hex);
  }, [onChange]);

  const onSquare = useCallback((x: number, y: number) => {
    if (squareWidth === 0) return;
    commit({ h: hsvRef.current.h, s: clamp01(x / squareWidth), v: 1 - clamp01(y / SQUARE_HEIGHT) });
  }, [commit, squareWidth]);

  const onBar = useCallback((x: number) => {
    if (barWidth === 0) return;
    commit({ ...hsvRef.current, h: clamp01(x / barWidth) * 359.999 });
  }, [commit, barWidth]);

  const squareGesture = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin(e => { onDraggingChange?.(true); onSquare(e.x, e.y); })
    .onUpdate(e => onSquare(e.x, e.y))
    .onFinalize(() => onDraggingChange?.(false));

  const barGesture = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin(e => { onDraggingChange?.(true); onBar(e.x); })
    .onUpdate(e => onBar(e.x))
    .onFinalize(() => onDraggingChange?.(false));

  const onHexText = useCallback((text: string) => {
    setHexText(text);
    const parsed = parseHexInput(text);
    if (parsed) {
      setHsv(hexToHsv(parsed));
      onChange(parsed);
    }
  }, [onChange]);

  const pureHue = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <View>
      <GestureDetector gesture={squareGesture}>
        <View
          style={[styles.square, { backgroundColor: pureHue, borderColor }]}
          onLayout={(e: LayoutChangeEvent) => setSquareWidth(e.nativeEvent.layout.width)}
          accessibilityLabel="Shade: drag across for more colour, down for darker"
        >
          <LinearGradient colors={['#FFFFFF', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['rgba(0,0,0,0)', '#000000']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
          {squareWidth > 0 && (
            <View
              pointerEvents="none"
              style={[
                styles.thumb,
                {
                  left: hsv.s * squareWidth - THUMB / 2,
                  top: (1 - hsv.v) * SQUARE_HEIGHT - THUMB / 2,
                  backgroundColor: value,
                },
              ]}
            />
          )}
        </View>
      </GestureDetector>

      <GestureDetector gesture={barGesture}>
        <View
          style={[styles.hueBar, { borderColor }]}
          onLayout={(e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width)}
          accessibilityLabel="Colour: drag along to change the colour"
        >
          <LinearGradient colors={HUE_STOPS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[StyleSheet.absoluteFill, styles.hueFill]} />
          {barWidth > 0 && (
            <View
              pointerEvents="none"
              style={[styles.thumb, styles.hueThumb, { left: (hsv.h / 360) * barWidth - THUMB / 2, backgroundColor: pureHue }]}
            />
          )}
        </View>
      </GestureDetector>

      <View style={styles.hexRow}>
        <View style={[styles.hexSwatch, { backgroundColor: value, borderColor }]} />
        <Text style={[styles.hexLabel, { color: subColor }]}>HEX</Text>
        <TextInput
          value={hexText}
          onChangeText={onHexText}
          onBlur={() => setHexText(value)}
          autoCapitalize="characters"
          autoCorrect={false}
          spellCheck={false}
          maxLength={7}
          placeholder="#D98BA6"
          placeholderTextColor={subColor}
          style={[styles.hexInput, { color: textColor, borderColor }]}
          accessibilityLabel="Hex colour code"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  square: {
    height: SQUARE_HEIGHT,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
  },
  hueBar: {
    height: HUE_BAR_HEIGHT,
    marginTop: 14,
    borderRadius: HUE_BAR_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  hueFill: {
    borderRadius: HUE_BAR_HEIGHT / 2,
  },
  hueThumb: {
    top: (HUE_BAR_HEIGHT - THUMB) / 2,
  },
  hexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  hexSwatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hexLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    letterSpacing: 1.2,
  },
  hexInput: {
    flex: 1,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});

export default ColourWheelPicker;
