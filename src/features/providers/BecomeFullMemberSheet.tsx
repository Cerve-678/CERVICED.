// src/features/providers/BecomeFullMemberSheet.tsx
// The one place a link-only provider confirms becoming a full member. Every
// entry point (the Home card, the nudge bar, the "Full CERVICED experience"
// page) opens this rather than switching straight away, because the switch
// takes them off Search and can't be undone in the app — they have to read
// that first.
//
// On success AuthContext flips myBookingMode to 'cerviced', which swaps the
// link-only tabs for the full provider set, so this sheet (and the screen
// that opened it) simply unmounts. The full Home then shows the go-live
// checklist they need to finish.
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useSystemBottomInset } from '../../utils/bottomSafeGap';
import { toUserMessageAllowingDbGuard } from '../../utils/userFacingError';
import {
  FULL_MEMBER_FREE_MONTHS,
  FULL_MEMBER_FREE_START_LINE,
  FULL_MEMBER_PRICE_LINE,
} from '../../constants/fullMembership';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const NOT_LIVE = '#B07A3C';

const CHANGES: { icon: IconName; title: string; body: string; warn?: boolean }[] = [
  { icon: 'unlink-outline', title: 'Your booking link goes', body: 'Clients book and pay you in CERVICED instead.' },
  {
    icon: 'eye-off-outline',
    title: "You come off CERVICED until you go live again",
    body: "Clients can't find you while you add your services and prices, business address and booking policies.",
    warn: true,
  },
  { icon: 'arrow-forward', title: "It's one way", body: "You can't switch back to your own link in the app." },
  { icon: 'checkmark', title: "Everything you've built stays", body: 'Your logo, About, hours, portfolio, messages and saves.' },
];

interface BecomeFullMemberSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function BecomeFullMemberSheet({ visible, onClose }: BecomeFullMemberSheetProps) {
  const { palette: P } = useTheme();
  const { becomeFullMember } = useAuth();
  const bottomInset = useSystemBottomInset();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (pending) return;
    setError(null);
    onClose();
  };

  const confirm = async () => {
    if (pending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setPending(true);
    setError(null);
    try {
      await becomeFullMember();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // No state to reset: the link-only tabs unmount from here.
    } catch (err) {
      setError(toUserMessageAllowingDbGuard(err, "We couldn't switch you over. Please try again.", '[BecomeFullMember]'));
      setPending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <Pressable style={styles.overlay} onPress={close}>
        <Pressable
          style={[styles.sheet, { backgroundColor: P.card, paddingBottom: bottomInset + 16 }]}
          onPress={e => e.stopPropagation()}
        >
          <View style={[styles.grabber, { backgroundColor: P.border }]} />

          <Text style={[styles.kicker, { color: P.sub }]}>TAKE BOOKINGS ON CERVICED</Text>
          <Text style={[styles.title, { color: P.text }]}>Become a full member</Text>

          <View style={[styles.offer, { backgroundColor: P.accent }]}>
            <Text style={[styles.offerNumber, { color: P.onAccent }]}>{FULL_MEMBER_FREE_MONTHS}</Text>
            <View style={styles.flex}>
              <Text style={[styles.offerKicker, { color: P.onAccent }]}>MONTHS FREE ON US</Text>
              <Text style={[styles.offerSub, { color: P.onAccent }]}>{FULL_MEMBER_PRICE_LINE}</Text>
            </View>
          </View>
          <Text style={[styles.freeStart, { color: P.sub }]}>{FULL_MEMBER_FREE_START_LINE}</Text>

          <Text style={[styles.sectionLabel, { color: P.sub }]}>WHAT CHANGES</Text>
          <View style={styles.changes}>
            {CHANGES.map(change => (
              <View key={change.title} style={styles.change}>
                <View style={[styles.changeIcon, { backgroundColor: change.warn ? 'rgba(176,122,60,0.16)' : P.accentDim }]}>
                  <Ionicons name={change.icon} size={16} color={change.warn ? NOT_LIVE : P.accent} />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.changeTitle, { color: P.text }]}>{change.title}</Text>
                  <Text style={[styles.changeBody, { color: P.sub }]}>{change.body}</Text>
                </View>
              </View>
            ))}
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.primary, { backgroundColor: P.accent }, pending && styles.muted]}
            onPress={() => { void confirm(); }}
            disabled={pending}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            {pending ? (
              <ActivityIndicator color={P.onAccent} />
            ) : (
              <Text style={[styles.primaryText, { color: P.onAccent }]}>Become a full member</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={close} disabled={pending} activeOpacity={0.7} accessibilityRole="button">
            <Text style={[styles.secondaryText, { color: P.sub }]}>Not now</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, maxHeight: '92%' },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, marginBottom: 18 },
  kicker: { fontFamily: 'BakbakOne-Regular', fontSize: 10, letterSpacing: 1.5 },
  title: { fontFamily: 'Prata-Regular', fontSize: 28, lineHeight: 36, marginTop: 4 },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16, marginTop: 14 },
  offerNumber: { fontFamily: 'BakbakOne-Regular', fontSize: 44, lineHeight: 50 },
  offerKicker: { fontFamily: 'BakbakOne-Regular', fontSize: 12, letterSpacing: 1.4 },
  offerSub: { fontSize: 13, marginTop: 2, opacity: 0.88 },
  freeStart: { fontSize: 13, lineHeight: 18, marginTop: 8 },
  sectionLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 11, letterSpacing: 1.4, marginTop: 22 },
  changes: { gap: 14, marginTop: 12 },
  change: { flexDirection: 'row', gap: 12 },
  changeIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  changeTitle: { fontSize: 15, fontWeight: '600' },
  changeBody: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  error: { color: '#B0563C', fontSize: 13, lineHeight: 18, marginTop: 16 },
  primary: { height: 52, borderRadius: 100, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  muted: { opacity: 0.6 },
  primaryText: { fontFamily: 'BakbakOne-Regular', fontSize: 16 },
  secondary: { height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  secondaryText: { fontFamily: 'BakbakOne-Regular', fontSize: 14 },
});
