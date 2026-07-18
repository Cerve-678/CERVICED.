// src/screens/auth/WelcomeScreen.tsx
import React from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';
import { ThemedBackground } from '../../components/ThemedBackground';

type Props = StackScreenProps<RootStackParamList, 'Welcome'>;

export default function WelcomeScreen({ navigation }: Props) {
  const { isDarkMode, palette: t } = useTheme();
  const insets = useSafeAreaInsets();

  const handleSocialLogin = (provider: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Alert.alert('Coming soon', `${provider} login will be available soon.`);
  };

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />

      <View style={[styles.content, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 24 }]}>
        {/* Branding */}
        <View style={styles.brandSection}>
          <Text style={[styles.brandName, { color: t.text }]}>CERVICED.</Text>
          <Text style={[styles.tagline, { color: t.sub }]}>
            Beauty maintenance at your fingertips
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actionsSection}>
          {/* Sign Up */}
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: t.accent }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); navigation.navigate('SignUpStep1'); }}
            activeOpacity={0.75}
          >
            <Text style={styles.primaryBtnText}>SIGN UP</Text>
          </TouchableOpacity>

          {/* Log In */}
          <TouchableOpacity
            style={[styles.secondaryBtn, { backgroundColor: t.surface, borderColor: t.border }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.navigate('Login'); }}
            activeOpacity={0.75}
          >
            <Text style={[styles.secondaryBtnText, { color: t.text }]}>LOG IN</Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: t.border }]} />
            <Text style={[styles.dividerLabel, { color: t.sub }]}>OR</Text>
            <View style={[styles.dividerLine, { backgroundColor: t.border }]} />
          </View>

          {/* Social Login */}
          <View style={styles.socialRow}>
            {['Instagram', 'Google', 'Apple'].map(p => (
              <TouchableOpacity
                key={p}
                style={[styles.socialBtn, { backgroundColor: t.surface, borderColor: t.border }]}
                onPress={() => handleSocialLogin(p)}
                activeOpacity={0.7}
              >
                <Text style={[styles.socialLabel, { color: t.text }]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Terms */}
          <Text style={[styles.termsText, { color: t.sub }]}>
            By continuing, you agree to our{' '}
            <Text style={[styles.termsLink, { color: t.accent }]}>Terms of Service</Text>
            {' '}and{' '}
            <Text style={[styles.termsLink, { color: t.accent }]}>Privacy Policy</Text>
          </Text>
        </View>
      </View>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  brandSection: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 175,
  },
  brandName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 44,
    letterSpacing: 2,
  },
  tagline: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 15,
    marginTop: 8,
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  actionsSection: {
    paddingBottom: 8,
  },
  primaryBtn: {
    height: 50,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  primaryBtnText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    letterSpacing: 1,
    color: '#FFFFFF',
  },
  secondaryBtn: {
    height: 50,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    letterSpacing: 1,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    letterSpacing: 2,
    marginHorizontal: 16,
  },
  socialRow: { flexDirection: 'row', gap: 10 },
  socialBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 13,
    alignItems: 'center',
  },
  socialLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '600',
  },
  termsText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 20,
  },
  termsLink: { fontWeight: '700' },
});
