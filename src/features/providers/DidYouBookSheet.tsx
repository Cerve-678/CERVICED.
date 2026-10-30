// src/features/providers/DidYouBookSheet.tsx
// Shown on a link-only provider's profile when the client closes that
// provider's own booking page. Two steps in one sheet:
//   1. "Did you book with X?" — Yes, I booked / Not yet
//   2. "When is it?" — day, time, what they're having → Add to my bookings
// The entry is the client's own note (client_external_bookings). CERVICED
// doesn't handle the booking itself, and the sheet says so before they add.
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { isDarkColor } from '../../constants/providerThemes';
import { useSystemBottomInset } from '../../utils/bottomSafeGap';
import {
  dayName,
  monthName,
  dateToYMD,
  formatShortDayDate,
  formatTime12,
} from '../../utils/dateUtils';
import { EXTERNAL_BOOKING_DISCLAIMER } from '../bookings/externalBookings';
import { useTranslation } from '../../i18n';

export interface DidYouBookResult {
  bookingDate: string;
  startTime: string;
  serviceLabel: string;
}

interface DidYouBookSheetProps {
  visible: boolean;
  providerName: string;
  logoUrl: string | null;
  /** Speciality chips from the provider's profile, offered as "what are you
   *  having". "Something else" is always there too. */
  services: readonly string[];
  accentColor: string;
  tokens: { text: string; sub: string; border: string; surface: string; bg: string };
  /** Resolves when the entry is saved; throw to keep the sheet open. */
  onSubmit: (result: DidYouBookResult) => Promise<void>;
  onClose: () => void;
}

const DAY_STRIP_LENGTH = 14;
const SOMETHING_ELSE = '__something_else__';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function defaultTime(): Date {
  const d = new Date();
  d.setHours(10, 0, 0, 0);
  return d;
}

function hhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export const DidYouBookSheet: React.FC<DidYouBookSheetProps> = ({
  visible,
  providerName,
  logoUrl,
  services,
  accentColor,
  tokens,
  onSubmit,
  onClose,
}) => {
  const bottomInset = useSystemBottomInset();
  const { t } = useTranslation();
  const onAccent = isDarkColor(accentColor) ? '#FFFFFF' : '#1B2740';

  const [step, setStep] = useState<'ask' | 'details'>('ask');
  const [day, setDay] = useState<Date>(startOfToday);
  const [time, setTime] = useState<Date | null>(null);
  // Fresh state per open: the caller remounts this sheet (a new `key`) each
  // time it shows it, rather than resetting state from an effect.
  const [service, setService] = useState<string | null>(() => (services.length === 1 ? services[0] ?? null : null));
  const [otherService, setOtherService] = useState('');
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const [saving, setSaving] = useState(false);


  const days = useMemo(() => {
    const today = startOfToday();
    return Array.from({ length: DAY_STRIP_LENGTH }, (_, index) => {
      const d = new Date(today);
      d.setDate(today.getDate() + index);
      return d;
    });
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const dayIsInStrip = days.some(d => dateToYMD(d) === dateToYMD(day));
  const serviceLabel = service === SOMETHING_ELSE ? otherService.trim() : service ?? '';
  const canSubmit = !!time && serviceLabel.length > 0 && serviceLabel.length <= 80 && !saving;

  const handlePickerChange = (event: DateTimePickerEvent, value?: Date) => {
    if (Platform.OS === 'android') setPicker(null);
    if (event.type === 'dismissed' || !value) return;
    if (picker === 'date') {
      const d = new Date(value);
      d.setHours(0, 0, 0, 0);
      setDay(d);
    } else {
      setTime(value);
    }
  };

  const handleSubmit = async () => {
    if (!time || !canSubmit) return;
    setSaving(true);
    try {
      await onSubmit({
        bookingDate: dateToYMD(day),
        startTime: hhmm(time),
        serviceLabel,
      });
    } catch {
      // The caller has already told the client what went wrong.
      setSaving(false);
    }
  };

  const chip = (label: string, selected: boolean, onPress: () => void, dashed = false) => (
    <TouchableOpacity
      key={label}
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        { borderColor: tokens.border, backgroundColor: tokens.surface },
        dashed && styles.chipDashed,
        selected && { backgroundColor: accentColor, borderColor: accentColor },
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? onAccent : dashed ? tokens.sub : tokens.text }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const initials = providerName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={step === 'ask' ? onClose : undefined}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            style={[
              styles.sheet,
              step === 'details' && styles.detailsSheet,
              { backgroundColor: tokens.bg, paddingBottom: bottomInset + 20 },
            ]}
            onPress={e => e.stopPropagation()}
          >
            <View style={[styles.grabber, { backgroundColor: tokens.border }]} />

            {step === 'ask' ? (
              <>
                <View style={styles.askHeader}>
                  {logoUrl ? (
                    <Image source={{ uri: logoUrl }} style={styles.logo} contentFit="cover" transition={0} />
                  ) : (
                    <View style={[styles.logo, { backgroundColor: accentColor }]}>
                      <Text style={[styles.logoInitials, { color: onAccent }]}>{initials}</Text>
                    </View>
                  )}
                  <Text style={[styles.askTitle, { color: tokens.text }]}>
                    {t('providerProfile.didYouBook.askTitle', { name: providerName })}
                  </Text>
                </View>
                <Text style={[styles.askSub, { color: tokens.sub }]}>
                  {t('providerProfile.didYouBook.askSub', { name: providerName })}
                </Text>
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: accentColor }]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setStep('details'); }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.primaryButtonText, { color: onAccent }]}>{t('providerProfile.didYouBook.yes')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryButton, { borderColor: tokens.border }]}
                  onPress={onClose}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.secondaryButtonText, { color: tokens.text }]}>{t('providerProfile.didYouBook.notYet')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <ScrollView
                style={styles.detailsScroll}
                contentContainerStyle={styles.detailsContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.detailsHeader}>
                  <Text style={[styles.detailsTitle, { color: tokens.text }]}>{t('providerProfile.didYouBook.whenTitle')}</Text>
                  <TouchableOpacity
                    onPress={onClose}
                    style={[styles.closeButton, { borderColor: tokens.border, backgroundColor: tokens.surface }]}
                    accessibilityLabel={t('providerProfile.didYouBook.close')}
                    accessibilityRole="button"
                  >
                    <Ionicons name="close" size={18} color={tokens.text} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.detailsProvider, { color: tokens.sub }]}>{providerName}</Text>

                <Text style={[styles.label, { color: accentColor }]}>{t('providerProfile.didYouBook.day')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
                  {days.map(d => {
                    const selected = dateToYMD(d) === dateToYMD(day);
                    return (
                      <TouchableOpacity
                        key={dateToYMD(d)}
                        onPress={() => { Haptics.selectionAsync().catch(() => {}); setDay(d); }}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={formatShortDayDate(d)}
                        style={[
                          styles.dayChip,
                          { borderColor: tokens.border, backgroundColor: tokens.surface },
                          selected && { backgroundColor: accentColor, borderColor: accentColor },
                        ]}
                      >
                        <Text style={[styles.dayName, { color: selected ? onAccent : tokens.sub }]}>
                          {dayName(d.getDay(), 'short').toUpperCase()}
                        </Text>
                        <Text style={[styles.dayNumber, { color: selected ? onAccent : tokens.text }]}>
                          {d.getDate()}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <TouchableOpacity onPress={() => setPicker('date')} style={styles.linkButton} activeOpacity={0.7}>
                  <Text style={[styles.linkText, { color: accentColor }]}>
                    {dayIsInStrip
                      ? t('providerProfile.didYouBook.pickAnother')
                      : t('providerProfile.didYouBook.changeDate', { date: `${dayName(day.getDay(), 'short')} ${day.getDate()} ${monthName(day.getMonth(), 'short')}` })}
                  </Text>
                </TouchableOpacity>

                <Text style={[styles.label, { color: accentColor }]}>{t('providerProfile.didYouBook.time')}</Text>
                <TouchableOpacity
                  onPress={() => { if (!time) setTime(defaultTime()); setPicker('time'); }}
                  style={[styles.timeButton, { borderColor: tokens.border, backgroundColor: tokens.surface }]}
                  activeOpacity={0.8}
                >
                  <Ionicons name="time-outline" size={18} color={tokens.sub} />
                  <Text style={[styles.timeText, { color: time ? tokens.text : tokens.sub }]}>
                    {time ? formatTime12(time) : t('providerProfile.didYouBook.chooseTime')}
                  </Text>
                </TouchableOpacity>

                {picker && (
                  <DateTimePicker
                    value={picker === 'date' ? day : time ?? defaultTime()}
                    mode={picker}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    minuteInterval={5}
                    onChange={handlePickerChange}
                    textColor={tokens.text}
                  />
                )}
                {picker && Platform.OS === 'ios' && (
                  <TouchableOpacity onPress={() => setPicker(null)} style={styles.linkButton} activeOpacity={0.7}>
                    <Text style={[styles.linkText, { color: accentColor }]}>{t('providerProfile.didYouBook.done')}</Text>
                  </TouchableOpacity>
                )}

                <Text style={[styles.label, { color: accentColor }]}>{t('providerProfile.didYouBook.whatService')}</Text>
                <View style={styles.chipWrap}>
                  {services.map(label => chip(label, service === label, () => setService(label)))}
                  {chip(t('providerProfile.didYouBook.somethingElse'), service === SOMETHING_ELSE, () => setService(SOMETHING_ELSE), true)}
                </View>
                {service === SOMETHING_ELSE && (
                  <TextInput
                    value={otherService}
                    onChangeText={setOtherService}
                    placeholder={t('providerProfile.didYouBook.otherPlaceholder')}
                    placeholderTextColor={tokens.sub}
                    maxLength={80}
                    autoFocus
                    style={[styles.input, { borderColor: tokens.border, color: tokens.text, backgroundColor: tokens.surface }]}
                  />
                )}

                <View style={[styles.note, { backgroundColor: tokens.surface, borderColor: tokens.border }]}>
                  <Ionicons name="information-circle-outline" size={17} color={accentColor} />
                  <Text style={[styles.noteText, { color: tokens.text }]}>{EXTERNAL_BOOKING_DISCLAIMER}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: accentColor }, !canSubmit && styles.disabled]}
                  onPress={handleSubmit}
                  disabled={!canSubmit}
                  activeOpacity={0.85}
                >
                  {saving ? (
                    <ActivityIndicator color={onAccent} />
                  ) : (
                    <Text style={[styles.primaryButtonText, { color: onAccent }]}>{t('providerProfile.didYouBook.add')}</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  keyboardAvoidingView: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, maxHeight: '92%' },
  // A defined height gives the details ScrollView a real viewport. Without
  // one it measures at its content height, so the final button can be pushed
  // beneath the bottom edge on smaller devices.
  detailsSheet: { height: '92%' },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, marginBottom: 14 },
  askHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  logo: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoInitials: { fontFamily: 'BakbakOne-Regular', fontSize: 18 },
  askTitle: { flex: 1, fontFamily: 'BakbakOne-Regular', fontSize: 22, lineHeight: 27 },
  askSub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 15, lineHeight: 22, marginTop: 12, marginBottom: 18 },
  primaryButton: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryButtonText: { fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 1.5 },
  secondaryButton: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginTop: 10 },
  secondaryButtonText: { fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 1.5 },
  detailsScroll: { flex: 1, minHeight: 0 },
  detailsContent: { paddingBottom: 8 },
  detailsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailsTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 28 },
  closeButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  detailsProvider: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '700', marginBottom: 18 },
  label: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700', letterSpacing: 1.2, marginBottom: 8, marginTop: 6 },
  dayStrip: { gap: 6, paddingRight: 8 },
  dayChip: { width: 58, height: 64, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dayName: { fontFamily: 'Jura-VariableFont_wght', fontSize: 11, fontWeight: '700' },
  dayNumber: { fontFamily: 'BakbakOne-Regular', fontSize: 20 },
  linkButton: { paddingVertical: 10, alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  linkText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '700' },
  timeButton: { height: 52, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginBottom: 8 },
  timeText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 17, fontWeight: '700' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipDashed: { borderStyle: 'dashed' },
  chipText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '700' },
  input: { height: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, fontSize: 15, marginBottom: 8 },
  note: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, marginVertical: 14 },
  noteText: { flex: 1, fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 19 },
  disabled: { opacity: 0.45 },
});
