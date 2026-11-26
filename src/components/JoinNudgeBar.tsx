import React, { memo, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

// The floating "Want them on CERVICED? [Nudge] ✕" bar a client sees on a page
// for a business they can't book here: a link-only provider's profile, and a
// "Not on CERVICED yet" directory listing. Fixed near-black so it reads over
// any theme. The caller owns sending the nudge (record_provider_stat
// 'join_nudge', one per client per business per day) and where the bar sits.
//
// Two placements, one look: JoinNudgeBar spans the screen (link-only
// profile); JoinNudgeSideToast slides in from the right edge and tucks itself
// into a small tab, so it never sits over the page for long (directory
// listing, where the notice and buttons fill the screen).

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

/** How much of the tucked toast stays on screen: the megaphone tab. */
const TAB_WIDTH = 52;

interface SideProps {
  bottom: number;
  businessName: string;
  sent: boolean;
  pending: boolean;
  sentLabel?: string;
  onNudge: () => void;
}

export const JoinNudgeSideToast = memo<SideProps>(({
  bottom,
  businessName,
  sent,
  pending,
  sentLabel = 'Nudge sent',
  onNudge,
}) => {
  const [width, setWidth] = useState(0);
  // null until it first slides in, then open or tucked.
  const [open, setOpen] = useState<boolean | null>(null);
  const x = useRef(new Animated.Value(1000)).current;

  useEffect(() => {
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!width) return;
    const toValue = open === null ? width : open ? 0 : width - TAB_WIDTH;
    Animated.spring(x, { toValue, useNativeDriver: true, tension: 80, friction: 12 }).start();
  }, [open, width, x]);

  // Tucks away after a few seconds, untouched or once the nudge has gone.
  useEffect(() => {
    if (!open || pending) return;
    const t = setTimeout(() => setOpen(false), sent ? 3000 : 4000);
    return () => clearTimeout(t);
  }, [open, pending, sent]);

  const expand = () => {
    Haptics.selectionAsync().catch(() => {});
    setOpen(true);
  };

  return (
    <Animated.View
      style={[styles.side, { bottom, transform: [{ translateX: x }] }]}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
    >
      <View
        style={styles.sideContent}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      >
        <Ionicons name={sent ? 'checkmark-circle' : 'megaphone-outline'} size={18} color="#FFFFFF" />
        <Text style={styles.sideText} numberOfLines={2}>
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
      </View>
      {open === false && (
        <TouchableOpacity
          style={styles.sideTab}
          onPress={expand}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={sent ? sentLabel : `Nudge ${businessName} to join CERVICED`}
        />
      )}
    </Animated.View>
  );
});
JoinNudgeSideToast.displayName = 'JoinNudgeSideToast';

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
  side: {
    position: 'absolute',
    right: 0,
    zIndex: 999,
    minHeight: 58,
    borderTopLeftRadius: 29,
    borderBottomLeftRadius: 29,
    backgroundColor: '#050505',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.34,
    shadowRadius: 12,
    elevation: 8,
  },
  sideContent: {
    minHeight: 58,
    paddingLeft: 18,
    paddingRight: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sideText: {
    maxWidth: 150,
    color: '#FFFFFF',
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    fontWeight: '700',
  },
  sideTab: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: TAB_WIDTH,
  },
  close: {
    width: 36,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
