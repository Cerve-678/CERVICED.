/**
 * Expo SDK 54 resolves `expo-file-system/legacy` to its TypeScript source when
 * using the bundler resolver. Version 19.0.21 has an upstream
 * `exactOptionalPropertyTypes` incompatibility in an unrelated download helper.
 *
 * Keep this narrow declaration until the Expo dependency is upgraded; it models
 * only the legacy API used by providerRegistrationService at runtime.
 */
declare module 'expo-file-system/legacy' {
  export enum EncodingType {
    UTF8 = 'utf8',
    Base64 = 'base64',
  }

  export function readAsStringAsync(
    fileUri: string,
    options?: { encoding?: EncodingType | 'utf8' | 'base64' },
  ): Promise<string>;
}
