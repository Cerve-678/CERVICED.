import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { logger } from '../utils/logger';

const BIOMETRIC_ENABLED_KEY = '@biometric_enabled';
const BIOMETRIC_TOKEN_KEY = '@biometric_refresh_token';

export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = hasHardware ? await LocalAuthentication.isEnrolledAsync() : false;
    if (!hasHardware || !isEnrolled) {
      logger.warn(`Biometrics unavailable: hasHardware=${hasHardware} isEnrolled=${isEnrolled}`);
    }
    return hasHardware && isEnrolled;
  } catch (e: any) {
    // Neither call site currently catches errors from this function, so a
    // thrown error here was previously an unhandled rejection that silently
    // looked identical to a clean "false" result — logging it so a false
    // negative (device has Face ID, this still reports unavailable) is
    // diagnosable without an intrusive user-facing alert.
    logger.error(`isBiometricAvailable() threw: ${e?.message ?? String(e)}`);
    return false;
  }
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
