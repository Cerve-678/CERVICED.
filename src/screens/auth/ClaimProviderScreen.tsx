// src/screens/auth/ClaimProviderScreen.tsx
// "Is your business already on CERVICED?" — search scraped/unclaimed
// listings, verify ownership via a code sent to the listing's contact
// email, then continue into the normal signup wizard with business info
// prefilled. The actual claim_provider_profile() RPC call happens later,
// once the account exists — see the pending-claim pickup in
// InfoRegScreen.tsx's mount effect.
import React, { useCallback, useEffect, useState } from 'react';
import * as Haptics from 'expo-haptics';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useRegistration } from '../../contexts/RegistrationContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';
import {
  searchUnclaimedProviders,
  getUnclaimedProviderDetail,
  requestClaimVerification,
  savePendingClaim,
  type UnclaimedProviderSummary,
  type UnclaimedProviderDetail,
} from '../../services/providerClaimService';
import { logger } from '../../utils/logger';

type Props = StackScreenProps<RootStackParamList, 'ClaimProvider'>;

type Step = 'search' | 'preview' | 'code';

/** DB guard messages (P0001) are written for people and safe to show; a coded
 *  or technical error (RLS, network, missing column…) is not — return null so
 *  the caller falls back to a calm generic line. */
function friendlyClaimError(e: any): string | null {
  const isTechnical = e?.code && e.code !== 'P0001';
  return typeof e?.message === 'string' && e.message.length > 0 && !isTechnical && !e.message.includes('Network')
    ? e.message
    : null;
}

export default function ClaimProviderScreen({ navigation, route }: Props) {
  const { isDarkMode, palette: t } = useTheme();
  const insets = useSafeAreaInsets();
  const { updateData, setCurrentStep } = useRegistration();

  // A known providerId (e.g. from ProviderProfileScreen's "Claim this
  // business" button on an unclaimed listing) skips straight to the preview
  // step instead of starting at search — see the mount effect below.
  const knownProviderId = route.params?.providerId;

  const [step, setStep] = useState<Step>(knownProviderId ? 'preview' : 'search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UnclaimedProviderSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selected, setSelected] = useState<UnclaimedProviderDetail | null>(null);
  const [maskedEmail, setMaskedEmail] = useState('');
  const [code, setCode] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [isLoadingKnown, setIsLoadingKnown] = useState(!!knownProviderId);

  useEffect(() => {
    if (!knownProviderId) return;
    let cancelled = false;
    getUnclaimedProviderDetail(knownProviderId)
      .then(detail => {
        if (cancelled) return;
        if (!detail) {
          Alert.alert('No longer available', 'This listing has already been claimed or removed.');
          setStep('search');
          return;
        }
        setSelected(detail);
      })
      .catch((e: any) => {
        if (cancelled) return;
        logger.error('[ClaimProvider] load listing failed:', e);
      Alert.alert("Couldn't load listing", friendlyClaimError(e) ?? 'Please try again.');
        setStep('search');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingKnown(false);
      });
    return () => { cancelled = true; };
  }, [knownProviderId]);

  // Debounce remote search and ignore stale responses so fast typing neither
  // floods PostgREST nor lets an older result overwrite the latest query.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      setIsSearching(true);
      searchUnclaimedProviders(trimmed)
        .then(found => {
          if (active) setResults(found);
        })
        .catch((e: any) => {
          if (!active) return;
          logger.error('[ClaimProvider] search failed:', e);
          Alert.alert('Search failed', friendlyClaimError(e) ?? 'Please try again.');
        })
        .finally(() => {
          if (active) setIsSearching(false);
        });
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const handlePickResult = useCallback(async (result: UnclaimedProviderSummary) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setIsBusy(true);
    try {
      const detail = await getUnclaimedProviderDetail(result.id);
      if (!detail) {
        Alert.alert('No longer available', 'This listing has already been claimed or removed.');
        return;
      }
      setSelected(detail);
      setStep('preview');
    } catch (e: any) {
      logger.error('[ClaimProvider] load listing failed:', e);
      Alert.alert("Couldn't load listing", friendlyClaimError(e) ?? 'Please try again.');
    } finally {
      setIsBusy(false);
    }
  }, []);

  const handleRequestCode = useCallback(async () => {
    if (!selected) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsBusy(true);
    try {
      const { maskedEmail: masked } = await requestClaimVerification(selected.id);
      setMaskedEmail(masked);
      setStep('code');
    } catch (e: any) {
      logger.error('[ClaimProvider] request code failed:', e);
      Alert.alert("Couldn't send code", friendlyClaimError(e) ?? 'Please try again.');
    } finally {
      setIsBusy(false);
    }
  }, [selected]);

  const handleConfirmCode = useCallback(async () => {
    if (!selected || code.trim().length < 6) {
      Alert.alert('Enter code', 'Please enter the 6-digit code from your email.');
      return;
    }
    setIsBusy(true);
    try {
      // Not signed in yet — stash the claim and finish attaching it to the
      // account once it exists (InfoRegScreen picks this up on first load).
      await savePendingClaim({ providerId: selected.id, code: code.trim() });

      updateData({
        accountType: 'provider',
        businessName: selected.displayName,
        businessEmail: selected.email || '',
        businessPhone: selected.phone || '',
        instagram: selected.instagram || '',
        website: selected.website || '',
      });
      setCurrentStep(1);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      navigation.navigate('SignUpStep1');
    } catch (e: any) {
      logger.error('[ClaimProvider] confirm claim failed:', e);
      Alert.alert('Something went wrong', friendlyClaimError(e) ?? 'Please try again.');
    } finally {
      setIsBusy(false);
    }
  }, [selected, code, updateData, setCurrentStep, navigation]);

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />
      <KeyboardDismissView>
        <View style={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
          <TouchableOpacity
            onPress={() => {
              // Entered directly with a known listing (e.g. from
              // ProviderProfileScreen's "Claim this business") — there was
              // never a search step to fall back to, so back should leave
              // this screen entirely rather than land on an empty search
              // field the user never used.
              if (knownProviderId || step === 'search') {
                navigation.goBack();
              } else {
                setStep('search');
              }
            }}
            style={styles.backBtn}
          >
            <Text style={[styles.backText, { color: t.accent }]}>{'‹ Back'}</Text>
          </TouchableOpacity>

          {step === 'preview' && isLoadingKnown && (
            <ActivityIndicator style={{ marginTop: 40 }} color={t.accent} />
          )}

          {step === 'search' && (
            <>
              <Text style={[styles.title, { color: t.text }]}>Is your business already listed?</Text>
              <Text style={[styles.subtitle, { color: t.sub }]}>
                Search by business name or city. If we've found your listing, you can claim it and skip re-entering your info.
              </Text>
              <TextInput
                style={[styles.input, { color: t.text, backgroundColor: t.surface, borderColor: t.border }]}
                placeholder="Business name or city"
                placeholderTextColor={t.sub}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="words"
              />
              {isSearching && <ActivityIndicator style={{ marginTop: 16 }} color={t.accent} />}
              <FlatList
                data={results}
                keyExtractor={(item) => item.id}
                style={{ marginTop: 16 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.resultRow, { backgroundColor: t.surface, borderColor: t.border }]}
                    onPress={() => handlePickResult(item)}
                    disabled={isBusy}
                  >
                    {item.logoUrl ? (
                      <Image source={{ uri: item.logoUrl }} style={styles.resultLogo} />
                    ) : (
                      <View style={[styles.resultLogo, { backgroundColor: t.border }]} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.resultName, { color: t.text }]}>{item.displayName}</Text>
                      <Text style={[styles.resultSub, { color: t.sub }]}>
                        {item.serviceCategory}{item.locationText ? ` · ${item.locationText}` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  query.trim().length >= 2 && !isSearching ? (
                    <Text style={[styles.emptyText, { color: t.sub }]}>No unclaimed listings found. You can still sign up from scratch.</Text>
                  ) : null
                }
              />
            </>
          )}

          {step === 'preview' && selected && (
            <>
              <Text style={[styles.title, { color: t.text }]}>{selected.displayName}</Text>
              <Text style={[styles.subtitle, { color: t.sub }]}>
                {selected.serviceCategory}{selected.locationText ? ` · ${selected.locationText}` : ''}
              </Text>
              {selected.scrapedFields.length > 0 && (
                <View style={[styles.noticeBox, { backgroundColor: t.surface, borderColor: t.accent }]}>
                  <Text style={[styles.noticeText, { color: t.text }]}>
                    We pulled this listing from a public source. You'll be asked to confirm or correct the imported details after claiming it.
                  </Text>
                </View>
              )}
              {selected.aboutText ? <Text style={[styles.aboutText, { color: t.text }]}>{selected.aboutText}</Text> : null}
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: t.accent }]}
                onPress={handleRequestCode}
                disabled={isBusy}
              >
                {isBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>THIS IS MY BUSINESS</Text>}
              </TouchableOpacity>
            </>
          )}

          {step === 'code' && selected && (
            <>
              <Text style={[styles.title, { color: t.text }]}>Verify it's you</Text>
              <Text style={[styles.subtitle, { color: t.sub }]}>
                We sent a 6-digit code to {maskedEmail}, the contact email on file for this listing.
              </Text>
              <TextInput
                style={[styles.input, styles.codeInput, { color: t.text, backgroundColor: t.surface, borderColor: t.border }]}
                placeholder="123456"
                placeholderTextColor={t.sub}
                value={code}
                onChangeText={(v) => setCode(v.replace(/[^0-9]/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
              />
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: t.accent }]}
                onPress={handleConfirmCode}
                disabled={isBusy}
              >
                {isBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>CONTINUE</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={handleRequestCode} disabled={isBusy} style={{ marginTop: 16 }}>
                <Text style={[styles.resendText, { color: t.accent }]}>Resend code</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardDismissView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 24 },
  backBtn: { marginBottom: 16 },
  backText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 15, fontWeight: '700' },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 22, marginBottom: 8 },
  subtitle: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, lineHeight: 20, marginBottom: 20 },
  input: { minHeight: 50, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, fontSize: 15, fontFamily: 'Jura-VariableFont_wght' },
  codeInput: { textAlign: 'center', fontSize: 24, letterSpacing: 8, fontWeight: '700' },
  resultRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 10, gap: 12 },
  resultLogo: { width: 44, height: 44, borderRadius: 10 },
  resultName: { fontFamily: 'Jura-VariableFont_wght', fontSize: 15, fontWeight: '700' },
  resultSub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, marginTop: 2 },
  emptyText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, textAlign: 'center', marginTop: 24 },
  noticeBox: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 20 },
  noticeText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 19 },
  aboutText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, lineHeight: 20, marginBottom: 24 },
  primaryBtn: { minHeight: 50, borderRadius: 100, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primaryBtnText: { fontFamily: 'BakbakOne-Regular', fontSize: 13, letterSpacing: 1, color: '#FFFFFF' },
  resendText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
