// src/screens/auth/WelcomeScreen.tsx
import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = StackScreenProps<RootStackParamList, 'Welcome'>;

export default function WelcomeScreen({ navigation }: Props) {
  const { theme, isDarkMode } = useTheme();
  const { login } = useAuth();
  const insets = useSafeAreaInsets();

  const glassStyle = () => ({
    backgroundColor: isDarkMode
      ? 'rgba(58, 58, 60, 0.6)'
      : 'rgba(255, 255, 255, 0.15)',
    borderTopColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.7)',
    borderLeftColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.5)',
    borderRightColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.2)',
    borderBottomColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.2)',
  });

  const handleSocialLogin = (provider: string) => {
    login({
      name: `${provider} User`,
      email: `${provider.toLowerCase()}@user.com`,
      phone: '',
      dob: '',
      accountType: 'user',
      loginMethod: provider.toLowerCase(),
    });
  };

  return (
    <ThemedBackground style={styles.bg}>
      <StatusBar barStyle={theme.statusBar} translucent />

      <View style={[styles.content, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 20 }]}>
        {/* Branding */}
        <View style={styles.brandSection}>
          <Text style={[styles.brandName, { color: theme.text }]}>Cerviced</Text>
          <Text style={[styles.tagline, { color: theme.secondaryText }]}>
            Beauty at your fingertips
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actionsSection}>
          {/* Sign Up Button */}
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: isDarkMode ? theme.accent : 'rgba(218,112,214,0.35)' }]}
            onPress={() => navigation.navigate('SignUpStep1')}
            activeOpacity={0.8}
          >
            <Text style={[styles.primaryBtnText, { color: isDarkMode ? '#fff' : theme.text }]}>
              SIGN UP
            </Text>
          </TouchableOpacity>

          {/* Log In Button */}
          <TouchableOpacity
            style={[styles.secondaryBtn, glassStyle()]}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.7}
          >
            <Text style={[styles.secondaryBtnText, { color: theme.text }]}>
              LOG IN
            </Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.4)' }]} />
            <Text style={[styles.dividerLabel, { color: theme.secondaryText }]}>OR</Text>
            <View style={[styles.dividerLine, { backgroundColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.4)' }]} />
          </View>

          {/* Social Login */}
          <View style={styles.socialRow}>
            {['Instagram', 'Google', 'Apple'].map(p => (
              <TouchableOpacity
                key={p}
                style={[styles.socialBtn, glassStyle()]}
                onPress={() => handleSocialLogin(p)}
                activeOpacity={0.7}
              >
                <Text style={[styles.socialLabel, { color: theme.text }]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Terms */}
          <Text style={[styles.termsText, { color: theme.secondaryText }]}>
            By continuing, you agree to our{' '}
            <Text style={[styles.termsLink, { color: theme.accent }]}>Terms of Service</Text>
            {' '}and{' '}
            <Text style={[styles.termsLink, { color: theme.accent }]}>Privacy Policy</Text>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 48,
    letterSpacing: 2,
  },
  tagline: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 16,
    marginTop: 8,
    letterSpacing: 0.5,
  },
  actionsSection: {
    paddingBottom: 8,
  },
  primaryBtn: {
    borderRadius: 100,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(218,112,214,0.4)',
  },
  primaryBtnText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 16,
    letterSpacing: 1,
  },
  secondaryBtn: {
    borderRadius: 100,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    marginTop: 12,
  },
  secondaryBtnText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 16,
    letterSpacing: 1,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    letterSpacing: 2,
    marginHorizontal: 16,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 10,
  },
  socialBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 13,
    alignItems: 'center',
    overflow: 'hidden',
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
  termsLink: {
    fontWeight: '700',
  },
});
