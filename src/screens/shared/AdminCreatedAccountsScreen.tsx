import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import { FocusAwareStatusBar } from '../../components/FocusAwareStatusBar';
import { useAppDialog } from '../../components/AppDialog';
import { useSignInAsAccount } from '../../features/admin/useSignInAsAccount';
import { toUserMessage } from '../../utils/userFacingError';
import {
  adminOpenBlankAccount,
  AdminCreateAccountRefused,
  listAdminCreatedAccounts,
  type AdminCreatedAccount,
  type AdminCreatedProviderStatus,
} from '../../services/databaseService';
import { formatShortDate } from '../../utils/dateUtils';
import { logger } from '../../utils/logger';

// ── Accounts you created (admin) ───────────────────────────────────────────
// Every account opened from Admin → Create an account, newest first, with
// who made it and, for providers, how far they've got. Read from
// admin_created_accounts(), which refuses anyone who isn't an admin.
// A blank provider (Start a provider now) shows "Details not added yet" with
// a way back into its provider side and a way to add its owner's details.
// Internal tool, so its copy is English only.

const PROVIDER_STATUS_LABEL: Record<AdminCreatedProviderStatus, string> = {
  live: 'Live',
  setting_up: 'Setting up their profile',
  not_started: "Hasn't started their profile",
};

type Palette = ReturnType<typeof useTheme>['palette'];

export default function AdminCreatedAccountsScreen({ navigation }: any) {
  const { isDarkMode, palette: P } = useTheme();
  const insets = useSafeAreaInsets();
  const [accounts, setAccounts] = useState<AdminCreatedAccount[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const { showAlert, showConfirm, DialogHost } = useAppDialog();
  const signInAs = useSignInAsAccount();

  const openProviderSide = useCallback((account: AdminCreatedAccount) => {
    Haptics.selectionAsync().catch(() => {});
    showConfirm(
      'Open their provider side?',
      "This signs you out of your own account and into this one, so you can carry on setting it up. Sign back into your own account when you're done.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open',
          onPress: () => {
            void (async () => {
              setOpeningId(account.userId);
              try {
                const login = await adminOpenBlankAccount(account.userId);
                // Takes this screen away; nothing after it may touch state.
                await signInAs(login.email, login.password);
              } catch (err) {
                setOpeningId(null);
                showAlert(
                  "Couldn't open it",
                  err instanceof AdminCreateAccountRefused
                    ? err.message
                    : toUserMessage(err, 'Something went wrong. Please try again.', 'AdminCreatedAccountsScreen.adminOpenBlankAccount'),
                  'center',
                );
              }
            })();
          },
        },
      ],
      'center',
    );
  }, [showAlert, showConfirm, signInAs]);

  const addDetails = useCallback((account: AdminCreatedAccount) => {
    Haptics.selectionAsync().catch(() => {});
    navigation.navigate('AdminCreateAccount', { addDetailsForUserId: account.userId });
  }, [navigation]);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setAccounts(await listAdminCreatedAccounts());
    } catch (err) {
      logger.error('[AdminCreatedAccounts] list failed to load:', err);
      setLoadError(true);
    }
  }, []);

  // Re-read on every visit, so an account made a moment ago is already here.
  useEffect(() => navigation.addListener('focus', () => { void load(); }), [navigation, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const header = (
    <View>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Text style={[styles.backArrow, { color: P.text }]}>{'←'}</Text>
      </TouchableOpacity>
      <Text style={[styles.title, { color: P.text }]}>ACCOUNTS YOU CREATED</Text>
      <Text style={[styles.subtitle, { color: P.sub }]}>
        {accounts && accounts.length > 0
          ? `${accounts.length} account${accounts.length === 1 ? '' : 's'} opened from Create an account, newest first.`
          : 'Every account opened from Create an account shows here.'}
      </Text>
    </View>
  );

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <FocusAwareStatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <FlatList
        data={accounts ?? []}
        keyExtractor={item => item.userId}
        renderItem={({ item }) => (
          <AccountCard P={P} account={item} opening={openingId === item.userId}
            onOpen={openProviderSide} onAddDetails={addDetails} />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          accounts === null && !loadError ? (
            <ActivityIndicator color={P.accent} style={{ marginTop: 24 }} />
          ) : loadError ? (
            <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}>
              <Text style={[styles.body, { color: P.text }]}>Couldn't load the list.</Text>
              <TouchableOpacity onPress={() => void load()} activeOpacity={0.7} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={[styles.link, { color: P.accentText }]}>TRY AGAIN</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={[styles.body, { color: P.sub, marginTop: 8 }]}>You haven't created any accounts yet.</Text>
          )
        }
        contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={P.accent} />}
      />
      <DialogHost />
    </ThemedBackground>
  );
}

function AccountCard({ P, account, opening, onOpen, onAddDetails }: {
  P: Palette;
  account: AdminCreatedAccount;
  opening: boolean;
  onOpen: (account: AdminCreatedAccount) => void;
  onAddDetails: (account: AdminCreatedAccount) => void;
}) {
  const deleted = account.name === null && account.email === null;
  const pending = !deleted && account.detailsPending;
  const created = `Created ${formatShortDate(account.createdAt)}${account.createdByName ? ` by ${account.createdByName}` : ''}`;
  return (
    <View style={[styles.card, { backgroundColor: P.card, borderColor: P.border }]}>
      <View style={styles.rowBetween}>
        <Text style={[styles.name, { color: deleted ? P.sub : P.text, flex: 1 }]} numberOfLines={1}>
          {deleted ? 'Deleted account' : account.name || 'No name'}
        </Text>
        <View style={[styles.pill, { borderColor: P.border }]}>
          <Text style={[styles.pillText, { color: P.accentText }]}>
            {account.accountType === 'provider' ? 'PROVIDER' : 'CLIENT'}
          </Text>
        </View>
      </View>
      {pending && (
        <Text style={[styles.body, { color: P.sub }]}>Details not added yet: nobody can sign in to this but you.</Text>
      )}
      {!deleted && !pending && !!account.email && (
        <Text selectable style={[styles.body, { color: P.text }]}>{account.email}</Text>
      )}
      {account.providerStatus && (
        <Text style={[styles.body, { color: account.providerStatus === 'live' ? P.accentText : P.sub }]}>
          {PROVIDER_STATUS_LABEL[account.providerStatus]}
        </Text>
      )}
      <Text style={[styles.small, { color: P.sub }]}>{created}</Text>
      {pending && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: P.border, opacity: opening ? 0.7 : 1 }]}
            onPress={() => onOpen(account)}
            disabled={opening}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            {opening
              ? <ActivityIndicator color={P.accent} />
              : <Text style={[styles.link, { color: P.accentText }]}>OPEN THEIR PROVIDER SIDE</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: P.accent, borderColor: P.accent }]}
            onPress={() => onAddDetails(account)}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Text style={[styles.link, { color: P.onAccent }]}>ADD THEIR DETAILS</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backBtn: { width: 44, height: 44, justifyContent: 'center', marginLeft: -4 },
  backArrow: { fontSize: 24 },
  title: { fontFamily: 'JosefinSans-Bold', fontSize: 28, letterSpacing: 1, marginTop: 4 },
  subtitle: { fontFamily: 'JosefinSans-VariableFont_wght', fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 18 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 4, marginBottom: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontFamily: 'JosefinSans-Bold', fontSize: 16, letterSpacing: 1 },
  body: { fontFamily: 'JosefinSans-VariableFont_wght', fontSize: 14, lineHeight: 20 },
  small: { fontFamily: 'JosefinSans-VariableFont_wght', fontSize: 13, lineHeight: 18 },
  link: { fontFamily: 'JosefinSans-Bold', fontSize: 12, letterSpacing: 1.5 },
  actions: { gap: 8, marginTop: 8 },
  actionBtn: { borderRadius: 100, borderWidth: 1, minHeight: 44, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  pill: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 4, paddingHorizontal: 10 },
  pillText: { fontFamily: 'JosefinSans-Bold', fontSize: 10, letterSpacing: 1.2 },
});
