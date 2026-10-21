import React from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { useTranslation } from '../i18n';

/** Uses bundled artwork and system UI so it can render before fonts or auth. */
export default function AppLoadingScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container} accessibilityLabel={t('shared.appLoading.label')} accessibilityRole="progressbar">
      <Image source={require('../../assets/icon.png')} style={styles.logo} resizeMode="contain" />
      <ActivityIndicator color="#34252E" size="small" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF2EC', gap: 24 },
  logo: { width: 200, height: 200, borderRadius: 36 },
});
