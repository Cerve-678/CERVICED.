import React from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HowItWorksSheet, type HowItWorksPalette, type StoryAt, type StoryStep } from '../../components/HowItWorksSheet';
import type { IntakeFormQuestion } from '../../services/databaseService';

// "How Forms work", shown once per account (tour key provider_forms) and
// reopened from the Forms screen's ⓘ. The Info Packs welcome's sibling, on the
// same HowItWorksSheet: the form builds itself, links to a service with
// auto-send, lands on the client's phone as "Form to Complete", gets answered
// and signed, then comes back to the provider as "Form Completed" on the
// booking. Every step names something the app really does.

const STEPS: readonly StoryStep[] = [
  { start: 0, end: 3.4, caption: 'Build a form once, from a template or your own questions.' },
  { start: 3.4, end: 6.4, caption: 'Link it to services and turn on auto-send, so it goes out when they’re booked.' },
  { start: 6.4, end: 10.4, caption: 'Your client gets a notification, fills it in and signs if you ask them to.' },
  { start: 10.4, end: 13.5, caption: 'You’re told when it’s back, and their answers sit on the booking.' },
];

export type FormsWelcomeQuestion = Pick<IntakeFormQuestion, 'type' | 'label'>;

/** Plain, non-medical stand-ins for a provider with no matching template. */
export const FALLBACK_WELCOME_QUESTIONS: FormsWelcomeQuestion[] = [
  { type: 'yesno', label: 'Is this your first visit?' },
  { type: 'text', label: 'Anything I should know before your appointment?' },
  { type: 'choice', label: 'How did you hear about me?' },
];

const TYPE_ICON: Record<IntakeFormQuestion['type'], keyof typeof Ionicons.glyphMap> = {
  text: 'create-outline',
  yesno: 'checkmark-circle-outline',
  choice: 'list-outline',
  policy: 'document-text-outline',
};

export function FormsWelcome({
  visible, P, exampleTitle, exampleQuestions, serviceChips, onStart, onClose,
}: {
  visible: boolean;
  P: HowItWorksPalette & { bg: string; sub: string };
  exampleTitle: string;
  exampleQuestions: FormsWelcomeQuestion[];
  serviceChips: string[];
  onStart: () => void;
  onClose: () => void;
}) {
  const chips = serviceChips.length > 0 ? serviceChips.slice(0, 3) : ['Your service'];
  const questions = (exampleQuestions.length > 0 ? exampleQuestions : FALLBACK_WELCOME_QUESTIONS).slice(0, 3);
  // The client's half answers one tap question and one typed one, so pick
  // those types rather than whatever happens to come first.
  const first = questions.find(q => q.type === 'yesno') ?? FALLBACK_WELCOME_QUESTIONS[0]!;
  const second = questions.find(q => q.type === 'text') ?? FALLBACK_WELCOME_QUESTIONS[1]!;
  const tint = `${P.accent}1F`;
  // The stage's tiny text: the screen's #7E6667 sub is ~3:1 on the dark card,
  // too faint at 8-11pt, so dim the main text colour instead.
  const muted = { color: P.text, opacity: 0.62 };

  const renderStage = (at: StoryAt) => {
    // ── Provider builds it ──
    const editorOpacity = at([0, 0.2, 6.4, 6.9], [0, 1, 1, 0]);
    const editorScale = at([6.4, 6.9], [1, 0.94]);
    const writeIn = (start: number) => ({
      opacity: at([start, start + 0.45], [0, 1]),
      transform: [{ translateX: at([start, start + 0.45], [-10, 0]) }],
    });
    const countPill = { opacity: at([2.5, 2.8], [0, 1]), transform: [{ scale: at([2.5, 2.8, 3.0], [0.6, 1.08, 1]) }] };
    const chipsIn = { opacity: at([3.5, 3.9], [0, 1]), transform: [{ translateY: at([3.5, 3.9], [8, 0]) }] };
    const chipLit = at([4.3, 4.7], [0, 1]);
    const autoIn = { opacity: at([4.8, 5.1], [0, 1]) };
    const knob = { transform: [{ translateX: at([5.3, 5.6], [0, 10]) }] };
    const trackOn = at([5.3, 5.6], [0, 1]);

    // ── Client answers it ──
    const phoneOpacity = at([6.6, 7.1, 11.2, 11.6], [0, 1, 1, 0]);
    const phoneY = at([6.6, 7.2], [40, 0]);
    const notif = {
      opacity: at([7.4, 7.7, 8.4, 8.7], [0, 1, 1, 0]),
      transform: [{ translateY: at([7.4, 7.7], [-26, 0]) }],
    };
    const formUp = { transform: [{ translateY: at([8.4, 9.0], [190, 0]) }] };
    const yesFill = at([9.2, 9.4], [0, 1]);
    const tapRing = { opacity: at([9.1, 9.25, 9.5], [0, 0.5, 0]), transform: [{ scale: at([9.1, 9.5], [0.6, 1.4]) }] };
    const typed = { opacity: at([9.5, 9.8], [0, 1]) };
    // Drawn left to right: the stroke slides out from behind a fixed mask.
    const signStroke = { transform: [{ translateX: at([9.7, 10.1], [-SIGN_W, 0]) }] };
    // Lands before the step ends, so Reduce Motion's finished frame shows it.
    const submitted = { opacity: at([10.1, 10.3], [0, 1]), transform: [{ scale: at([10.1, 10.3, 10.38], [0.6, 1.08, 1]) }] };

    // ── Back to the provider ──
    const backIn = { opacity: at([11.4, 11.9], [0, 1]), transform: [{ translateY: at([11.4, 11.9], [16, 0]) }] };
    const doneNotif = {
      opacity: at([11.8, 12.1], [0, 1]),
      transform: [{ translateY: at([11.8, 12.1], [-26, 0]) }],
    };
    const donePill = { opacity: at([12.2, 12.5], [0, 1]), transform: [{ scale: at([12.2, 12.5, 12.7], [0.6, 1.08, 1]) }] };
    const answers = (start: number) => ({ opacity: at([start, start + 0.35], [0, 1]) });

    return (
      <>
        {/* Provider: the form building itself, then its services + auto-send */}
        <Animated.View style={[st.fill, st.editor, { opacity: editorOpacity, transform: [{ scale: editorScale }] }]}>
          <View style={[st.formCard, { backgroundColor: P.card, borderColor: P.border }]}>
            <View style={st.formTop}>
              <Animated.Text style={[st.formTitle, { color: P.text }, writeIn(0.3)]} numberOfLines={1}>{exampleTitle}</Animated.Text>
              <Animated.View style={[st.countPill, { backgroundColor: P.surface, borderColor: P.border }, countPill]}>
                <Text style={[st.countText, muted]}>{questions.length}q</Text>
              </Animated.View>
            </View>
            {questions.map((q, i) => (
              <Animated.View key={q.label} style={[st.qRow, { borderTopColor: P.border }, writeIn(0.9 + i * 0.6)]}>
                <View style={[st.qIcon, { backgroundColor: P.iconBg }]}>
                  <Ionicons name={TYPE_ICON[q.type]} size={11} color={P.text} />
                </View>
                <Text style={[st.qLabel, { color: P.text }]} numberOfLines={1}>{q.label}</Text>
              </Animated.View>
            ))}
          </View>
          <View style={st.belowCard}>
            <Animated.View style={[st.chips, chipsIn]}>
              {chips.map((name, i) => (
                <View key={name} style={[st.chip, { backgroundColor: P.card, borderColor: P.border }]}>
                  {i === 0 && (
                    <Animated.View style={[StyleSheet.absoluteFill, st.chipLit, { borderColor: P.accent, backgroundColor: tint, opacity: chipLit }]} />
                  )}
                  <Text style={[st.chipText, { color: i === 0 ? P.text : P.sub }]} numberOfLines={1}>{name}</Text>
                </View>
              ))}
            </Animated.View>
            <Animated.View style={[st.auto, autoIn]}>
              <Text style={[st.autoText, { color: P.text }]}>Auto-send</Text>
              <View style={[st.track, { backgroundColor: P.border }]}>
                <Animated.View style={[StyleSheet.absoluteFill, st.trackOn, { backgroundColor: P.accent, opacity: trackOn }]} />
                <Animated.View style={[st.knob, { backgroundColor: P.card }, knob]} />
              </View>
            </Animated.View>
          </View>
        </Animated.View>

        {/* Client's phone: the notification, then the form to fill in */}
        <Animated.View style={[st.phone, { borderColor: P.text, backgroundColor: P.bg, opacity: phoneOpacity, transform: [{ translateY: phoneY }] }]}>
          <View style={[st.phoneBooking, { backgroundColor: P.card }]}>
            <Text style={[st.phoneBookingTitle, { color: P.text }]} numberOfLines={1}>{chips[0]}</Text>
            <Text style={[st.phoneBookingMeta, muted]}>Your booking</Text>
          </View>
          <Animated.View style={[st.notif, { backgroundColor: P.card }, notif]}>
            <Text style={[st.notifTitle, { color: P.text }]}>Form to Complete</Text>
            <Text style={[st.notifBody, muted]} numberOfLines={1}>“{exampleTitle}” to fill in</Text>
          </Animated.View>
          <Animated.View style={[st.phoneSheet, { backgroundColor: P.card }, formUp]}>
            <Text style={[st.phoneSheetTitle, { color: P.text }]} numberOfLines={1}>{exampleTitle}</Text>
            <Text style={[st.phoneQ, { color: P.text }]} numberOfLines={1}>{first.label}</Text>
            <View style={st.yesNo}>
              <View style={[st.answerPill, { borderColor: P.border }]}>
                <Animated.View style={[StyleSheet.absoluteFill, st.answerPillFill, { borderColor: P.accent, backgroundColor: tint, opacity: yesFill }]} />
                <Text style={[st.answerPillText, { color: P.text }]}>Yes</Text>
                <Animated.View style={[st.tapRing, { borderColor: P.accent }, tapRing]} />
              </View>
              <View style={[st.answerPill, { borderColor: P.border }]}>
                <Text style={[st.answerPillText, muted]}>No</Text>
              </View>
            </View>
            <Text style={[st.phoneQ, { color: P.text }]} numberOfLines={1}>{second.label}</Text>
            <View style={[st.typedBox, { borderColor: P.border }]}>
              <Animated.Text style={[st.typedText, { color: P.text }, typed]} numberOfLines={1}>{TYPED_ANSWER}</Animated.Text>
            </View>
            <View style={st.signRow}>
              <View style={[st.signMask, { borderBottomColor: P.border }]}>
                <Animated.View style={[st.signStroke, { backgroundColor: P.text }, signStroke]} />
              </View>
              <Animated.View style={[st.submitted, { backgroundColor: P.accent }, submitted]}>
                <Ionicons name="checkmark" size={9} color={P.onAccent} />
                <Text style={[st.submittedText, { color: P.onAccent }]}>Sent</Text>
              </Animated.View>
            </View>
          </Animated.View>
        </Animated.View>

        {/* Provider again: the notification and the booking with answers */}
        <Animated.View style={[st.fill, st.back, backIn]}>
          <Animated.View style={[st.backNotif, { backgroundColor: P.card, borderColor: P.border }, doneNotif]}>
            <View style={[st.qIcon, { backgroundColor: P.iconBg }]}>
              <Ionicons name="checkmark-done-outline" size={11} color={P.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.backNotifTitle, { color: P.text }]}>Form Completed</Text>
              <Text style={[st.backNotifBody, muted]} numberOfLines={1}>Your client filled in “{exampleTitle}”</Text>
            </View>
          </Animated.View>
          <View style={[st.bookingCard, { backgroundColor: P.card, borderColor: P.border }]}>
            <View style={st.formTop}>
              <Text style={[st.formTitle, { color: P.text }]} numberOfLines={1}>{chips[0]}</Text>
              <Animated.View style={[st.donePill, { backgroundColor: tint }, donePill]}>
                <Ionicons name="checkmark" size={10} color={P.accent} />
                <Text style={[st.donePillText, { color: P.accent }]}>Answered</Text>
              </Animated.View>
            </View>
            <Animated.View style={[st.answerRow, { borderTopColor: P.border }, answers(12.5)]}>
              <Text style={[st.answerQ, muted]} numberOfLines={1}>{first.label}</Text>
              <Text style={[st.answerA, { color: P.text }]}>Yes</Text>
            </Animated.View>
            <Animated.View style={[st.answerRow, { borderTopColor: P.border }, answers(12.8)]}>
              <Text style={[st.answerQ, muted]} numberOfLines={1}>{second.label}</Text>
              <Text style={[st.answerA, { color: P.text }]} numberOfLines={1}>{TYPED_ANSWER}</Text>
            </Animated.View>
          </View>
        </Animated.View>
      </>
    );
  };

  return (
    <HowItWorksSheet
      visible={visible}
      P={P}
      heading="Ask, and they complete."
      steps={STEPS}
      primaryLabel="Start from a template"
      onPrimary={onStart}
      onClose={onClose}
      renderStage={renderStage}
    />
  );
}

const SIGN_W = 70;
const TYPED_ANSWER = 'None, thanks';

const st = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  editor: { padding: 14, justifyContent: 'center' },
  formCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  formTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  formTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
  countPill: { borderRadius: 100, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 7, paddingVertical: 2 },
  countText: { fontSize: 10, fontWeight: '700' },
  qRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth },
  qIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  qLabel: { flex: 1, fontSize: 12, fontWeight: '600' },
  belowCard: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  chips: { flex: 1, flexDirection: 'row', gap: 6, overflow: 'hidden' },
  chip: { borderRadius: 100, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 6, overflow: 'hidden', flexShrink: 1 },
  chipLit: { borderRadius: 100, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '600' },
  auto: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  autoText: { fontSize: 11, fontWeight: '700' },
  track: { width: 26, height: 16, borderRadius: 8, overflow: 'hidden', justifyContent: 'center' },
  trackOn: { borderRadius: 8 },
  knob: { position: 'absolute', left: 2, width: 12, height: 12, borderRadius: 6 },

  phone: { position: 'absolute', alignSelf: 'center', top: 12, bottom: 12, width: 150, borderRadius: 22, borderWidth: 3, padding: 8, overflow: 'hidden' },
  phoneBooking: { borderRadius: 10, padding: 8, marginTop: 4 },
  phoneBookingTitle: { fontSize: 11, fontWeight: '800' },
  phoneBookingMeta: { fontSize: 9, marginTop: 1 },
  notif: { position: 'absolute', top: 6, left: 6, right: 6, borderRadius: 10, padding: 7, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  notifTitle: { fontSize: 8, fontWeight: '800' },
  notifBody: { fontSize: 8, marginTop: 1 },
  phoneSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 170, borderTopLeftRadius: 14, borderTopRightRadius: 14, padding: 10, gap: 5 },
  phoneSheetTitle: { fontSize: 10, fontWeight: '800', marginBottom: 1 },
  phoneQ: { fontSize: 8, fontWeight: '700' },
  yesNo: { flexDirection: 'row', gap: 5 },
  answerPill: { borderRadius: 100, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  answerPillFill: { borderRadius: 100, borderWidth: 1 },
  answerPillText: { fontSize: 8, fontWeight: '700' },
  tapRing: { position: 'absolute', left: 2, top: -6, width: 24, height: 24, borderRadius: 12, borderWidth: 2 },
  typedBox: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4, minHeight: 18 },
  typedText: { fontSize: 8 },
  signRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 2 },
  signMask: { width: SIGN_W, height: 16, overflow: 'hidden', borderBottomWidth: 1, justifyContent: 'center' },
  signStroke: { width: SIGN_W, height: 2, borderRadius: 1, transform: [{ rotate: '-4deg' }] },
  submitted: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 100, paddingHorizontal: 7, paddingVertical: 3 },
  submittedText: { fontSize: 8, fontWeight: '800' },

  back: { padding: 14, justifyContent: 'center', gap: 10 },
  backNotif: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 9 },
  backNotifTitle: { fontSize: 11, fontWeight: '800' },
  backNotifBody: { fontSize: 10, marginTop: 1 },
  bookingCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  donePill: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  donePillText: { fontSize: 10, fontWeight: '800' },
  answerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth },
  answerQ: { flex: 1, fontSize: 11 },
  answerA: { fontSize: 11, fontWeight: '700', maxWidth: '40%' },
});
