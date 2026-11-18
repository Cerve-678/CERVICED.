// Building blocks for the Payments & payouts screen, which is one card with
// tabs across its top. Sections inside it are split by a thin line; the
// payout account and each part of Settings sit in a PayCard of their own.
// Nothing uses an icon.
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useBusinessPalette } from '../business-details/BusinessDetailsKit';
import { PROCESSING_EXPLAINED } from './bookingPaymentTimeline';

/** One section of the card. The first one in a tab has no line above it. */
export function PaySection({ title, sub, first = false, children }: {
  title?: string; sub?: string; first?: boolean; children?: React.ReactNode;
}) {
  const C = useBusinessPalette();
  return <View style={[kit.section, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }]}>
    {!!title && <Text accessibilityRole="header" style={[kit.title, { color: C.text }]}>{title}</Text>}
    {!!sub && <Text style={[kit.sub, { color: C.sub }]}>{sub}</Text>}
    {children}
  </View>;
}

/** A card of its own inside the big card: the payout account on Overview,
 *  and each part of Settings, so separate settings read as separate. */
export function PayCard({ title, sub, children }: {
  title?: string; sub?: string; children?: React.ReactNode;
}) {
  const C = useBusinessPalette();
  return <View style={[kit.card, { backgroundColor: C.bg, borderColor: C.border }]}>
    {!!title && <Text accessibilityRole="header" style={[kit.title, { color: C.text }]}>{title}</Text>}
    {!!sub && <Text style={[kit.sub, { color: C.sub }]}>{sub}</Text>}
    {children}
  </View>;
}

/** A small round "i". Tapping it shows or hides `explanation` under `label`. */
export function InfoLabel({ label, explanation, color, labelStyle, ringColor }: {
  label: string; explanation: string; color: string; ringColor?: string | undefined;
  labelStyle?: object | undefined;
}) {
  const [open, setOpen] = useState(false);
  return <View>
    <View style={kit.infoRow}>
      <Text style={[kit.infoLabel, { color }, labelStyle]}>{label}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`What ${label.toLowerCase()} means`}
        accessibilityState={{ expanded: open }} hitSlop={12} activeOpacity={0.7}
        onPress={() => { void Haptics.selectionAsync().catch(() => {}); setOpen(o => !o); }}
        style={[kit.infoDot, { borderColor: ringColor ?? color }]}>
        <Text style={[kit.infoDotText, { color }]}>i</Text>
      </TouchableOpacity>
    </View>
    {open && <Text accessibilityLiveRegion="polite" style={[kit.infoText, { color }]}>{explanation}</Text>}
  </View>;
}

/** "Processing" with its "i". */
export function ProcessingLabel({ color, ringColor, labelStyle }: { color: string; ringColor?: string | undefined; labelStyle?: object | undefined }) {
  return <InfoLabel label="Processing" explanation={PROCESSING_EXPLAINED} color={color} ringColor={ringColor} labelStyle={labelStyle} />;
}

/** A status pill. `attention` outlines it in the accent instead of filling it. */
export function StatusChip({ label, attention = false }: { label: string; attention?: boolean }) {
  const C = useBusinessPalette();
  return <View style={[kit.chip, attention
    ? { borderWidth: 1, borderColor: C.accent, backgroundColor: 'transparent' }
    : { backgroundColor: C.surface }]}>
    <Text style={[kit.chipText, { color: attention ? C.accentText : C.text }]}>{label}</Text>
  </View>;
}

const kit = StyleSheet.create({
  section: { paddingTop: 18, paddingBottom: 6, gap: 4 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginTop: 14, gap: 4 },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 16 },
  sub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 19, marginBottom: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoLabel: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12 },
  infoDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  infoDotText: { fontFamily: 'BakbakOne-Regular', fontSize: 11, lineHeight: 13 },
  infoText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, lineHeight: 17, marginTop: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 100, marginTop: 6 },
  chipText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 11, fontWeight: '600' },
});
