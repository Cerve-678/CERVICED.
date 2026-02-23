import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Text, View, StyleSheet } from 'react-native';
import App from './App';

function ErrorFallback({ error }: { error: Error }) {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorText}>{error.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fee2e2',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#dc2626',
    marginBottom: 10,
  },
  errorText: {
    fontSize: 14,
    color: '#7f1d1d',
    textAlign: 'center',
  },
});

export default function AppWithErrorBoundary() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <App />
    </ErrorBoundary>
  );
}