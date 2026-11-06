import React from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HowItWorksSheet, type StoryAt, type StoryStep } from '../../components/HowItWorksSheet';
import { BAKBAK, type InfoPackPalette } from './infoPackPalette';

// "How Info Packs work", shown once per account (tour key
// provider_info_packs) and reopened from the screen's ⓘ.
//
// One 14 story-second timeline (played faster by HowItWorksSheet), built from
// the screen's own pieces: the pack card writes itself, a service chip lights
// up, it's sent, then the view turns to the client's phone where the
// notification lands and the pack opens with their booking.

const STEPS: readonly StoryStep[] = [
  { start: 0, end: 3.4, caption: 'Write your aftercare, prep or what-to-bring notes once.' },
  { start: 3.4, end: 6.4, caption: 'Pick the services it goes with.' },
  { start: 6.4, end: 8.6, caption: 'Send it to clients already booked, or keep it for new bookings.' },
  { start: 8.6, end: 14, caption: 'They get a notification and read it with their booking. New bookings get it automatically.' },
];

export function InfoPackWelcome({
  visible, P, exampleTitle, exampleLines, serviceChips, onStart, onClose,
}: {
  visible: boolean;
  P: InfoPackPalette;
  exampleTitle: string;
  exampleLines: string[];
  serviceChips: string[];
  onStart: () => void;
  onClose: () => void;
}) {
  const chips = serviceChips.length > 0 ? serviceChips.slice(0, 3) : ['Your service'];
  const lines = exampleLines.slice(0, 3);

  const renderStage = (at: StoryAt) => {
    const editorOpacity = at([0, 0.2, 8.6, 9.1], [0, 1, 1, 0]);
    const editorScale = at([8.6, 9.1], [1, 0.94]);
    const writeLine = (start: number) => ({
      opacity: at([start, start + 0.45], [0, 1]),
      transform: [{ translateX: at([start, start + 0.45], [-10, 0]) }],
    });
    const chipsIn = { opacity: at([3.5, 3.9], [0, 1]), transform: [{ translateY: at([3.5, 3.9], [8, 0]) }] };
    const chipLit = at([4.5, 4.9], [0, 1]);
    const sentPill = { opacity: at([6.9, 7.2], [0, 1]), transform: [{ scale: at([6.9, 7.2, 7.4], [0.6, 1.08, 1]) }] };

    const phoneIn = { opacity: at([8.8, 9.3], [0, 1]), transform: [{ translateY: at([8.8, 9.4], [40, 0]) }] };
    const notif = {
      opacity: at([9.7, 10.0, 11.1, 11.4], [0, 1, 1, 0]),
      transform: [{ translateY: at([9.7, 10.0], [-26, 0]) }],
    };
    const packRow = { opacity: at([10.3, 10.6], [0, 1]), transform: [{ translateY: at([10.3, 10.6], [6, 0]) }] };
    const tapRing = { opacity: at([11.2, 11.35, 11.6], [0, 0.5, 0]), transform: [{ scale: at([11.2, 11.6], [0.6, 1.4]) }] };
    const packOpen = { transform: [{ translateY: at([11.5, 12.1], [180, 0]) }] };

    return (
      <>
        {/* Editor: the pack card writing itself, then its service chips */}
        <Animated.View style={[st.editor, { opacity: editorOpacity, transform: [{ scale: editorScale }] }]}>
          <View style={[st.packCard, { backgroundColor: P.card, borderColor: P.border, shadowColor: P.shadow }]}>
            <Animated.Text style={[st.packTitle, { color: P.text }, writeLine(0.3)]} numberOfLines={1}>{exampleTitle}</Animated.Text>
            {lines.map((line, i) => (
              <Animated.Text key={line} style={[st.packLine, { color: P.sub }, writeLine(0.9 + i * 0.7)]} numberOfLines={1}>
                {line}
              </Animated.Text>
            ))}
            <Animated.View style={[st.sentPill, { backgroundColor: P.accent }, sentPill]}>
              <Ionicons name="paper-plane" size={11} color={P.onAccent} />
              <Text style={[st.sentPillText, { color: P.onAccent }]}>Sent</Text>
            </Animated.View>
          </View>
          <Animated.View style={[st.chips, chipsIn]}>
            {chips.map((name, i) => (
              <View key={name} style={[st.chip, { backgroundColor: P.card, borderColor: P.border }]}>
                {i === 0 && (
                  <Animated.View style={[StyleSheet.absoluteFill, st.chipLit, { borderColor: P.accent, backgroundColor: P.accentTint, opacity: chipLit }]} />
                )}
                <Text style={[st.chipText, { color: i === 0 ? P.text : P.sub }]} numberOfLines={1}>{name}</Text>
              </View>
            ))}
          </Animated.View>
        </Animated.View>

        {/* Client's phone: their booking, the notification, the pack */}
        <Animated.View style={[st.phone, { borderColor: P.text, backgroundColor: P.bg }, phoneIn]}>
          <View style={[st.phoneBooking, { backgroundColor: P.card }]}>
            <Text style={[st.phoneBookingTitle, { color: P.text }]} numberOfLines={1}>{chips[0]}</Text>
            <Text style={[st.phoneBookingMeta, { color: P.sub }]}>Your booking</Text>
          </View>
          <Text style={[st.phoneLabel, { color: P.sub }]}>INFO PACKS</Text>
          <Animated.View style={[st.phoneRow, { backgroundColor: P.card }, packRow]}>
            <Ionicons name="document-text-outline" size={11} color={P.text} />
            <Text style={[st.phoneRowText, { color: P.text }]} numberOfLines={1}>{exampleTitle}</Text>
            <Text style={[st.phoneNew, { color: P.accent }]}>NEW</Text>
            <Animated.View style={[st.tapRing, { borderColor: P.accent }, tapRing]} />
          </Animated.View>
          <Animated.View style={[st.notif, { backgroundColor: P.card, shadowColor: P.shadow }, notif]}>
            <Text style={[st.notifTitle, { color: P.text }]}>Info From Your Provider</Text>
            <Text style={[st.notifBody, { color: P.sub }]} numberOfLines={1}>Sent you “{exampleTitle}”</Text>
          </Animated.View>
          <Animated.View style={[st.phoneSheet, { backgroundColor: P.card }, packOpen]}>
            <Text style={[st.phoneSheetTitle, { color: P.text }]} numberOfLines={1}>{exampleTitle}</Text>
            {lines.map(line => (
              <Text key={line} style={[st.phoneSheetLine, { color: P.text }]} numberOfLines={2}>{line}</Text>
            ))}
          </Animated.View>
        </Animated.View>
      </>
    );
  };

  return (
    <HowItWorksSheet
      visible={visible}
      P={P}
      heading="Write it once. We send it."
      headingFont={BAKBAK}
      steps={STEPS}
      primaryLabel="Start from an example"
      onPrimary={onStart}
      onClose={onClose}
      renderStage={renderStage}
    />
  );
}

const st = StyleSheet.create({
  editor: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, padding: 14, justifyContent: 'center' },
  packCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 6, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  packTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2, marginRight: 64 },
  packLine: { fontSize: 13 },
  sentPill: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 100 },
  sentPillText: { fontSize: 11, fontWeight: '800' },
  chips: { flexDirection: 'row', gap: 6, marginTop: 12 },
  chip: { borderRadius: 100, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 6, overflow: 'hidden', flexShrink: 1 },
  chipLit: { borderRadius: 100, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '600' },

  phone: { position: 'absolute', alignSelf: 'center', top: 12, bottom: 12, width: 150, borderRadius: 22, borderWidth: 3, padding: 8, overflow: 'hidden' },
  phoneBooking: { borderRadius: 10, padding: 8, marginTop: 4 },
  phoneBookingTitle: { fontSize: 11, fontWeight: '800' },
  phoneBookingMeta: { fontSize: 9, marginTop: 1 },
  phoneLabel: { fontSize: 7, fontWeight: '800', letterSpacing: 1, marginTop: 10, marginBottom: 4 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 7 },
  phoneRowText: { flex: 1, fontSize: 9, fontWeight: '700' },
  phoneNew: { fontSize: 7, fontWeight: '900', letterSpacing: 0.6 },
  tapRing: { position: 'absolute', left: '40%', top: -4, width: 28, height: 28, borderRadius: 14, borderWidth: 2 },
  notif: { position: 'absolute', top: 6, left: 6, right: 6, borderRadius: 10, padding: 7, shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  notifTitle: { fontSize: 8, fontWeight: '800' },
  notifBody: { fontSize: 8, marginTop: 1 },
  phoneSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 150, borderTopLeftRadius: 14, borderTopRightRadius: 14, padding: 10, gap: 5 },
  phoneSheetTitle: { fontSize: 10, fontWeight: '800', marginBottom: 2 },
  phoneSheetLine: { fontSize: 8, lineHeight: 11 },
});
