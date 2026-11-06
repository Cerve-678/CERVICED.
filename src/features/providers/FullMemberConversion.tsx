// src/features/providers/FullMemberConversion.tsx
// Full-screen "converting your profile" moment, shown inside
// BecomeFullMemberSheet's modal once the provider confirms. It runs the real
// switch, then reads the real go-live checklist, and paces the seven steps so
// they can be read (the server call itself takes about a second).
//
// The switch never ticks ahead of the server: step one only completes once
// become_full_member() has succeeded. myBookingMode is left alone until
// "Finish going live", because flipping it swaps the link-only tabs this
// screen lives in for the full set and would unmount it mid-animation.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useSystemBottomInset } from '../../utils/bottomSafeGap';
import { toUserMessageAllowingDbGuard } from '../../utils/userFacingError';
import { logger } from '../../utils/logger';
import { isDarkColor, withAlpha } from '../../constants/providerThemes';
import { FULL_MEMBER_FREE_START_LINE } from '../../constants/fullMembership';
import TabIcon from '../../components/TabIcon';
import { FocusAwareStatusBar } from '../../components/FocusAwareStatusBar';
import { fetchGoLiveStatus, type GoLiveStatus } from './goLiveStatus';
import {
  buildConversionSteps,
  CONVERSION_TAB_TICK_AFTER_STEP,
  countLeftToGoLive,
  FULL_MEMBER_NOW_YOU_CAN,
} from './conversionSteps';

export type ConversionPhase = 'working' | 'done' | 'failed';

const STEP_MS = 800;
const HOLD_MS = 700;
const REDUCED_STEP_MS = 120;
const REDUCED_HOLD_MS = 250;

// The link-only tab set, and what each becomes for a full member — the same
// order and icons as ProviderTabNavigator.
const TABS: { from: [string, string]; to: [string, string] }[] = [
  { from: ['house', 'Home'], to: ['chat-dots', 'Becca'] },
  { from: ['grid-layout', 'Portfolio'], to: ['calendar-today', 'Home'] },
  { from: ['chat-dots', 'Messages'], to: ['grid-layout', 'My Services'] },
  { from: ['user', 'Profile'], to: ['user', 'Profile'] },
];

interface FullMemberConversionProps {
  /** Tapped "Finish going live" (or Android back on the done screen). */
  onFinish: () => void;
  /** Tapped "Not now" after a failed switch. */
  onCancel: () => void;
  onPhaseChange: (phase: ConversionPhase) => void;
}

interface ServerResult {
  /** Null when the switch worked but the checklist read failed: the done
   *  screen then leaves out the count rather than guess it. */
  status: GoLiveStatus | null;
}

export function FullMemberConversion({ onFinish, onCancel, onPhaseChange }: FullMemberConversionProps) {
  const { palette: P } = useTheme();
  const { becomeFullMember } = useAuth();
  const insets = useSafeAreaInsets();
  const bottomInset = useSystemBottomInset();

  const [phase, setPhase] = useState<ConversionPhase>('working');
  const [result, setResult] = useState<ServerResult | null>(null);
  const [stepsDone, setStepsDone] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const startedAt = useRef(Date.now());
  const running = useRef(false);
  const mounted = useRef(true);

  const stepMs = reduceMotion ? REDUCED_STEP_MS : STEP_MS;
  const steps = useMemo(() => buildConversionSteps(result?.status?.isLive ?? null), [result]);
  const total = steps.length;

  useEffect(() => {
    mounted.current = true;
    AccessibilityInfo.isReduceMotionEnabled().then(on => { if (mounted.current) setReduceMotion(on); }).catch(() => {});
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    onPhaseChange(phase);
    if (phase === 'done') AccessibilityInfo.announceForAccessibility("You're a full member.");
    if (phase === 'failed') AccessibilityInfo.announceForAccessibility("We couldn't finish switching you over.");
  }, [phase, onPhaseChange]);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    startedAt.current = Date.now();
    setPhase('working');
    setStepsDone(0);
    setResult(null);
    setFailure(null);
    try {
      await becomeFullMember();
    } catch (err) {
      running.current = false;
      if (!mounted.current) return;
      setFailure(toUserMessageAllowingDbGuard(err, 'Check your connection, then try again.', '[BecomeFullMember]'));
      setPhase('failed');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    // The switch has happened. A failed checklist read only costs the count
    // on the done screen, never the switch itself.
    let status: GoLiveStatus | null = null;
    try {
      status = await fetchGoLiveStatus();
    } catch (err) {
      logger.warn('[BecomeFullMember] go-live status after the switch:', err);
    }
    running.current = false;
    if (mounted.current) setResult({ status });
  }, [becomeFullMember]);

  useEffect(() => { void run(); }, [run]);

  // One step at a time. Step one is the server call, so nothing ticks until
  // it has answered; after that each step gets stepMs on screen.
  useEffect(() => {
    if (phase !== 'working') return;
    if (stepsDone >= total) {
      const t = setTimeout(() => {
        setPhase('done');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }, reduceMotion ? REDUCED_HOLD_MS : HOLD_MS);
      return () => clearTimeout(t);
    }
    if (!result) return;
    const delay = stepsDone === 0 ? Math.max(0, stepMs - (Date.now() - startedAt.current)) : stepMs;
    const t = setTimeout(() => setStepsDone(d => d + 1), delay);
    return () => clearTimeout(t);
  }, [phase, stepsDone, total, result, stepMs, reduceMotion]);

  // The loading line runs toward the end of the current step.
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (phase !== 'working') return;
    if (stepsDone === 0) progress.setValue(0);
    Animated.timing(progress, {
      toValue: Math.min(stepsDone + 1, total) / total,
      duration: stepMs,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  }, [phase, stepsDone, total, stepMs, progress]);

  const leadIndex = Math.min(stepsDone, total - 1);
  const leadFade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    leadFade.setValue(0);
    Animated.timing(leadFade, { toValue: 1, duration: reduceMotion ? 0 : 320, useNativeDriver: true }).start();
  }, [leadIndex, leadFade, reduceMotion]);

  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    appear.setValue(0);
    Animated.timing(appear, { toValue: 1, duration: reduceMotion ? 0 : 280, useNativeDriver: true }).start();
  }, [phase, appear, reduceMotion]);

  const fg = P.onAccent;
  const faint = withAlpha(fg, 0.35);
  const styles = useMemo(() => createStyles(P.accent, fg), [P.accent, fg]);
  const left = result?.status ? countLeftToGoLive(result.status) : null;
  const isLive = result?.status?.isLive ?? false;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16, paddingBottom: bottomInset + 16 }]} accessibilityViewIsModal>
      {/* Follows the foreground, not the mode: some branding sets put a dark
          onAccent on a pale accent in light mode. */}
      <FocusAwareStatusBar barStyle={isDarkColor(fg) ? 'dark-content' : 'light-content'} />
      <Animated.View style={[styles.flex, { opacity: appear }]}>
        {phase === 'working' && (
          <>
            <View style={styles.square}>
              <View style={styles.squareHead}>
                <Text style={styles.squareKicker}>SWITCHING TO CERVICED</Text>
                <Text style={styles.squareKicker}>{stepsDone >= total ? 'DONE' : `${stepsDone + 1} OF ${total}`}</Text>
              </View>
              <Animated.Text
                style={[styles.lead, {
                  opacity: leadFade,
                  transform: [{ translateY: leadFade.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
                }]}
                accessibilityLiveRegion="polite"
              >
                {steps[leadIndex]?.lead}
              </Animated.Text>
              <View style={styles.track}>
                <Animated.View style={[styles.fill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
              </View>
            </View>

            <View style={styles.steps}>
              {steps.map((step, i) => {
                const done = i < stepsDone;
                const active = i === stepsDone;
                return (
                  <View
                    key={step.label}
                    style={[styles.step, !done && !active && styles.pending]}
                    accessible
                    accessibilityLabel={`${step.label}, ${done ? 'done' : active ? 'in progress' : 'waiting'}`}
                  >
                    {done ? (
                      <View style={styles.tick}><Ionicons name="checkmark" size={14} color={P.accent} /></View>
                    ) : active ? (
                      <View style={styles.ring}><ActivityIndicator size="small" color={fg} /></View>
                    ) : (
                      <View style={[styles.ring, { borderColor: faint, borderWidth: 1.5 }]} />
                    )}
                    <Text style={styles.stepText}>{step.label}</Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.flex} />
            <View style={styles.tabs} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {TABS.map((tab, i) => (
                <MockTab
                  key={tab.to[1] + i}
                  ticked={stepsDone >= (CONVERSION_TAB_TICK_AFTER_STEP[i] ?? total)}
                  from={tab.from}
                  to={tab.to}
                  accent={P.accent}
                  onAccent={fg}
                  reduceMotion={reduceMotion}
                />
              ))}
            </View>
          </>
        )}

        {phase === 'done' && (
          <>
            <Text style={styles.kicker}>YOU'RE A FULL MEMBER</Text>
            <Text style={styles.title}>You can now</Text>
            <View style={styles.nowList}>
              {FULL_MEMBER_NOW_YOU_CAN.map(line => (
                <View key={line} style={styles.step}>
                  <View style={styles.tick}><Ionicons name="checkmark" size={14} color={P.accent} /></View>
                  <Text style={[styles.stepText, styles.nowText]}>{line}</Text>
                </View>
              ))}
            </View>
            {left !== null && left > 0 && (
              <View style={styles.leftRow}>
                <Text style={styles.leftNumber}>{left}</Text>
                <Text style={styles.leftWord}>{left === 1 ? 'thing to check to go live' : 'things to check to go live'}</Text>
              </View>
            )}
            {result?.status && (
              <View style={styles.pill}>
                <View style={styles.dot} />
                <Text style={styles.pillText}>{isLive ? 'LIVE ON SEARCH' : 'NOT ON SEARCH YET'}</Text>
              </View>
            )}
            {!isLive && <Text style={styles.note}>{FULL_MEMBER_FREE_START_LINE}</Text>}
            <View style={styles.flex} />
            <TouchableOpacity
              style={styles.cta}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}); onFinish(); }}
              activeOpacity={0.75}
              accessibilityRole="button"
            >
              <Text style={styles.ctaText}>{isLive ? 'Go to Home' : 'Finish going live'}</Text>
            </TouchableOpacity>
          </>
        )}

        {phase === 'failed' && (
          <>
            <View style={styles.alert} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Ionicons name="alert" size={30} color={fg} /></View>
            <Text style={styles.failTitle}>We couldn't finish switching you over.</Text>
            <Text style={styles.note}>{failure}</Text>
            <View style={styles.flex} />
            <TouchableOpacity
              style={styles.cta}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); void run(); }}
              activeOpacity={0.75}
              accessibilityRole="button"
            >
              <Text style={styles.ctaText}>Try again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ghost}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onCancel(); }}
              activeOpacity={0.55}
              accessibilityRole="button"
            >
              <Text style={styles.ghostText}>Not now</Text>
            </TouchableOpacity>
          </>
        )}
      </Animated.View>
    </View>
  );
}

interface MockTabProps {
  ticked: boolean;
  from: [string, string];
  to: [string, string];
  accent: string;
  onAccent: string;
  reduceMotion: boolean;
}

function MockTab({ ticked, from, to, accent, onAccent, reduceMotion }: MockTabProps) {
  const pop = useRef(new Animated.Value(ticked ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) { pop.setValue(ticked ? 1 : 0); return; }
    Animated.spring(pop, { toValue: ticked ? 1 : 0, friction: 5, tension: 140, useNativeDriver: true }).start();
  }, [ticked, pop, reduceMotion]);
  const [icon, label] = ticked ? to : from;
  return (
    <View style={tabStyles.tab}>
      <View>
        <TabIcon name={icon} size={18} color={accent} />
        <Animated.View style={[tabStyles.badge, { backgroundColor: accent, transform: [{ scale: pop }] }]}>
          <Ionicons name="checkmark" size={9} color={onAccent} />
        </Animated.View>
      </View>
      <Text style={[tabStyles.label, { color: accent }]} numberOfLines={1}>{label.toUpperCase()}</Text>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  badge: { position: 'absolute', top: -5, right: -9, width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: 'BakbakOne-Regular', fontSize: 9, letterSpacing: 0.3 },
});

function createStyles(accent: string, fg: string) {
  return StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: accent, paddingHorizontal: 20 },
    square: {
      backgroundColor: fg, borderRadius: 24, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 18,
      shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 6,
    },
    squareHead: { flexDirection: 'row', justifyContent: 'space-between' },
    squareKicker: { fontFamily: 'BakbakOne-Regular', fontSize: 10, letterSpacing: 1.5, color: accent, opacity: 0.7 },
    lead: { fontFamily: 'BakbakOne-Regular', fontSize: 23, lineHeight: 26, color: accent, marginTop: 8, minHeight: 52 },
    track: { height: 5, borderRadius: 3, marginTop: 12, backgroundColor: withAlpha(accent, 0.16), overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 3, backgroundColor: accent },
    steps: { marginTop: 14 },
    step: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 },
    pending: { opacity: 0.55 },
    tick: { width: 22, height: 22, borderRadius: 11, backgroundColor: fg, alignItems: 'center', justifyContent: 'center' },
    ring: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    stepText: { flex: 1, fontSize: 14, lineHeight: 18, color: fg },
    tabs: {
      height: 58, borderRadius: 100, backgroundColor: fg, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6,
      shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6,
    },
    kicker: { fontFamily: 'BakbakOne-Regular', fontSize: 10, letterSpacing: 1.5, color: fg, opacity: 0.7 },
    title: { fontFamily: 'BakbakOne-Regular', fontSize: 28, lineHeight: 32, color: fg, marginTop: 8 },
    nowList: { marginTop: 8 },
    nowText: { fontSize: 15 },
    leftRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 22 },
    leftNumber: { fontFamily: 'BakbakOne-Regular', fontSize: 54, lineHeight: 58, color: fg },
    leftWord: { fontFamily: 'BakbakOne-Regular', fontSize: 15, lineHeight: 18, color: fg, opacity: 0.9, maxWidth: 150 },
    pill: {
      flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10,
      borderRadius: 100, paddingVertical: 5, paddingHorizontal: 10, backgroundColor: withAlpha(fg, 0.16),
    },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: fg },
    pillText: { fontFamily: 'BakbakOne-Regular', fontSize: 10, letterSpacing: 1.2, color: fg },
    note: { fontSize: 14, lineHeight: 20, color: fg, opacity: 0.85, marginTop: 12 },
    alert: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: fg, alignItems: 'center', justifyContent: 'center' },
    failTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 34, lineHeight: 38, color: fg, marginTop: 18 },
    cta: { height: 52, borderRadius: 100, backgroundColor: fg, alignItems: 'center', justifyContent: 'center' },
    ctaText: { fontFamily: 'BakbakOne-Regular', fontSize: 16, color: accent },
    ghost: { height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    ghostText: { fontFamily: 'BakbakOne-Regular', fontSize: 14, color: fg, opacity: 0.8 },
  });
}
