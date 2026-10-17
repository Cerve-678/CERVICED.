// src/screens/auth/WelcomeScreen.tsx
import React, { useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { signInWithAppleIdToken } from '../../services/databaseService';
import { useAuth } from '../../contexts/AuthContext';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';
import { ThemedBackground } from '../../components/ThemedBackground';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import WelcomeIntro from '../../components/WelcomeIntro';
import { STORAGE_KEYS } from '../../utils/storageKeys';

type Props = StackScreenProps<RootStackParamList, 'Welcome'>;

export default function WelcomeScreen({ navigation }: Props) {
  const { isDarkMode, palette: t } = useTheme();
  const { isLoggedIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  // Guards re-entrant taps synchronously — `disabled={isAppleLoading}` on the
  // button only takes effect after a re-render, leaving a brief window where
  // a fast double-tap fires handleAppleLogin twice concurrently. A second
  // concurrent AppleAuthentication.signInAsync() call while the first is
  // still in flight rejects (the native sheet is already showing/dismissed),
  // which used to surface a "Sign in failed" alert even though the FIRST
  // call's signInWithIdToken had already succeeded and logged the user in.
  const isAppleInFlightRef = useRef(false);

  const handleSocialLogin = (provider: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Alert.alert('Coming soon', `${provider} login will be available soon.`);
  };

  const handleAppleLogin = async () => {
    if (isAppleInFlightRef.current) return;
    isAppleInFlightRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        Alert.alert('Sign in failed', 'No identity token received from Apple.');
        return;
      }
      setIsAppleLoading(true);
      await signInWithAppleIdToken(credential.identityToken);
      setIsAppleLoading(false);
      // On success, AuthContext.onAuthStateChange handles navigation
    } catch (e: any) {
      // A concurrent/duplicate attempt (or one that lands after the user is
      // already signed in via an earlier in-flight call) must not show a
      // false failure alert — check the real auth state before alerting.
      if (e.code !== 'ERR_REQUEST_CANCELED' && !isLoggedIn) {
        Alert.alert('Sign in failed', 'Something went wrong. Please try again.');
      }
    } finally {
      isAppleInFlightRef.current = false;
    }
  };

  const SERVICE_WORDS = ['HAIR', 'NAILS', 'LASHES', 'BROWS', 'MUA', 'AESTHETICS'];

  // The full intro plays once per device; afterwards the headline just fades
  // in. 'checking' holds the headline back for the one AsyncStorage read so a
  // first-time user doesn't see it flash before the intro starts.
  const reduceMotion = useReducedMotion();
  const [introState, setIntroState] = useState<'checking' | 'playing' | 'done'>('checking');
  const reveal = useSharedValue(0);
  const sortedFlip = useSharedValue(0);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEYS.WELCOME_INTRO_SEEN)
      .catch(() => null)
      .then(seen => {
        if (cancelled) return;
        if (seen || reduceMotion) {
          setIntroState('done');
          return;
        }
        setIntroState('playing');
        AsyncStorage.setItem(STORAGE_KEYS.WELCOME_INTRO_SEEN, '1').catch(() => {});
      });
    return () => { cancelled = true; };
  }, [reduceMotion]);

  useEffect(() => {
    if (introState !== 'done') return;
    if (reduceMotion) {
      reveal.value = 1;
      sortedFlip.value = 1;
      return;
    }
    reveal.value = withTiming(1, { duration: 450 });
    sortedFlip.value = withDelay(500, withTiming(1, { duration: 520 }));
  }, [introState, reduceMotion, reveal, sortedFlip]);

  const revealStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: interpolate(reveal.value, [0, 1], [12, 0]) }],
  }));
  // Same over-the-top flip as the intro's S → C, landing in the accent colour.
  const sortedSStyle = useAnimatedStyle(() => ({
    opacity: sortedFlip.value < 0.5 ? 1 : 0,
    transform: [{ perspective: 400 }, { rotateX: `${interpolate(sortedFlip.value, [0, 0.5], [0, 90], Extrapolation.CLAMP)}deg` }],
  }));
  const sortedSAccentStyle = useAnimatedStyle(() => ({
    opacity: sortedFlip.value >= 0.5 ? 1 : 0,
    transform: [{ perspective: 400 }, { rotateX: `${interpolate(sortedFlip.value, [0.5, 1], [-90, 0], Extrapolation.CLAMP)}deg` }],
  }));

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />

      <View style={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}>
        {introState === 'playing' ? (
          <View style={styles.introArea}>
            <WelcomeIntro palette={t} onFinished={() => setIntroState('done')} />
          </View>
        ) : (
          <Animated.View style={revealStyle} accessible accessibilityLabel="CERVICED. Beauty maintenance, sorted.">
            <Text style={[styles.wordmark, { color: t.text }]}>CERVICED.</Text>
            <View style={styles.headlineBlock}>
              <Text style={[styles.headline, { color: t.text }]}>Beauty</Text>
              <Text style={[styles.headline, { color: t.text }]}>maintenance,</Text>
              <View style={styles.sortedRow}>
                <View>
                  <Animated.Text style={[styles.headline, { color: t.text }, sortedSStyle]}>s</Animated.Text>
                  <Animated.Text style={[styles.headline, styles.letterOverlay, { color: t.accent }, sortedSAccentStyle]}>s</Animated.Text>
                </View>
                <Text style={[styles.headline, { color: t.accent }]}>orted.</Text>
              </View>
            </View>
            <View style={styles.wordsRow}>
              {SERVICE_WORDS.map(w => (
                <Text key={w} style={[styles.word, { color: t.sub }]}>{w}</Text>
              ))}
            </View>
          </Animated.View>
        )}

        <View style={{ flex: 1 }} />

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: t.accent }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); navigation.navigate('SignUpStep1'); }}
            activeOpacity={0.75}
          >
            <Text style={[styles.primaryBtnText, { color: t.onAccent }]}>GET STARTED</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.appleBtn, { backgroundColor: t.text }]}
            onPress={handleAppleLogin}
            activeOpacity={0.75}
            disabled={isAppleLoading}
            accessibilityLabel="Continue with Apple"
          >
            {isAppleLoading ? (
              <ActivityIndicator color={t.bg} />
            ) : (
              <>
                <Ionicons name="logo-apple" size={18} color={t.bg} />
                <Text style={[styles.socialLabel, { color: t.bg }]}>Continue with Apple</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.outlineBtn, { borderColor: t.border }]}
            onPress={() => handleSocialLogin('Google')}
            activeOpacity={0.7}
          >
            <Text style={[styles.socialLabel, { color: t.text }]}>Continue with Google</Text>
          </TouchableOpacity>

          <View style={styles.linksRow}>
            <Text style={[styles.linkText, { color: t.sub }]}>
              Have an account?{' '}
              <Text
                style={[styles.linkStrong, { color: t.accent }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.navigate('Login'); }}
              >
                Log in
              </Text>
            </Text>
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.navigate('ClaimProvider'); }}
              activeOpacity={0.7}
              hitSlop={10}
            >
              <Text style={[styles.linkStrong, { color: t.accent }]}>Claim your listing</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.termsText, { color: t.sub }]}>
            By continuing, you agree to our{' '}
            <Text style={[styles.termsLink, { color: t.accent }]}>Terms of Service</Text>
            {' '}and{' '}
            <Text style={[styles.termsLink, { color: t.accent }]}>Privacy Policy</Text>.
          </Text>
        </View>
      </View>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 24 },
  wordmark: { fontFamily: 'BakbakOne-Regular', fontSize: 18, letterSpacing: 2 },
  introArea: { marginTop: 40 },
  headlineBlock: { marginTop: 64 },
  headline: { fontFamily: 'BakbakOne-Regular', fontSize: 48, lineHeight: 50, letterSpacing: 0.5 },
  sortedRow: { flexDirection: 'row' },
  letterOverlay: { position: 'absolute', left: 0, top: 0 },
  wordsRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, marginTop: 20 },
  word: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '700', letterSpacing: 1.5 },
  actions: { gap: 10 },
  primaryBtn: { minHeight: 56, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 1.5 },
  appleBtn: { minHeight: 56, borderRadius: 100, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  outlineBtn: { minHeight: 56, borderRadius: 100, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  socialLabel: { fontFamily: 'Jura-VariableFont_wght', fontSize: 16, fontWeight: '700' },
  linksRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  linkText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 15 },
  linkStrong: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '700' },
  termsText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, lineHeight: 18, marginTop: 6 },
  termsLink: { fontWeight: '700' },
});
