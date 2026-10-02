import Constants from 'expo-constants';
import { logger } from './logger';

export interface EnvConfig {
  API_URL: string;
  APP_ENV: 'development' | 'staging' | 'production';
  DEBUG_MODE: boolean;
  STRIPE_PAYMENTS_ENABLED: boolean;
  BECCA_AI_ENABLED: boolean;
  TRANSLATION_ENABLED: boolean;
  TRANSLATION_API_KEY: string;
  TRANSLATION_API_URL: string;
  APP_VERSION: string;
  BUILD_NUMBER: string;
}

class EnvironmentService {
  private config: EnvConfig;

  constructor() {
    this.config = {
      API_URL: process.env['EXPO_PUBLIC_API_URL'] || 'https://api.yourapp.com',
      APP_ENV: (process.env['EXPO_PUBLIC_APP_ENV'] as EnvConfig['APP_ENV']) || 'development',
      DEBUG_MODE: process.env['EXPO_PUBLIC_DEBUG_MODE'] === 'true',
      // Kept opt-in until the matching Edge Functions and Stripe account are
      // deployed. This never exposes a payment secret — it only chooses the
      // already compiled native payment-sheet route.
      STRIPE_PAYMENTS_ENABLED: process.env['EXPO_PUBLIC_STRIPE_PAYMENTS_ENABLED'] === 'true',
      // Becca's AI routing is opt-in per build. Off, she runs deterministic
      // matching only — exactly the behaviour shipped today. This never puts a
      // model secret in the bundle: the key stays an Edge Function secret and
      // the app only ever calls `becca-ai`. See BECCA_AI_INTEGRATION.md.
      BECCA_AI_ENABLED: process.env['EXPO_PUBLIC_BECCA_AI_ENABLED'] === 'true',
      // Live translation of provider-WRITTEN content (bios, service names,
      // notes) via a paid, metered external API. Opt-in per build AND requires
      // a key — both must be present or the app degrades to showing the
      // original text with no network call. SECURITY: an EXPO_PUBLIC_* key is
      // inlined into the client bundle and is therefore extractable; before
      // this handles real traffic the key should move behind an Edge Function
      // (exactly how becca-ai / the Stripe functions keep their secrets
      // server-side). See src/services/dynamicTranslationService.ts.
      TRANSLATION_ENABLED: process.env['EXPO_PUBLIC_TRANSLATION_ENABLED'] === 'true',
      TRANSLATION_API_KEY: process.env['EXPO_PUBLIC_TRANSLATION_API_KEY'] || '',
      TRANSLATION_API_URL:
        process.env['EXPO_PUBLIC_TRANSLATION_API_URL'] ||
        'https://translation.googleapis.com/language/translate/v2',
      APP_VERSION: Constants.expoConfig?.version || '1.0.0',
      BUILD_NUMBER: Constants.expoConfig?.android?.versionCode?.toString() || 
                   Constants.expoConfig?.ios?.buildNumber || '1',
    };
  }

  get apiUrl(): string {
    return this.config.API_URL;
  }

  get environment(): EnvConfig['APP_ENV'] {
    return this.config.APP_ENV;
  }

  get isDebug(): boolean {
    return this.config.DEBUG_MODE;
  }

  get stripePaymentsEnabled(): boolean {
    return this.config.STRIPE_PAYMENTS_ENABLED;
  }

  get beccaAiEnabled(): boolean {
    return this.config.BECCA_AI_ENABLED;
  }

  /** True only when provider-content live translation is both flagged on and
   *  configured with an API key. Callers still receive the original text when
   *  this is false — see dynamicTranslationService.translateDynamic. */
  get dynamicTranslationEnabled(): boolean {
    return this.config.TRANSLATION_ENABLED && this.config.TRANSLATION_API_KEY.length > 0;
  }

  get translationApiKey(): string {
    return this.config.TRANSLATION_API_KEY;
  }

  get translationApiUrl(): string {
    return this.config.TRANSLATION_API_URL;
  }

  get isDevelopment(): boolean {
    return this.config.APP_ENV === 'development';
  }

  get isProduction(): boolean {
    return this.config.APP_ENV === 'production';
  }

  get appVersion(): string {
    return this.config.APP_VERSION;
  }

  get buildNumber(): string {
    return this.config.BUILD_NUMBER;
  }

  /** True when running inside the generic Expo Go app rather than a dev/
   *  production build. Expo Go can only load Expo's own bundled native
   *  modules — third-party native modules like @stripe/stripe-react-native
   *  are absent, so any screen that mounts StripeProvider/useStripe must
   *  check this first and fall back to a non-native path. */
  get isExpoGo(): boolean {
    return Constants.appOwnership === 'expo';
  }

  get fullConfig(): EnvConfig {
    return { ...this.config };
  }

  logConfig(): void {
    if (this.isDebug && __DEV__) {
      logger.log('Environment Configuration:', this.fullConfig);
    }
  }
}

export const env = new EnvironmentService();
