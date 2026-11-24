import React, { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

// The floating "Want them on CERVICED? [Nudge] ✕" bar a client sees on a page
// for a business they can't book here: a link-only provider's profile, and a
// "Not on CERVICED yet" directory listing. Fixed near-black so it reads over
// any theme. The caller owns sending the nudge (record_provider_stat
// 'join_nudge', one per client per business per day) and where the bar sits.

interface Props {
  /** Distance from the bottom of the screen. */
  bottom: number;
  /** The business's name, for the screen reader label. */
  businessName: string;
  sent: boolean;
  pending: boolean;
  /** Shown once the nudge has gone through. */
  sentLabel?: string;
  onNudge: () => void;
  onDismiss: () => void;
}

export const JoinNudgeBar = memo<Props>(({
  bottom,
  businessName,
  sent,
  pending,
  sentLabel = 'Nudge sent',
  onNudge,
  onDismiss,
}) => (
  <View style={[styles.bar, { bottom }]}>
    <Ionicons name={sent ? 'checkmark-circle' : 'megaphone-outline'} size={18} color="#FFFFFF" />
    <Text style={styles.text} numberOfLines={1}>
      {sent ? sentLabel : 'Want them on CERVICED?'}
    </Text>
    {!sent && (
      <TouchableOpacity
        style={[styles.button, pending && styles.buttonMuted]}
        onPress={() => { Haptics.selectionAsync().catch(() => {}); onNudge(); }}
        disabled={pending}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Nudge ${businessName} to take bookings on CERVICED`}
      >
        <Text style={styles.buttonText}>{pending ? 'Sending…' : 'Nudge'}</Text>
      </TouchableOpacity>
    )}
    <TouchableOpacity
      style={styles.close}
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onDismiss(); }}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Dismiss"
    >
      <Ionicons name="close" size={18} color="rgba(255,255,255,0.8)" />
    </TouchableOpacity>
  </View>
));
JoinNudgeBar.displayName = 'JoinNudgeBar';

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 999,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#050505',
    paddingLeft: 18,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.34,
    shadowRadius: 12,
    elevation: 8,
  },
  text: {
    flex: 1,
    color: '#FFFFFF',
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    fontWeight: '700',
  },
  button: {
    height: 42,
    borderRadius: 21,
    paddingHorizontal: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonMuted: {
    opacity: 0.55,
  },
  buttonText: {
    color: '#26201E',
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    fontWeight: '700',
  },
  close: {
    width: 36,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
