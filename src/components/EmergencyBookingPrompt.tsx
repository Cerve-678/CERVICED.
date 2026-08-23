/**
 * The confirmation shown when a client picks a time the provider's own
 * scheduling rules exclude — outside their hours, on a date they blocked, at
 * short notice, or beyond their booking window — and that provider has opted
 * into being asked anyway (providers.allow_*_requests).
 *
 * Deliberately NOT an Alert. Two things have to happen here that a three-
 * button Alert can't do: the client has to be able to open and read the
 * provider's own policy without losing the confirmation they're mid-way
 * through, and their acknowledgement has to be an explicit, deliberate tick
 * rather than whichever button their thumb lands on. That tick is also what
 * satisfies prepare_checkout's server-side emergency_ack requirement, so it
 * isn't decoration — a booking can't proceed without it.
 *
 * Colours come from the caller, never from the app's light/dark setting —
 * same rule as ModernBeautyCalendar and the sheets this renders inside, so
 * the prompt always matches whatever backdrop it lands on.
 */
import React, { useMemo } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { describeEmergencyReason, type EmergencyReason } from '../services/AvailabilityService';
import { formatLongDateNoYear } from '../utils/dateUtils';
import { withAlpha } from '../constants/providerThemes';

interface EmergencyBookingPromptProps {
  visible: boolean;
  /** How the provider is named to the client — their display name. */
  providerName: string;
  /** 'YYYY-MM-DD' of the picked slot. */
  date: string;
  /** The picked slot, already formatted ('7:00 PM'). */
  time: string;
  /** Every rule this time breaks, from the slot itself. */
  reasons: EmergencyReason[];
  /** Whether this provider has written any terms to send the client to. When
   *  false the policy link is hidden and the acknowledgement drops its
   *  reference to reading one, rather than pointing at nothing. */
  hasPolicy: boolean;
  /** Opens the provider's terms. The caller owns that modal (both sheets
   *  already render one), so this prompt stays open underneath it. */
  onReadPolicy: () => void;
  /** Ticked-and-confirmed. */
  onConfirm: () => void;
  /** Backed out — the caller should clear the picked time, since it isn't
   *  bookable on any other terms. */
  onCancel: () => void;
  acknowledged: boolean;
  onToggleAcknowledged: () => void;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  subColor: string;
}

export const EmergencyBookingPrompt: React.FC<EmergencyBookingPromptProps> = ({
  visible,
  providerName,
  date,
  time,
  reasons,
  hasPolicy,
  onReadPolicy,
  onConfirm,
  onCancel,
  acknowledged,
  onToggleAcknowledged,
  accentColor,
  backgroundColor,
  textColor,
  subColor,
}) => {
  // "outside Ana's working hours", or "outside Ana's working hours and at
  // shorter notice than Ana normally accepts" — a slot can break more than
  // one rule at once (a blocked date beyond the booking window, say), and
  // naming only the first would misdescribe what's being asked for.
  const reasonText = useMemo(() => {
    const parts = reasons.map(reason => describeEmergencyReason(reason, providerName));
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0]!;
    return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]!}`;
  }, [reasons, providerName]);

  const handleConfirm = () => {
    if (!acknowledged) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onConfirm();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor }]}>
          <ScrollView bounces={false} contentContainerStyle={styles.cardBody}>
            <Text style={[styles.title, { color: textColor }]}>Scheduling conflict</Text>

            <Text style={[styles.lead, { color: textColor }]}>
              {formatLongDateNoYear(date)} at {time} is {reasonText}.
            </Text>

            <Text style={[styles.question, { color: textColor }]}>
              Do you want this to be considered an emergency booking?
            </Text>

            <Text style={[styles.detail, { color: subColor }]}>
              {providerName} has to accept it before it's confirmed — it won't be
              booked automatically, and they may say no.
            </Text>

            {hasPolicy && (
              <TouchableOpacity
                style={[styles.policyRow, { borderColor: withAlpha(accentColor, 0.45) }]}
                onPress={onReadPolicy}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`Read ${providerName}'s terms and conditions`}
              >
                <Text style={[styles.policyText, { color: accentColor }]}>
                  Read {providerName}'s policy first
                </Text>
                <Text style={[styles.policyChevron, { color: accentColor }]}>›</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.ackRow}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onToggleAcknowledged();
              }}
              activeOpacity={0.75}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acknowledged }}
            >
              <View
                style={[
                  styles.checkbox,
                  { borderColor: acknowledged ? accentColor : withAlpha(textColor, 0.35) },
                  acknowledged && { backgroundColor: accentColor },
                ]}
              >
                {acknowledged && <Text style={styles.checkboxTick}>✓</Text>}
              </View>
              <Text style={[styles.ackText, { color: textColor }]}>
                {hasPolicy
                  ? `I've read ${providerName}'s policy and want to request this time.`
                  : `I understand this is outside ${providerName}'s normal availability and they have to accept it.`}
              </Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.buttonGhost, { borderColor: withAlpha(textColor, 0.2) }]}
              onPress={onCancel}
              activeOpacity={0.75}
              accessibilityRole="button"
            >
              <Text style={[styles.buttonGhostText, { color: textColor }]}>Pick another time</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: accentColor },
                !acknowledged && styles.buttonDisabled,
              ]}
              onPress={handleConfirm}
              disabled={!acknowledged}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ disabled: !acknowledged }}
            >
              <Text style={styles.buttonPrimaryText}>Request this time</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: { width: '100%', maxWidth: 380, maxHeight: '80%', borderRadius: 22, overflow: 'hidden' },
  cardBody: { padding: 22, paddingBottom: 8 },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 19, marginBottom: 10 },
  lead: { fontSize: 15, lineHeight: 21, fontWeight: '600', marginBottom: 14 },
  question: { fontSize: 15, lineHeight: 21, marginBottom: 8 },
  detail: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  policyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  policyText: { fontSize: 14, fontWeight: '600', flex: 1 },
  policyChevron: { fontSize: 18, fontWeight: '600', marginLeft: 8 },
  ackRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingBottom: 12 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  checkboxTick: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  ackText: { flex: 1, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 22, paddingBottom: 20, paddingTop: 4 },
  button: { flex: 1, borderRadius: 14, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  buttonGhost: { borderWidth: 1 },
  buttonGhostText: { fontSize: 14, fontWeight: '600' },
  buttonDisabled: { opacity: 0.4 },
  buttonPrimaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
