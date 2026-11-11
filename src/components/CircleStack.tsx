// src/components/CircleStack.tsx
//
// "Rings" (chosen 2026-11-08): small overlapping faces, or initials, of
// people you follow who recommend or have been to this provider. A
// recommender's face carries a tiny heart; a visitor's face is bare. Up to 4
// faces, then "+N" (2 on narrow cards). Tapping opens a sheet saying who
// recommends and who has been, never which service.
//
// Position it from the card (it renders only the row). Renders nothing when
// nobody you follow has been, so cards look exactly as before.

import React, { memo, useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useCircleFor } from '../stores/useCircleStore';
import {
  circleLine,
  firstName,
  initialsFor,
  stackAccessibilityLabel,
  stackLayout,
} from '../features/social/presentation';
import type { CirclePerson } from '../features/social/types';
import TabIcon from './TabIcon';

const FACE = 20;
const OVERLAP = 7;
const RING = 1.5;

interface CircleStackProps {
  providerId: string | null | undefined;
  /** Card width in px; under 140 shows 2 faces instead of 3. */
  cardWidth?: number | undefined;
  /** Provider name for the sheet title. */
  providerName?: string | undefined;
  style?: StyleProp<ViewStyle> | undefined;
}

const Face = memo(function Face({
  person,
  index,
  ringColor,
  fill,
  onFill,
  heartFill,
}: {
  person: CirclePerson;
  index: number;
  ringColor: string;
  fill: string;
  onFill: string;
  heartFill: string;
}) {
  return (
    <View
      style={[
        styles.face,
        { borderColor: ringColor, marginLeft: index === 0 ? 0 : -OVERLAP, zIndex: 10 - index },
      ]}
    >
      {person.avatarUrl ? (
        <Image
          source={{ uri: person.avatarUrl }}
          style={styles.faceImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
        />
      ) : (
        <View style={[styles.faceImage, styles.initials, { backgroundColor: fill }]}>
          <Text style={[styles.initialsText, { color: onFill }]}>{initialsFor(person.name)}</Text>
        </View>
      )}
      {person.recommends && (
        <View style={[styles.heart, { backgroundColor: heartFill, borderColor: ringColor }]}>
          <TabIcon name="heart" size={6} color="#FFFFFF" />
        </View>
      )}
    </View>
  );
});

function CircleStackInner({ providerId, cardWidth, providerName, style }: CircleStackProps) {
  const people = useCircleFor(providerId);
  const { palette: P } = useTheme();
  const [open, setOpen] = useState(false);
  const layout = useMemo(() => stackLayout(people, cardWidth), [people, cardWidth]);
  const label = useMemo(() => stackAccessibilityLabel(people), [people]);

  const onOpen = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setOpen(true);
  }, []);
  const onClose = useCallback(() => setOpen(false), []);

  if (layout.shown.length === 0) return null;

  return (
    <>
      <TouchableOpacity
        onPress={onOpen}
        activeOpacity={0.75}
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.row, style]}
      >
        {layout.shown.map((person, i) => (
          <Face
            key={person.personId}
            person={person}
            index={i}
            ringColor="#FFFFFF"
            fill={P.accent}
            onFill={P.onAccent}
            heartFill="#FF2D78"
          />
        ))}
        {layout.more > 0 && (
          <View style={[styles.face, styles.more, { borderColor: '#FFFFFF', marginLeft: -OVERLAP }]}>
            <Text style={styles.moreText}>+{layout.more}</Text>
          </View>
        )}
      </TouchableOpacity>
      {open && (
        <CircleSheet people={people} providerName={providerName} onClose={onClose} />
      )}
    </>
  );
}

export const CircleStack = memo(CircleStackInner);

function CircleSheet({
  people,
  providerName,
  onClose,
}: {
  people: readonly CirclePerson[];
  providerName?: string | undefined;
  onClose: () => void;
}) {
  const { palette: P } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View
        style={[
          styles.sheet,
          { backgroundColor: P.surfaceRaised, paddingBottom: Math.max(insets.bottom, 16) + 8 },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: P.border }]} />
        <Text style={[styles.sheetTitle, { color: P.text }]}>
          {people.some((p) => !p.isMe) ? 'People you follow' : 'Your recommendation'}
        </Text>
        {providerName ? (
          <Text style={[styles.sheetSub, { color: P.sub }]} numberOfLines={1}>
            at {providerName}
          </Text>
        ) : null}
        {people.map((person) => (
          <View key={person.personId} style={[styles.sheetRow, { borderColor: P.sep }]}>
            <Face
              person={person}
              index={0}
              ringColor={P.surfaceRaised}
              fill={P.accent}
              onFill={P.onAccent}
              heartFill="#FF2D78"
            />
            <Text style={[styles.sheetName, { color: P.text }]} numberOfLines={1}>
              {person.isMe ? 'You' : firstName(person.name)}
            </Text>
            <Text style={[styles.sheetLine, { color: person.recommends ? P.accentText : P.sub }]}>
              {circleLine(person)}
            </Text>
          </View>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    // Warm shadow so the white rings read on bright photos.
    shadowColor: '#2A1A14',
    shadowOpacity: 0.28,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  face: {
    width: FACE,
    height: FACE,
    borderRadius: FACE / 2,
    borderWidth: RING,
  },
  faceImage: {
    width: FACE - RING * 2,
    height: FACE - RING * 2,
    borderRadius: (FACE - RING * 2) / 2,
  },
  initials: { alignItems: 'center', justifyContent: 'center' },
  initialsText: { fontSize: 7, fontWeight: '700', letterSpacing: 0.2 },
  heart: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  more: {
    backgroundColor: 'rgba(20,14,12,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: { color: '#FFFFFF', fontSize: 8, fontWeight: '700' },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 14 },
  sheetTitle: { fontSize: 17, fontWeight: '700' },
  sheetSub: { fontSize: 13, marginTop: 2, marginBottom: 6 },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  sheetName: { flex: 1, fontSize: 15, fontWeight: '600' },
  sheetLine: { fontSize: 13, fontWeight: '500' },
});
