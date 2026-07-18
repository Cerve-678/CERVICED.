// src/components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { reportError } from '../utils/logger';

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
  accent: '#AF9197',
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
        <View style={styles.container}>
          <View style={styles.card}>
            <Text style={styles.heading}>Something went wrong</Text>
            <Text style={styles.body}>This section couldn't load.</Text>

            {__DEV__ && this.state.error && (
              <View style={styles.debugBox}>
                <Text style={styles.debugText}>{this.state.error.toString()}</Text>
                {this.state.errorInfo && (
                  <Text style={styles.stackText}>{this.state.errorInfo.componentStack}</Text>
                )}
              </View>
            )}

            <TouchableOpacity
              style={styles.retryButton}
              onPress={this.handleReset}
              activeOpacity={0.75}
              accessibilityLabel="Try Again"
              accessibilityRole="button"
            >
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
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
    color: '#AF9197',
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
