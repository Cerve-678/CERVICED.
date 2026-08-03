// src/screens/ReactivateAccountScreen.tsx
import React from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';

const GRACE_PERIOD_DAYS = 30;

function formatDeletionDate(requestedAtIso: string): { dateLabel: string; daysLeft: number } {
  const requestedAt = new Date(requestedAtIso);
  const deleteAt = new Date(requestedAt);
  deleteAt.setDate(deleteAt.getDate() + GRACE_PERIOD_DAYS);
  const daysLeft = Math.max(0, Math.ceil((deleteAt.getTime() - Date.now()) / 86_400_000));
  const dateLabel = deleteAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return { dateLabel, daysLeft };
}

export default function ReactivateAccountScreen() {
  const { user, pendingReactivation, isReactivating, reactivateAccount, declineReactivation } = useAuth();
  const { theme: t, palette: P } = useTheme();

  const { dateLabel, daysLeft } = pendingReactivation
    ? formatDeletionDate(pendingReactivation)
    : { dateLabel: '', daysLeft: 0 };

  const handleReactivate = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await reactivateAccount();
    } catch {
      // reactivateAccount surfaces its own thrown error; nothing else to do
      // here besides letting the button re-enable via isReactivating.
    }
  };

  const handleDecline = () => {
    Haptics.selectionAsync().catch(() => {});
    declineReactivation();
  };

  return (
    <ThemedBackground style={styles.background}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={t.statusBar} translucent />

        <View style={styles.content}>
          <Text style={[styles.title, { color: P.text }]}>Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}.</Text>

          <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}>
            <Text style={[styles.body, { color: P.text }]}>
              You deleted your account. It's scheduled to be permanently erased on{' '}
              <Text style={{ fontWeight: '700' }}>{dateLabel}</Text>
              {daysLeft > 0 ? ` (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)` : ''}.
            </Text>
            <Text style={[styles.subBody, { color: P.sub }]}>
              Reactivating restores everything exactly as it was — nothing has been deleted yet.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: P.accent, opacity: isReactivating ? 0.7 : 1 }]}
            onPress={handleReactivate}
            disabled={isReactivating}
            activeOpacity={0.85}
          >
            {isReactivating ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.primaryBtnText}>Reactivating your account…</Text>
              </View>
            ) : (
              <Text style={styles.primaryBtnText}>Reactivate My Account</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.declineBtn}
            onPress={handleDecline}
            disabled={isReactivating}
            activeOpacity={0.7}
          >
            <Text style={[styles.declineText, { color: P.sub }]}>Not now, sign out</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  content: { gap: 16 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3, marginBottom: 4 },
  card: { borderRadius: 18, borderWidth: 0.5, padding: 18, gap: 10 },
  body: { fontSize: 15, lineHeight: 21 },
  subBody: { fontSize: 13, lineHeight: 18 },
  primaryBtn: { borderRadius: 100, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  declineBtn: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  declineText: { fontSize: 14, fontWeight: '500' },
});
