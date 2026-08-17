import Constants from 'expo-constants';
import { logger } from './logger';

export interface EnvConfig {
  API_URL: string;
  APP_ENV: 'development' | 'staging' | 'production';
  DEBUG_MODE: boolean;
  STRIPE_PAYMENTS_ENABLED: boolean;
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
