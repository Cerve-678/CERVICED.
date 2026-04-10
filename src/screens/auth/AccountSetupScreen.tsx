 // src/screens/auth/AccountSetupScreen.tsx
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import { useAuth } from '../../contexts/AuthContext';
import type { UserData } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = StackScreenProps<RootStackParamList, 'AccountSetup'>;

/**
 * Shown immediately after email OTP verification.
 * Explicitly calls setSession() with the tokens returned from verifyOtp()
 * so the Supabase client has a confirmed session before entering the app.
 * This prevents the "session expired" error on the provider registration page.
 */
export default function AccountSetupScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const { login } = useAuth();
  const { userData, accessToken, refreshToken }: { userData: UserData; accessToken: string; refreshToken: string } = route.params as any;
  const hasNavigated = useRef(false);

  useEffect(() => {
    async function setupSession() {
      try {
        // Explicitly set the session using the tokens from verifyOtp().
        // This bypasses AsyncStorage timing issues entirely.
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error || !data.session) {
          throw new Error('Could not confirm session.');
        }

        if (!hasNavigated.current) {
          hasNavigated.current = true;
          login(userData);
        }
      } catch (e: any) {
        if (!hasNavigated.current) {
          hasNavigated.current = true;
          Alert.alert(
            'Account Created!',
            'Your account is ready. Please log in to continue.',
            [{ text: 'Log In', onPress: () => navigation.navigate('Login') }]
          );
        }
      }
    }

    setupSession();
  }, []);

  return (
    <ThemedBackground style={styles.container}>
      <View style={styles.inner}>
        <ActivityIndicator size="large" color="#a342c3" />
        <Text style={[styles.title, { color: theme.text }]}>Setting up your account</Text>
        <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
          Just a moment while we get everything ready…
        </Text>
      </View>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
