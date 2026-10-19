// src/screens/auth/ClaimProviderScreen.tsx
// "Is your business already on CERVICED?" — search scraped/unclaimed
// listings, explain that ownership is checked through the listing's
// Instagram, then continue into the normal signup wizard with business info
// prefilled. The claim itself (request_provider_claim, which issues the bio
// code) is opened once the account exists — see the pending-claim pickup in
// InfoRegScreen.tsx.
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
  savePendingClaim,
  displayHandle,
  type UnclaimedProviderSummary,
  type UnclaimedProviderDetail,
} from '../../services/providerClaimService';
import { logger } from '../../utils/logger';

type Props = StackScreenProps<RootStackParamList, 'ClaimProvider'>;

type Step = 'search' | 'preview' | 'instagram';

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

  const handleThisIsMine = useCallback(() => {
    if (!selected) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (!displayHandle(selected.instagram)) {
      Alert.alert(
        "We can't check this one in the app",
        "This listing has no Instagram for us to check. Email support@cerviced.co and we'll help you claim it.",
      );
      return;
    }
    setStep('instagram');
  }, [selected]);

  const handleContinueToSignUp = useCallback(async () => {
    if (!selected) return;
    setIsBusy(true);
    try {
      // Not signed in yet — stash the listing and open the claim once the
      // account exists (InfoRegScreen picks this up on first load).
      await savePendingClaim({ providerId: selected.id });

      updateData({
        accountType: 'provider',
        businessName: selected.displayName,
        businessPhone: selected.phone || '',
        instagram: selected.instagram || '',
        website: selected.website || '',
      });
      setCurrentStep(1);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      navigation.navigate('SignUpStep1');
    } catch (e: any) {
      logger.error('[ClaimProvider] save pending claim failed:', e);
      Alert.alert('Something went wrong', friendlyClaimError(e) ?? 'Please try again.');
    } finally {
      setIsBusy(false);
    }
  }, [selected, updateData, setCurrentStep, navigation]);

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
              if (step === 'instagram') {
                setStep('preview');
              } else if (knownProviderId || step === 'search') {
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
                Search by business name, Instagram handle or area. If we've found your listing, you can claim it and skip re-entering your info.
              </Text>
              <TextInput
                style={[styles.input, { color: t.text, backgroundColor: t.surface, borderColor: t.border }]}
                placeholder="Business name, Instagram or area"
                placeholderTextColor={t.sub}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoCorrect={false}
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
                        {[displayHandle(item.instagram) ? `@${displayHandle(item.instagram)}` : null, item.serviceCategory, item.locationText]
                          .filter(Boolean)
                          .join(' · ')}
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
                {[displayHandle(selected.instagram) ? `@${displayHandle(selected.instagram)}` : null, selected.serviceCategory, selected.locationText]
                  .filter(Boolean)
                  .join(' · ')}
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
                onPress={handleThisIsMine}
                disabled={isBusy}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>THIS IS MY BUSINESS</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'instagram' && selected && (
            <>
              <Text style={[styles.title, { color: t.text }]}>Prove it's yours on Instagram</Text>
              <Text style={[styles.subtitle, { color: t.sub }]}>
                We check claims through the Instagram on this listing:
              </Text>
              <Text style={[styles.handleText, { color: t.text }]}>@{displayHandle(selected.instagram)}</Text>
              <View style={[styles.noticeBox, { backgroundColor: t.surface, borderColor: t.border }]}>
                <Text style={[styles.noticeText, { color: t.text }]}>
                  After you create your account, you'll get a short code to add to that Instagram bio. Once we've seen it there, the listing is yours. You can take the code out afterwards.
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: t.accent }]}
                onPress={handleContinueToSignUp}
                disabled={isBusy}
                activeOpacity={0.85}
              >
                {isBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>CONTINUE TO SIGN UP</Text>}
              </TouchableOpacity>
              <Text style={[styles.helpText, { color: t.sub }]}>
                Not your Instagram any more? Email support@cerviced.co and we'll help.
              </Text>
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
  handleText: { fontFamily: 'BakbakOne-Regular', fontSize: 18, marginBottom: 20 },
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
  helpText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 16 },
});
