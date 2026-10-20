// ExternalBookingDetailScreen.tsx
// Detail for a "booked elsewhere" entry — a booking the client made on a
// link-only provider's own booking page and noted in CERVICED. Nothing about
// the booking itself can be changed here: confirmation comes by email from
// the provider, and changes or cancellations go through them. The client can
// open their page, message them, add it to their phone's calendar, or remove
// the entry from their own list.
import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from '../../components/SafeArea';
import { ThemedBackground } from '../../components/ThemedBackground';
import { useAppDialog } from '../../components/AppDialog';
import { useTheme } from '../../contexts/ThemeContext';
import {
  getMyExternalBooking,
  removeMyExternalBooking,
  type ClientExternalBookingWithProvider,
} from '../../services/databaseService';
import { addAppointmentToCalendar } from '../../services/deviceCalendarService';
import { openExternalBookingPage } from '../../features/providers/externalBookingLink';
import { BUSINESS_TYPE_LABEL } from '../../features/providers/profilePresentation';
import {
  EXTERNAL_BOOKING_DISCLAIMER,
  bookedOnLabel,
  externalBookingStart,
} from '../../features/bookings/externalBookings';
import { formatLongDateNoYear, formatTime12Safe } from '../../utils/dateUtils';
import { toUserMessage } from '../../utils/userFacingError';
import { logger } from '../../utils/logger';
import { useTranslation } from '../../i18n';
import type { HomeStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'ExternalBookingDetail'>;

const ExternalBookingDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { palette: P } = useTheme();
  const { t } = useTranslation();
  const styles = createStyles(P);
  const { showConfirm, showAlert, DialogHost } = useAppDialog();
  const { externalBookingId } = route.params;

  const [entry, setEntry] = useState<ClientExternalBookingWithProvider | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  const [removing, setRemoving] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTransparent: false,
      headerTitle: '',
      headerStyle: { backgroundColor: P.bg },
      headerShadowVisible: false,
      headerTintColor: P.accentText,
      headerBackButtonDisplayMode: 'minimal',
    });
  }, [navigation, P]);

  // The pill would sit over the bottom of the booking card and its actions, so
  // hide it here (same as BookingDetailScreen). useFocusEffect, so it is
  // hidden again on return from the provider profile, whose cleanup restores it.
  useFocusEffect(useCallback(() => {
    navigation.getParent()?.setOptions({ tabBarStyle: { display: 'none' } });
    return () => {
      navigation.getParent()?.setOptions({ tabBarStyle: undefined });
    };
  }, [navigation]));

  const load = useCallback(() => {
    getMyExternalBooking(externalBookingId)
      .then(row => {
        setEntry(row);
        setState(row ? 'ready' : 'missing');
      })
      .catch((error: unknown) => {
        logger.error('[ExternalBookingDetail] load failed', error);
        setState('failed');
      });
  }, [externalBookingId]);
  useEffect(load, [load]);
  const retry = useCallback(() => {
    setState('loading');
    load();
  }, [load]);

  const provider = entry?.provider ?? null;
  const name = provider?.display_name ?? t('clientBooking.external.thisProfessional');

  const handleOpenPage = useCallback(() => {
    if (!provider?.external_booking_url) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    openExternalBookingPage(provider.external_booking_url).catch((error: unknown) => {
      logger.error('[ExternalBookingDetail] booking page failed to open', error);
      Alert.alert(t('clientBooking.external.pageFailed'), t('clientBooking.detail.tryAgainMoment'));
    });
  }, [provider, t]);

  const handleMessage = useCallback(() => {
    if (!provider) return;
    Haptics.selectionAsync().catch(() => {});
    navigation.navigate('ProviderChat', {
      providerId: provider.slug,
      providerDbId: provider.id,
      providerName: provider.display_name,
      promptMode: 'enquiry',
    });
  }, [navigation, provider]);

  const handleAddToCalendar = useCallback(async () => {
    if (!entry) return;
    Haptics.selectionAsync().catch(() => {});
    try {
      await addAppointmentToCalendar({
        title: `${entry.service_label} · ${name}`,
        start: externalBookingStart(entry),
        location: provider?.location_text ?? null,
        notes: t('clientBooking.external.calendarNotes', { site: provider?.external_booking_url ?? t('clientBooking.external.theirBookingPage'), provider: name }),
        url: provider?.external_booking_url ?? null,
      });
    } catch (error) {
      showAlert(t('clientBooking.external.calendarFailed'), toUserMessage(error, t('clientBooking.detail.tryAgainMoment'), 'ExternalBookingDetail.addToCalendar'));
    }
  }, [entry, name, provider, showAlert, t]);

  const handleRemove = useCallback(() => {
    if (!entry) return;
    showConfirm(
      t('clientBooking.external.removeTitle'),
      t('clientBooking.external.removeBody', { provider: name }),
      [
        { text: t('clientBooking.external.keepIt'), style: 'cancel' },
        {
          text: t('common.remove'),
          style: 'destructive',
          onPress: () => {
            setRemoving(true);
            removeMyExternalBooking(entry.id)
              .then(() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                navigation.goBack();
              })
              .catch((error: unknown) => {
                setRemoving(false);
                showAlert(t('clientBooking.external.removeFailed'), toUserMessage(error, t('clientBooking.detail.tryAgainMoment'), 'ExternalBookingDetail.remove'));
              });
          },
        },
      ],
    );
  }, [entry, name, navigation, showConfirm, showAlert, t]);

  if (state !== 'ready' || !entry) {
    return (
      <ThemedBackground>
        <View style={styles.centered}>
          {state === 'loading' ? (
            <ActivityIndicator color={P.accent} />
          ) : (
            <>
              <Text style={styles.emptyTitle}>
                {state === 'missing' ? t('clientBooking.external.missing') : t('clientBooking.external.loadFailed')}
              </Text>
              {state === 'failed' && (
                <TouchableOpacity onPress={retry} style={styles.retry} activeOpacity={0.7}>
                  <Text style={styles.retryText}>{t('common.tryAgain')}</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </ThemedBackground>
    );
  }

  const start = externalBookingStart(entry);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
  const subtitle = [
    provider?.business_type ? BUSINESS_TYPE_LABEL[provider.business_type] : null,
    provider?.location_text,
  ].filter(Boolean).join(' · ');

  return (
    <ThemedBackground>
      <SafeAreaView style={styles.flex} edges={['bottom', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <View style={styles.providerRow}>
              {provider?.logo_url ? (
                <Image source={{ uri: provider.logo_url }} style={styles.logo} contentFit="cover" transition={0} />
              ) : (
                <View style={[styles.logo, { backgroundColor: P.accent }]}>
                  <Text style={[styles.initials, { color: P.onAccent }]}>{initials}</Text>
                </View>
              )}
              <View style={styles.flex}>
                <Text style={styles.providerName}>{provider?.display_name ?? t('clientBooking.external.noLongerOn')}</Text>
                {!!subtitle && <Text style={styles.sub}>{subtitle}</Text>}
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.factsRow}>
              <View style={styles.flex}>
                <Text style={styles.label}>{t('clientBooking.external.when')}</Text>
                <Text style={styles.value}>{formatLongDateNoYear(start)}</Text>
                <Text style={styles.value}>{formatTime12Safe(start) ?? ''}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.label}>{t('clientBooking.external.service')}</Text>
                <Text style={styles.value}>{entry.service_label}</Text>
              </View>
            </View>
            <View style={styles.tag}>
              <Ionicons name="open-outline" size={12} color={P.text} />
              <Text style={styles.tagText}>{bookedOnLabel(provider?.external_booking_url)}</Text>
            </View>
          </View>

          <View style={styles.infoCard}>
            <Ionicons name="mail-outline" size={20} color={P.accent} />
            <View style={styles.flex}>
              <Text style={styles.infoTitle}>{t('clientBooking.external.checkEmail')}</Text>
              <Text style={styles.infoBody}>
                {t('clientBooking.external.checkEmailBody', { provider: name })}
              </Text>
            </View>
          </View>

          <View style={styles.plainCard}>
            <Text style={styles.infoTitle}>{t('clientBooking.external.changeTitle')}</Text>
            <Text style={styles.infoBody}>
              {t('clientBooking.external.changeBody', { provider: name })}
            </Text>
          </View>

          {provider?.external_booking_url ? (
            <TouchableOpacity style={styles.primary} onPress={handleOpenPage} activeOpacity={0.85}>
              <Text style={styles.primaryText}>{t('clientBooking.external.openPage')}</Text>
              <Ionicons name="open-outline" size={15} color={P.onAccent} />
            </TouchableOpacity>
          ) : null}
          {provider ? (
            <TouchableOpacity style={styles.secondary} onPress={handleMessage} activeOpacity={0.85}>
              <Text style={styles.secondaryText}>{t('clientBooking.external.message', { provider: name.toUpperCase() })}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.secondary} onPress={handleAddToCalendar} activeOpacity={0.85}>
            <Ionicons name="calendar-outline" size={16} color={P.text} />
            <Text style={styles.secondaryText}>{t('clientBooking.external.addToCalendar')}</Text>
          </TouchableOpacity>

          <Text style={styles.disclaimer}>{EXTERNAL_BOOKING_DISCLAIMER}</Text>

          <TouchableOpacity
            onPress={handleRemove}
            disabled={removing}
            style={styles.removeButton}
            activeOpacity={0.7}
          >
            {removing ? (
              <ActivityIndicator color={P.sub} />
            ) : (
              <Text style={styles.removeText}>{t('clientBooking.external.remove')}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
      <DialogHost />
    </ThemedBackground>
  );
};

type Palette = ReturnType<typeof useTheme>['palette'];

const createStyles = (P: Palette) =>
  StyleSheet.create({
    flex: { flex: 1 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
    emptyTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 17, color: P.text, textAlign: 'center' },
    retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
    retryText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 15, fontWeight: '700', color: P.accentText },
    content: { padding: 16, paddingBottom: 40, gap: 12 },
    card: { backgroundColor: P.card, borderRadius: 22, borderWidth: 1, borderColor: P.border, padding: 16, gap: 14 },
    providerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    logo: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    initials: { fontFamily: 'BakbakOne-Regular', fontSize: 18 },
    providerName: { fontFamily: 'BakbakOne-Regular', fontSize: 18, color: P.text },
    sub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, color: P.sub, marginTop: 2 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: P.border },
    factsRow: { flexDirection: 'row', gap: 16 },
    label: { fontFamily: 'Jura-VariableFont_wght', fontSize: 11, fontWeight: '700', letterSpacing: 1.1, color: P.sub, marginBottom: 4 },
    value: { fontFamily: 'BakbakOne-Regular', fontSize: 16, color: P.text },
    tag: {
      alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5,
      height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: P.accentDim,
    },
    tagText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700', color: P.text },
    infoCard: { flexDirection: 'row', gap: 12, backgroundColor: P.accentDim, borderRadius: 18, padding: 16 },
    plainCard: { backgroundColor: P.card, borderRadius: 18, borderWidth: 1, borderColor: P.border, padding: 16, gap: 4 },
    infoTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 15, color: P.text },
    infoBody: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, lineHeight: 20, color: P.text },
    primary: {
      height: 54, borderRadius: 27, backgroundColor: P.accent, marginTop: 6,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    primaryText: { fontFamily: 'BakbakOne-Regular', fontSize: 14, letterSpacing: 1.2, color: P.onAccent },
    secondary: {
      height: 54, borderRadius: 27, borderWidth: 1, borderColor: P.border,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    secondaryText: { fontFamily: 'BakbakOne-Regular', fontSize: 14, letterSpacing: 1.2, color: P.text },
    disclaimer: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, lineHeight: 17, color: P.sub, textAlign: 'center', marginTop: 4 },
    removeButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    removeText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '700', color: P.sub, textDecorationLine: 'underline' },
  });

export default ExternalBookingDetailScreen;
