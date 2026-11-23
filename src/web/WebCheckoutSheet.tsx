/**
 * The web's stand-in for the app's Cart. After the booking sheet's Confirm
 * step the client lands here: what they picked sits on top (with Change, back
 * into the same sheet) and the checkout steps go underneath. Drawn in the
 * sheet's own colours, the provider's card and accent, so it reads as the
 * next step of the same flow.
 */
import React, { useMemo } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { buildThemeTokens, isDarkColor } from '../constants/providerThemes';
import type { ProviderThemeTokens } from '../constants/providerThemes';
import { summarizeWebBooking } from './webBooking';
import type { WebBookingChoice } from './webBooking';

const SHEET_MAX_WIDTH = 480;

interface WebCheckoutSheetProps {
  choice: WebBookingChoice | null;
  providerName: string;
  accentColor: string;
  backgroundColor: string;
  onChange: () => void;
  onClose: () => void;
  /** The current checkout step, drawn under the booking. */
  children?: (tokens: ProviderThemeTokens) => React.ReactNode;
}

export function WebCheckoutSheet({
  choice, providerName, accentColor, backgroundColor, onChange, onClose, children,
}: WebCheckoutSheetProps) {
  const tokens = useMemo(
    () => buildThemeTokens(backgroundColor, backgroundColor, accentColor, backgroundColor),
    [backgroundColor, accentColor],
  );
  const summary = useMemo(() => (choice ? summarizeWebBooking(choice) : null), [choice]);
  // The same ink the booking sheet puts on its accent buttons.
  const onAccent = isDarkColor(accentColor) ? '#fff' : '#1B2740';

  return (
    <Modal visible={summary !== null} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        {summary ? (
          <View style={[styles.sheet, { backgroundColor }]}>
            <View style={[styles.header, { borderBottomColor: tokens.border }]}>
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: tokens.text }]}>Your booking</Text>
                <Text style={[styles.subtitle, { color: tokens.sub }]}>{providerName}</Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={[styles.close, { backgroundColor: accentColor }]}
                accessibilityRole="button"
                accessibilityLabel="Close"
                activeOpacity={0.8}
              >
                <Text style={[styles.closeText, { color: onAccent }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.body}>
              <View style={[styles.card, { backgroundColor: tokens.surface }]}>
                <View style={styles.cardText}>
                  <Text style={[styles.serviceName, { color: tokens.text }]}>{summary.serviceName}</Text>
                  <Text style={[styles.detail, { color: tokens.sub }]}>{summary.when}</Text>
                  {summary.addOns.map(addOn => (
                    <Text key={addOn.id} style={[styles.detail, { color: tokens.sub }]}>+ {addOn.name}</Text>
                  ))}
                </View>
                <TouchableOpacity onPress={onChange} accessibilityRole="button" hitSlop={8} activeOpacity={0.6}>
                  <Text style={[styles.changeText, { color: accentColor }]}>Change</Text>
                </TouchableOpacity>
              </View>
              {children?.(tokens)}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%', maxWidth: SHEET_MAX_WIDTH, maxHeight: '90%',
    borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: { flex: 1, gap: 2 },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 18 },
  subtitle: { fontSize: 13 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 15, fontWeight: '700' },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 16 },
  card: { borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardText: { flex: 1, gap: 3 },
  serviceName: { fontSize: 15, fontWeight: '700' },
  detail: { fontSize: 13 },
  changeText: { fontSize: 14, fontWeight: '700' },
});
