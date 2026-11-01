import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RefundStep } from '../features/bookings/refundRequestTimeline';

// The step list for a refund request (describeRefundRequestTimeline), drawn
// the same way for the client on their booking and for the provider in the
// Issue a refund sheet.
export default function RefundRequestTimeline({ steps, colors }: {
  steps: RefundStep[];
  colors: { text: string; sub: string; border: string };
}) {
  return (
    <View>
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const dot = step.state === 'done' ? '#34C759'
          : step.state === 'declined' ? '#F44336'
          : step.state === 'current' ? '#FF9500'
          : colors.border;
        return (
          <View key={step.key} style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ alignItems: 'center', width: 16 }}>
              <View style={[styles.dot, step.state === 'upcoming'
                ? { borderColor: dot, borderWidth: 2, backgroundColor: 'transparent' }
                : { backgroundColor: dot }]}>
                {step.state === 'done' && <Ionicons name="checkmark" size={10} color="#FFFFFF" />}
                {step.state === 'declined' && <Ionicons name="close" size={10} color="#FFFFFF" />}
              </View>
              {!last && <View style={[styles.line, { backgroundColor: colors.border }]} />}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ color: step.state === 'upcoming' ? colors.sub : colors.text, fontWeight: '600', fontSize: 13, flex: 1 }}>{step.title}</Text>
                {step.date && <Text style={{ color: colors.sub, fontSize: 12 }}>{step.date}</Text>}
              </View>
              {step.detail && <Text style={{ color: colors.sub, fontSize: 12, lineHeight: 17, marginTop: 2 }}>{step.detail}</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  line: { width: 2, flex: 1, marginTop: 2 },
});
