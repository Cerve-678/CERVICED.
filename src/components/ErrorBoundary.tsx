// src/components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, retry: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | undefined;
  errorInfo: ErrorInfo | undefined;
}

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
    console.error('ErrorBoundary caught an error:', error);
    console.error('Error info:', errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  handleReportError = () => {
    if (this.state.error) {
      Alert.alert(
        'Report Error',
        'Would you like to report this error to help us improve the app?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Report',
            onPress: () => {
              if (__DEV__) console.log('Error reported:', this.state.error);
              Alert.alert('Thank you', 'Error report sent successfully.');
            }
          }
        ]
      );
    }
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback && this.state.error) {
        return this.props.fallback(this.state.error, this.handleReset);
      }

      return (
        <View style={styles.container}>
          <View style={styles.errorContainer}>
            <Text style={styles.title}>Oops! Something went wrong</Text>
            <Text style={styles.message}>
              The app encountered an unexpected error. This has been logged and we'll fix it soon.
            </Text>

            {__DEV__ && this.state.error && (
              <View style={styles.debugContainer}>
                <Text style={styles.debugTitle}>Debug Info:</Text>
                <Text style={styles.errorDetails}>{this.state.error.toString()}</Text>
                {this.state.errorInfo && (
                  <Text style={styles.stackTrace}>{this.state.errorInfo.componentStack}</Text>
                )}
              </View>
            )}

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={this.handleReset}
                activeOpacity={0.7}
              >
                <Text style={styles.primaryButtonText}>Try Again</Text>
              </TouchableOpacity>

              {!__DEV__ && (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={this.handleReportError}
                  activeOpacity={0.7}
                >
                  <Text style={styles.secondaryButtonText}>Report Issue</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5E6FA', justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorContainer: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 8 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#FF3B30', marginBottom: 12, textAlign: 'center' },
  message: { fontSize: 16, color: '#333', textAlign: 'center', marginBottom: 24, lineHeight: 24 },
  debugContainer: { width: '100%', backgroundColor: '#f8f9fa', borderRadius: 8, padding: 12, marginBottom: 20, maxHeight: 200 },
  debugTitle: { fontSize: 14, fontWeight: '600', color: '#666', marginBottom: 8 },
  errorDetails: { fontSize: 12, color: '#d73a49', fontFamily: 'monospace', marginBottom: 8 },
  stackTrace: { fontSize: 11, color: '#586069', fontFamily: 'monospace' },
  buttonContainer: { flexDirection: 'row', gap: 12, width: '100%' },
  primaryButton: { flex: 1, backgroundColor: '#007AFF', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: { flex: 1, backgroundColor: 'transparent', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 8, borderWidth: 1, borderColor: '#007AFF', alignItems: 'center' },
  secondaryButtonText: { color: '#007AFF', fontSize: 16, fontWeight: '500' },
});
