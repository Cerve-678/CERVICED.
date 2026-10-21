// src/components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { logger, reportError } from '../utils/logger';
import { useTranslation } from '../i18n';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, retry: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | undefined;
  errorInfo: ErrorInfo | undefined;
}

// App light palette — hardcoded because class components can't call hooks.
// Mirrors the L tokens in HomeScreen and the lightTheme values in ThemeContext.
const P = {
  bg: '#F5F1EC',
  card: '#FFFFFF',
  text: '#000000',
  sub: '#7E6667',
  accent: '#5C4033',
  border: 'rgba(126,102,103,0.14)',
};

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: undefined, errorInfo: undefined };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    reportError(error, 'ErrorBoundary');
    // The component stack was only ever rendered into the on-screen debug box,
    // so the terminal got a bare message with nothing naming WHERE it came
    // from — useless for the errors that don't point at their own source
    // ("Maximum update depth exceeded" names no component at all). Dev only:
    // the stack is developer detail, and reportError already forwards the
    // error itself to the external reporter in production.
    if (__DEV__ && errorInfo.componentStack) {
      logger.error('[ErrorBoundary] component stack:', errorInfo.componentStack);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback && this.state.error) {
        return this.props.fallback(this.state.error, this.handleReset);
      }

      return (
        <DefaultFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onRetry={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}

// The default fallback is a function component so it can use useTranslation()
// (a class can't call hooks). It works outside DisplaySettingsProvider too —
// the root boundary sits above it — by reading the language store.
function DefaultFallback({ error, errorInfo, onRetry }: {
  error: Error | undefined;
  errorInfo: ErrorInfo | undefined;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.heading}>{t('common.somethingWentWrong')}</Text>
        <Text style={styles.body}>{t('shared.errorBoundary.body')}</Text>

        {__DEV__ && error && (
          <View style={styles.debugBox}>
            <Text style={styles.debugText}>{error.toString()}</Text>
            {errorInfo && (
              <Text style={styles.stackText}>{errorInfo.componentStack}</Text>
            )}
          </View>
        )}

        <TouchableOpacity
          style={styles.retryButton}
          onPress={onRetry}
          activeOpacity={0.75}
          accessibilityLabel={t('shared.errorBoundary.tryAgain')}
          accessibilityRole="button"
        >
          <Text style={styles.retryText}>{t('shared.errorBoundary.tryAgain')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: P.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: P.card,
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    shadowColor: P.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 1,
    borderColor: P.border,
  },
  heading: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 22,
    color: P.text,
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  body: {
    fontSize: 15,
    color: P.sub,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
  },
  debugBox: {
    width: '100%',
    backgroundColor: '#F5E6FA',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    maxHeight: 180,
  },
  debugText: {
    fontSize: 12,
    color: '#5C4033',
    fontFamily: 'monospace',
    marginBottom: 6,
  },
  stackText: {
    fontSize: 11,
    color: P.sub,
    fontFamily: 'monospace',
  },
  retryButton: {
    backgroundColor: P.accent,
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    width: '100%',
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'BakbakOne-Regular',
    letterSpacing: 0.5,
  },
});
