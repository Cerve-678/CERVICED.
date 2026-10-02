import React from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

/** Uses bundled artwork and system UI so it can render before fonts or auth. */
export default function AppLoadingScreen() {
  return (
    <View style={styles.container} accessibilityLabel="Loading CERVICED" accessibilityRole="progressbar">
      <Image source={require('../../assets/icon.png')} style={styles.logo} resizeMode="contain" />
      <ActivityIndicator color="#34252E" size="small" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF2EC', gap: 24 },
  logo: { width: 200, height: 200, borderRadius: 36 },
});
