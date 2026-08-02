import { Alert } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const BIOMETRIC_ENABLED_KEY = '@biometric_enabled';
const BIOMETRIC_TOKEN_KEY = '@biometric_refresh_token';

export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = hasHardware ? await LocalAuthentication.isEnrolledAsync() : false;
    if (!hasHardware || !isEnrolled) {
      // TEMPORARY DIAGNOSTIC — remove once we confirm why this returns false
      // on a device that has Face ID enrolled at the OS level. Kept as a
      // visible Alert rather than a log line: still being debugged live on
      // a physical device with no attached console.
      Alert.alert('Face ID debug', `hasHardware=${hasHardware}\nisEnrolled=${isEnrolled}`);
    }
    return hasHardware && isEnrolled;
  } catch (e: any) {
    // TEMPORARY DIAGNOSTIC — remove once confirmed working. Neither call site
    // currently catches errors from this function, so a thrown error here was
    // previously an unhandled rejection that silently looked identical to a
    // clean "false" result — this is very likely the actual bug.
    Alert.alert('Face ID debug', `isBiometricAvailable() threw: ${e?.message ?? String(e)}`);
    return false;
  }
}

// TEMPORARY DIAGNOSTIC — returns every raw check as its own line, each
// independently try/caught, so a single failing call doesn't hide the rest.
// Meant to be wired to a button the user taps on demand (the actual Face ID
// toggle Switch is `disabled` when unavailable, so it never fires onPress —
// this needs its own always-tappable entry point). Remove once resolved.
export async function getBiometricDebugInfo(): Promise<string> {
  const lines: string[] = [];
  try {
    lines.push(`hasHardware: ${await LocalAuthentication.hasHardwareAsync()}`);
  } catch (e: any) { lines.push(`hasHardware ERROR: ${e?.message ?? String(e)}`); }
  try {
    lines.push(`isEnrolled: ${await LocalAuthentication.isEnrolledAsync()}`);
  } catch (e: any) { lines.push(`isEnrolled ERROR: ${e?.message ?? String(e)}`); }
  try {
    lines.push(`supportedTypes: ${JSON.stringify(await LocalAuthentication.supportedAuthenticationTypesAsync())}`);
  } catch (e: any) { lines.push(`supportedTypes ERROR: ${e?.message ?? String(e)}`); }
  try {
    lines.push(`enrolledLevel: ${await LocalAuthentication.getEnrolledLevelAsync()}`);
  } catch (e: any) { lines.push(`enrolledLevel ERROR: ${e?.message ?? String(e)}`); }
  return lines.join('\n');
}

export async function getBiometricLabel(): Promise<string> {
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'Face ID';
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'Touch ID';
  return 'Biometrics';
}

export async function isBiometricEnabled(): Promise<boolean> {
  const val = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
  return val === 'true';
}

export async function enableBiometric(refreshToken: string): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_TOKEN_KEY, refreshToken);
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
}

export async function updateBiometricToken(refreshToken: string): Promise<void> {
  const enabled = await isBiometricEnabled();
  if (!enabled) return;
  await SecureStore.setItemAsync(BIOMETRIC_TOKEN_KEY, refreshToken);
}

export async function disableBiometric(): Promise<void> {
  await SecureStore.deleteItemAsync(BIOMETRIC_TOKEN_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
}

export async function getBiometricRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(BIOMETRIC_TOKEN_KEY);
}

export async function authenticateWithBiometrics(label: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: `Sign in with ${label}`,
    cancelLabel: 'Use password',
    disableDeviceFallback: false,
  });
  return result.success;
}
