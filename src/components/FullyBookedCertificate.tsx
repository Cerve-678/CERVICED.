// The certificate a provider sees once each time their schedule fills: a
// pop-up on My Profile, with confetti thrown in from both sides of the screen.
// The server decides when a schedule has filled (process_provider_fully_booked_
// alerts); this only shows it.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, Path } from 'react-native-svg';
import { formatLongDateNoYear, MONTH_NAMES_FULL, toLocalDate } from '../utils/dateUtils';

const LIGHT = {
  card: '#FFFFFF',
  accent: '#5C4033',
  onAccent: '#FFFFFF',
  text: '#000000',
  sub: '#5F4B4C',
  label: '#7E6667',
  secondaryBg: '#F5F1EC',
  scrim: 'rgba(26,24,21,0.52)',
};
const DARK = {
  card: '#252220',
  accent: '#AF9197',
  onAccent: '#1A1815',
  text: '#F0ECE7',
  sub: '#D9CFC9',
  label: '#AF9197',
  secondaryBg: '#1A1815',
  scrim: 'rgba(0,0,0,0.55)',
};
const CONFETTI_LIGHT = ['#5C4033', '#AF9197', '#D9C3A5', '#7E6667', '#E9D5D8', '#FFFFFF'];
const CONFETTI_DARK = ['#AF9197', '#D9C3A5', '#F0ECE7', '#7E6667', '#E9D5D8', '#C9A9AF'];
const PIECES = 44;

/** "Every slot you opened for November has been booked." A certificate is
 *  always for a whole month, so the date is that month's last day; anything
 *  else falls back to the date. */
export function fullyBookedLine(throughDate: string): string {
  const through = toLocalDate(throughDate);
  const monthEnd = new Date(through.getFullYear(), through.getMonth() + 1, 0).getDate();
  if (through.getDate() === monthEnd) {
    return `Every slot you opened for ${MONTH_NAMES_FULL[through.getMonth()]} has been booked.`;
  }
  return `Every slot you opened, up to ${formatLongDateNoYear(through)}, has been booked.`;
}

type Piece = {
  fromLeft: boolean;
  top: number;
  width: number;
  height: number;
  radius: number;
  color: string;
  dx: number;
  rise: number;
  fall: number;
  turns: number;
  delay: number;
  duration: number;
};

function makePieces(colors: readonly string[], screenHeight: number): Piece[] {
  return Array.from({ length: PIECES }, (_, i) => {
    const isCircle = i % 5 === 0;
    const isStreamer = i % 7 === 0;
    const size = 7 + ((i * 3) % 6);
    const variant = i % 3;
    return {
      fromLeft: i % 2 === 0,
      top: screenHeight * 0.56 + ((i * 37) % 170),
      width: isStreamer ? 4 : size,
      height: isStreamer ? 20 : isCircle ? size : size * 0.62,
      radius: isCircle ? size / 2 : 2,
      color: colors[i % colors.length] as string,
      dx: [190, 120, 285][variant] as number,
      rise: [300, 410, 210][variant] as number,
      fall: [340, 290, 390][variant] as number,
      turns: [2.1, 1.9, 2.3][variant] as number,
      delay: ((i * 11) % 9) * 35,
      duration: 2500 + ((i * 7) % 5) * 280,
    };
  });
}

function ConfettiPiece({ piece, screenWidth }: { piece: Piece; screenWidth: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: piece.duration,
      delay: piece.delay,
      easing: Easing.bezier(0.12, 0.72, 0.42, 1),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [piece, progress]);

  const sign = piece.fromLeft ? 1 : -1;
  const translateX = progress.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, sign * piece.dx, sign * (piece.dx * 1.3)],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, -piece.rise, piece.fall],
  });
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${sign * piece.turns * 360}deg`],
  });
  const opacity = progress.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: piece.fromLeft ? -14 : screenWidth + 2,
        top: piece.top,
        width: piece.width,
        height: piece.height,
        borderRadius: piece.radius,
        backgroundColor: piece.color,
        opacity,
        transform: [{ translateX }, { translateY }, { rotate }],
      }}
    />
  );
}

type Props = {
  visible: boolean;
  providerName: string;
  throughDate: string;
  filledAt: string;
  isDarkMode: boolean;
  onDone: () => void;
  onManageSchedule: () => void;
};

export default function FullyBookedCertificate({
  visible,
  providerName,
  throughDate,
  filledAt,
  isDarkMode,
  onDone,
  onManageSchedule,
}: Props) {
  const P = isDarkMode ? DARK : LIGHT;
  const { width, height } = useWindowDimensions();
  // null until the setting is read, so confetti never flashes up for someone
  // who has motion turned down.
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const pieces = useMemo(
    () => makePieces(isDarkMode ? CONFETTI_DARK : CONFETTI_LIGHT, height),
    [isDarkMode, height],
  );
  const cardIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { if (active) setReduceMotion(enabled); })
      .catch(() => { if (active) setReduceMotion(false); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; sub.remove(); };
  }, []);

  useEffect(() => {
    if (!visible) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [visible]);

  useEffect(() => {
    if (!visible || reduceMotion === null) return;
    if (reduceMotion) {
      cardIn.setValue(1);
      return;
    }
    cardIn.setValue(0);
    Animated.timing(cardIn, {
      toValue: 1,
      duration: 420,
      easing: Easing.bezier(0.2, 0.8, 0.3, 1),
      useNativeDriver: true,
    }).start();
  }, [visible, reduceMotion, cardIn]);

  const filled = new Date(filledAt);
  const filledOn = `${filled.getDate()} ${MONTH_NAMES_FULL[filled.getMonth()]} ${filled.getFullYear()}`;

  return (
    <Modal
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      visible={visible}
      onRequestClose={onDone}
    >
      <View style={[st.scrim, { backgroundColor: P.scrim }]}>
        <Animated.View
          style={[
            st.column,
            {
              opacity: cardIn,
              transform: [
                { translateY: cardIn.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
                { scale: cardIn.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
              ],
            },
          ]}
        >
          <View style={[st.card, { backgroundColor: P.card }]}>
            <View style={[st.frame, { borderColor: P.accent }]}>
              <Text style={[st.brand, { color: P.accent }]}>CERVICED</Text>
              <Text style={[st.eyebrow, { color: P.label }]}>CERTIFICATE OF</Text>
              <Text style={[st.title, { color: isDarkMode ? P.text : P.accent }]} accessibilityRole="header">
                Fully Booked
              </Text>
              <View style={[st.rule, { backgroundColor: P.accent }]} />
              <Text style={[st.congrats, { color: P.text }]}>Congratulations</Text>
              <Text style={[st.name, { color: P.text }]}>{providerName}</Text>
              <Text style={[st.line, { color: P.sub }]}>{fullyBookedLine(throughDate)}</Text>
              <Svg width={84} height={84} viewBox="0 0 84 84" style={st.seal} accessibilityLabel="CERVICED seal">
                <Circle cx={42} cy={42} r={38} fill="none" stroke={P.accent} strokeWidth={5} strokeDasharray="1 7.95" strokeLinecap="round" />
                <Circle cx={42} cy={42} r={31} fill={P.accent} />
                <Circle cx={42} cy={42} r={26} fill="none" stroke={P.secondaryBg} strokeWidth={1} />
                <Path d="M31 43 L39 51 L54 34" fill="none" stroke={P.secondaryBg} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
              <Text style={[st.date, { color: P.sub }]}>{filledOn}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[st.primary, { backgroundColor: P.accent }]}
            onPress={onDone}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Text style={[st.primaryText, { color: P.onAccent }]}>Done</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.secondary, { backgroundColor: P.card }]}
            onPress={onManageSchedule}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Text style={[st.secondaryText, { color: isDarkMode ? P.text : P.accent }]}>Manage my schedule</Text>
          </TouchableOpacity>
        </Animated.View>

        {visible && reduceMotion === false ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {pieces.map((piece, i) => (
              // Pieces never reorder, and each is regenerated only with the
              // palette, so the index is their identity here.
              <ConfettiPiece key={`piece-${i}`} piece={piece} screenWidth={width} />
            ))}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'center', paddingHorizontal: 22 },
  column: { gap: 14 },
  card: { borderRadius: 22, padding: 10 },
  frame: { borderWidth: 3, borderStyle: 'solid', borderRadius: 14, paddingTop: 28, paddingHorizontal: 22, paddingBottom: 24, alignItems: 'center' },
  brand: { fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 4 },
  eyebrow: { marginTop: 22, fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700', letterSpacing: 2.4 },
  title: { marginTop: 8, fontFamily: 'Prata-Regular', fontSize: 42, lineHeight: 46, textAlign: 'center' },
  rule: { width: 56, height: 1, marginTop: 18 },
  congrats: { marginTop: 18, fontFamily: 'Jura-VariableFont_wght', fontSize: 15, fontWeight: '600' },
  name: { marginTop: 16, fontFamily: 'BakbakOne-Regular', fontSize: 25, lineHeight: 29, textAlign: 'center' },
  line: { marginTop: 12, fontFamily: 'Jura-VariableFont_wght', fontSize: 15, fontWeight: '500', lineHeight: 22, textAlign: 'center' },
  seal: { marginTop: 20 },
  date: { marginTop: 14, fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '600' },
  primary: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: 'BakbakOne-Regular', fontSize: 16 },
  secondary: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 15, fontWeight: '700' },
});
