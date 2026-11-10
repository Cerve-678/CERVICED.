import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import {
  DobField,
  type DobValue,
  ERROR_RED,
  FieldRow,
  FormCard,
  PrimaryButton,
  ScreenTitle,
  useFieldInputStyle,
} from '../../components/signup/FormKit';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { logger } from '../../utils/logger';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import { validateDob, validatePhone } from '../../utils/validation';
import { type BookingDetail, missingBookingDetails } from './beforeYouBook';

// How long a closing sheet takes to slide out. React Native can leave the next
// Modal behind one that's still dismissing, so the next one waits this long.
const MODAL_HANDOFF_MS = 350;

const EMPTY_DOB: DobValue = { day: '', month: '', year: '' };

function detailError(detail: BookingDetail, name: string, phone: string, dob: DobValue): string | null {
  if (detail === 'name') return name.trim() ? null : 'Name is required';
  if (detail === 'phone') return validatePhone(phone);
  return validateDob(dob.day, dob.month, dob.year);
}

function ChecklistRow({ done, children }: { done: boolean; children: React.ReactNode }) {
  const { palette: t } = useTheme();
  return (
    <View style={styles.row}>
      <Ionicons
        name={done ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={done ? t.accent : t.sub}
        style={styles.rowIcon}
      />
      <View style={styles.rowBody}>{children}</View>
    </View>
  );
}

export function BeforeYouBookSheet({
  visible,
  missing,
  onClose,
  onDone,
}: {
  visible: boolean;
  missing: BookingDetail[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { palette: t } = useTheme();
  const { updateUser } = useAuth();
  const insets = useSafeAreaInsets();
  const inputStyle = useFieldInputStyle();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState<DobValue>(EMPTY_DOB);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  // Frozen when the sheet opens: saving empties `missing` while it slides away,
  // and the rows shouldn't vanish underneath the person who just filled them in.
  const [asked, setAsked] = useState<BookingDetail[]>(missing);
  useEffect(() => {
    if (!visible) return;
    setAsked(missing);
    setShowErrors(false);
    setSaveFailed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const errorFor = (detail: BookingDetail) => detailError(detail, name, phone, dob);
  const visibleError = (detail: BookingDetail) => (showErrors ? errorFor(detail) : null);

  const handleContinue = async () => {
    if (asked.some(detail => errorFor(detail))) {
      setShowErrors(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    setSaving(true);
    setSaveFailed(false);
    try {
      await updateUser({
        ...(asked.includes('name') ? { name: name.trim() } : {}),
        ...(asked.includes('phone') ? { phone: phone.trim() } : {}),
        ...(asked.includes('dob')
          ? { dob: `${dob.year}-${dob.month.padStart(2, '0')}-${dob.day.padStart(2, '0')}` }
          : {}),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onDone();
    } catch (error) {
      logger.error('[BeforeYouBookSheet] saving booking details failed:', error);
      setSaveFailed(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* KeyboardDismissView, not a bare KeyboardAvoidingView: this used no
          avoidance at all on Android, and the app is edge-to-edge there, so
          the keyboard sat over the name and mobile fields. */}
      <KeyboardDismissView style={styles.backdrop}>
        <TouchableOpacity style={styles.dismissArea} activeOpacity={1} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: t.bg, paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={styles.close}
            onPress={onClose}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={24} color={t.text} />
          </TouchableOpacity>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <ScreenTitle
              title="Before you can book"
              subtitle="Just these to finish setting up your account. You'll only need to do this once."
            />
            <FormCard>
              {asked.includes('name') && (
                <ChecklistRow done={!errorFor('name')}>
                  <FieldRow label="FULL NAME" error={visibleError('name')}>
                    <TextInput
                      style={inputStyle}
                      value={name}
                      onChangeText={setName}
                      placeholder="Your name"
                      placeholderTextColor={t.sub}
                      autoCapitalize="words"
                      autoComplete="name"
                      textContentType="name"
                    />
                  </FieldRow>
                </ChecklistRow>
              )}
              {asked.includes('phone') && (
                <ChecklistRow done={!errorFor('phone')}>
                  <FieldRow label="MOBILE" error={visibleError('phone')}>
                    <TextInput
                      style={inputStyle}
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="07123 456789"
                      placeholderTextColor={t.sub}
                      keyboardType="phone-pad"
                      autoComplete="tel"
                      textContentType="telephoneNumber"
                    />
                  </FieldRow>
                </ChecklistRow>
              )}
              {asked.includes('dob') && (
                <ChecklistRow done={!errorFor('dob')}>
                  <FieldRow label="DATE OF BIRTH" error={visibleError('dob')}>
                    <DobField value={dob} onChange={setDob} onDone={() => {}} />
                  </FieldRow>
                  <Text style={[styles.hint, { color: t.sub }]}>You must be at least 16 to use Cerviced.</Text>
                </ChecklistRow>
              )}
            </FormCard>
            {saveFailed && (
              <Text style={styles.saveError}>We couldn't save your details. Please try again.</Text>
            )}
            <PrimaryButton label="Continue" onPress={handleContinue} loading={saving} style={styles.button} />
          </ScrollView>
        </View>
      </KeyboardDismissView>
    </Modal>
  );
}

/** Holds a booking back until the account has what it needs. `holdForDetails`
 * returns false when there's nothing to ask for, so the caller carries on as
 * normal; otherwise it opens the checklist and runs `onReady` once it's saved.
 * Render `beforeYouBookSheet` in the screen. */
export function useBeforeYouBook() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const onReadyRef = useRef<(() => void) | null>(null);
  const missing = useMemo(() => missingBookingDetails(user), [user]);

  const holdForDetails = useCallback((onReady: () => void, options?: { afterModalCloses?: boolean }) => {
    if (missing.length === 0) return false;
    onReadyRef.current = onReady;
    if (options?.afterModalCloses) {
      setTimeout(() => setVisible(true), MODAL_HANDOFF_MS);
    } else {
      setVisible(true);
    }
    return true;
  }, [missing]);

  const beforeYouBookSheet = (
    <BeforeYouBookSheet
      visible={visible}
      missing={missing}
      onClose={() => {
        onReadyRef.current = null;
        setVisible(false);
      }}
      onDone={() => {
        const onReady = onReadyRef.current;
        onReadyRef.current = null;
        setVisible(false);
        if (onReady) setTimeout(onReady, MODAL_HANDOFF_MS);
      }}
    />
  );

  return { holdForDetails, beforeYouBookSheet };
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  dismissArea: { flex: 1 },
  sheet: { maxHeight: '90%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 24 },
  close: { position: 'absolute', top: 16, right: 16, zIndex: 1, padding: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingLeft: 16 },
  rowIcon: { marginTop: 14 },
  rowBody: { flex: 1 },
  hint: { fontFamily: 'JosefinSans-VariableFont_wght', fontSize: 12, lineHeight: 17, paddingHorizontal: 16, paddingBottom: 12, marginTop: -6 },
  saveError: { fontFamily: 'JosefinSans-VariableFont_wght', fontSize: 13, color: ERROR_RED, marginTop: 12 },
  button: { marginTop: 18 },
});
