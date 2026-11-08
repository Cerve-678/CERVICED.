import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * "Post anonymously" switch for the rating sheets. Off by default; the sheet
 * owns the state and resets it with the rest of the form.
 *
 * The promise in the subtitle is kept by the database, not this screen: an
 * anonymous review is hidden from the provider's direct reads, and every
 * reader returns it with no reviewer and no booking link
 * (supabase/migrations/20261108200000_anonymous_reviews.sql).
 */
export function AnonymousReviewToggle({
  value,
  onValueChange,
  palette,
  disabled = false,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  palette: { text: string; sub: string; accent: string; border: string };
  disabled?: boolean;
}) {
  return (
    <View style={[styles.row, { borderColor: palette.border }]}>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: palette.text }]}>Post anonymously</Text>
        <Text style={[styles.sub, { color: palette.sub }]}>
          Your name won't be shown on the review.
        </Text>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          Haptics.selectionAsync().catch(() => {});
          onValueChange(next);
        }}
        trackColor={{ false: '#D1D1D6', true: palette.accent }}
        thumbColor={value ? '#fff' : '#f4f3f4'}
        accessibilityLabel="Post anonymously"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    marginBottom: 16,
  },
  copy: { flex: 1 },
  title: { fontSize: 14, fontWeight: '600' },
  sub: { fontSize: 12, lineHeight: 16, marginTop: 2 },
});
