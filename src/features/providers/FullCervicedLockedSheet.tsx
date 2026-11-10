// src/features/providers/FullCervicedLockedSheet.tsx
// What a link-only provider sees when they tap something kept for full members
// (a locked colour set, font or hero finish in Branding, or the Achievements
// row). It lists what full members unlock and leads to the Full CERVICED
// experience page; it never switches them over itself — that is
// BecomeFullMemberSheet's job, reached from that page.
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { useSystemBottomInset } from '../../utils/bottomSafeGap';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const PERKS: { icon: IconName; title: string }[] = [
  { icon: 'color-palette-outline', title: 'Every colour set' },
  { icon: 'text-outline', title: 'Every font' },
  { icon: 'sparkles-outline', title: 'Every hero finish' },
  { icon: 'brush-outline', title: 'Make your own colours' },
  { icon: 'ribbon-outline', title: 'Achievements' },
];

interface FullCervicedLockedSheetProps {
  visible: boolean;
  title: string;
  /** What they can already use, shown under the list. */
  note?: string;
  onClose: () => void;
  onSeeMore: () => void;
}

export function FullCervicedLockedSheet({ visible, title, note, onClose, onSeeMore }: FullCervicedLockedSheetProps) {
  const { palette: P } = useTheme();
  const bottomInset = useSystemBottomInset();

  const seeMore = () => {
    Haptics.selectionAsync().catch(() => {});
    onClose();
    onSeeMore();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: P.card, paddingBottom: bottomInset + 16 }]}
          onPress={e => e.stopPropagation()}
        >
          <View style={[styles.grabber, { backgroundColor: P.border }]} />

          <Text style={[styles.kicker, { color: P.sub }]}>FULL CERVICED EXPERIENCE</Text>
          <Text style={[styles.title, { color: P.text }]}>{title}</Text>

          <View style={styles.perks}>
            {PERKS.map(perk => (
              <View key={perk.title} style={styles.perk}>
                <View style={[styles.perkIcon, { backgroundColor: P.accentDim }]}>
                  <Ionicons name={perk.icon} size={16} color={P.accent} />
                </View>
                <Text style={[styles.perkTitle, { color: P.text }]}>{perk.title}</Text>
              </View>
            ))}
          </View>

          {note ? <Text style={[styles.note, { color: P.sub }]}>{note}</Text> : null}

          <TouchableOpacity
            style={[styles.primary, { backgroundColor: P.accent }]}
            onPress={seeMore}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={[styles.primaryText, { color: P.onAccent }]}>See what full members get</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={onClose} activeOpacity={0.7} accessibilityRole="button">
            <Text style={[styles.secondaryText, { color: P.sub }]}>Not now</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, maxHeight: '92%' },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, marginBottom: 18 },
  kicker: { fontFamily: 'JosefinSans-Bold', fontSize: 10, letterSpacing: 1.5 },
  title: { fontFamily: 'Prata-Regular', fontSize: 28, lineHeight: 36, marginTop: 4 },
  perks: { gap: 12, marginTop: 20 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  perkIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  perkTitle: { fontSize: 15, fontWeight: '600' },
  note: { fontSize: 13, lineHeight: 18, marginTop: 18 },
  primary: { height: 52, borderRadius: 100, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  primaryText: { fontFamily: 'JosefinSans-Bold', fontSize: 16 },
  secondary: { height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  secondaryText: { fontFamily: 'JosefinSans-Bold', fontSize: 14 },
});
