import Constants from 'expo-constants';

export interface EnvConfig {
  API_URL: string;
  APP_ENV: 'development' | 'staging' | 'production';
  DEBUG_MODE: boolean;
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

  get fullConfig(): EnvConfig {
    return { ...this.config };
  }

  logConfig(): void {
    if (this.isDebug && __DEV__) {
      console.log('Environment Configuration:', this.fullConfig);
    }
  }
}

export const env = new EnvironmentService();