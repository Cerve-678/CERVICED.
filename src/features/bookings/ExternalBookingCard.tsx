import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import type { ClientExternalBookingWithProvider } from '../../services/databaseService';
import { formatShortDayDate, formatTime12Safe } from '../../utils/dateUtils';
import { bookedOnLabel, externalBookingStart } from './externalBookings';
import { useTranslation } from '../../i18n';

interface ExternalBookingCardProps {
  entry: ClientExternalBookingWithProvider;
  onPress: (entry: ClientExternalBookingWithProvider) => void;
}

/**
 * A "booked elsewhere" entry in the client's Bookings list. Full-width, like
 * BookingListRow, with a "Booked on Fresha" tag where a CERVICED booking
 * shows its status — CERVICED doesn't know the status of these.
 */
export const ExternalBookingCard = React.memo<ExternalBookingCardProps>(({ entry, onPress }) => {
  const { palette: P } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(P), [P]);
  const name = entry.provider?.display_name ?? t('clientBooking.external.providerGone');
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
  const start = externalBookingStart(entry);

  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(entry); }}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${entry.service_label}, ${formatShortDayDate(start)}`}
    >
      <View style={styles.topRow}>
        {entry.provider?.logo_url ? (
          <Image source={{ uri: entry.provider.logo_url }} style={styles.logo} contentFit="cover" transition={0} />
        ) : (
          <View style={[styles.logo, { backgroundColor: P.accent }]}>
            <Text style={[styles.initials, { color: P.onAccent }]}>{initials}</Text>
          </View>
        )}
        <View style={styles.names}>
          <Text style={styles.provider} numberOfLines={1}>{name}</Text>
          <Text style={styles.service} numberOfLines={1}>{entry.service_label}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={P.sub} />
      </View>
      <View style={styles.bottomRow}>
        <Text style={styles.when}>
          {formatShortDayDate(start)}
          {formatTime12Safe(start) ? ` · ${formatTime12Safe(start)}` : ''}
        </Text>
        <View style={styles.tag}>
          <Ionicons name="open-outline" size={11} color={P.text} />
          <Text style={styles.tagText}>{bookedOnLabel(entry.provider?.external_booking_url)}</Text>
        </View>
      </View>
    </Pressable>
  );
});
ExternalBookingCard.displayName = 'ExternalBookingCard';

type Palette = ReturnType<typeof useTheme>['palette'];

const createStyles = (P: Palette) =>
  StyleSheet.create({
    card: {
      marginHorizontal: 16,
      marginBottom: 10,
      padding: 16,
      gap: 12,
      borderRadius: 22,
      borderWidth: 1.5,
      borderColor: P.accent,
      backgroundColor: P.card,
    },
    pressed: { opacity: 0.85 },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    logo: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    initials: { fontFamily: 'BakbakOne-Regular', fontSize: 16 },
    names: { flex: 1, gap: 2 },
    provider: { fontFamily: 'Jura-VariableFont_wght', fontSize: 16, fontWeight: '700', color: P.text },
    service: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, color: P.sub },
    bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    when: { fontFamily: 'BakbakOne-Regular', fontSize: 15, color: P.text, flexShrink: 1 },
    tag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      height: 26,
      paddingHorizontal: 10,
      borderRadius: 13,
      backgroundColor: P.accentDim,
    },
    tagText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700', color: P.text },
  });
