// src/screens/shared/WhatsNewScreen.tsx
// Settings > What's New: every release's notes for the hat you're wearing,
// newest first, so the sheet that appeared once after an update can be read
// again. Registered in both hats' settings stacks, like Help Centre.
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { FocusAwareStatusBar } from '../../components/FocusAwareStatusBar';
import { ThemedBackground } from '../../components/ThemedBackground';
import { WhatsNewReleaseList } from '../../components/WhatsNewSheet';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { WHATS_NEW_RELEASES } from '../../data/whatsNew';
import { releasesFor, type WhatsNewAudience } from '../../utils/whatsNew';

export default function WhatsNewScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { theme, palette: P } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { hatState, myBookingMode } = useAuth();
  const audience: WhatsNewAudience =
    hatState.active !== 'provider' ? 'client'
    : myBookingMode === 'external' ? 'linkOnlyProvider'
    : 'provider';
  const releases = releasesFor(WHATS_NEW_RELEASES, audience);

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <FocusAwareStatusBar barStyle={theme.statusBar} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
          activeOpacity={0.5}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={[styles.backArrow, { color: P.text }]}>{'←'}</Text>
        </TouchableOpacity>

        <Text style={[styles.title, { color: P.text }]}>{t('whatsNew.screenTitle')}</Text>
        <Text style={[styles.subtitle, { color: P.sub }]}>{t('whatsNew.screenSubtitle')}</Text>

        {releases.length === 0 ? (
          <Text style={[styles.empty, { color: P.sub }]}>{t('whatsNew.empty')}</Text>
        ) : (
          <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}>
            <WhatsNewReleaseList releases={releases} audience={audience} P={P} showDates />
          </View>
        )}
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 24 },
  backBtn: { alignSelf: 'flex-start', marginBottom: 24 },
  backArrow: { fontSize: 22, fontWeight: '900' },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 28, letterSpacing: 1, marginBottom: 6 },
  subtitle: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, marginBottom: 28, lineHeight: 20 },
  empty: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, lineHeight: 20 },
  card: { borderRadius: 16, borderWidth: 0.5, padding: 18, paddingBottom: 2 },
});
