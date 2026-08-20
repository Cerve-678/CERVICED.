/**
 * Policies — cancellations, reschedules, deposits, no-shows, refund policy,
 * booking instructions, and a detailed policy image.
 *
 * Moved out of InfoRegScreen's "05 · Policies" section (previously edited as
 * part of the one-shot registration/profile-editor document) into its own
 * Business Details sub-screen, alongside where reschedule/cancellation logic
 * actually lives for the rest of the app. InfoRegScreen no longer edits or
 * previews any of this.
 *
 * NOT here on purpose: business type, full address, address release timing,
 * and accessibility notes stayed in InfoRegScreen — they're required (or
 * required-adjacent) first-publish fields, not cancellation/reschedule/
 * deposit-style policy, and a brand-new provider still needs to be asked for
 * their address during signup rather than only discovering this screen later.
 *
 * PERSISTENCE — `providers.booking_policies` (JSONB), via
 * saveProviderPolicies/loadProviderPolicies (keyed by user id, not provider
 * id). That write is a full REPLACE, not a merge — always load-then-spread
 * before saving, or a field this screen doesn't know about (there are none
 * left after this split, but InfoRegScreen still writes to the same column)
 * gets silently wiped.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import { useTheme } from '../../contexts/ThemeContext';
import TermsScreen from '../shared/TermsScreen';
import { getMyProviderProfile } from '../../services/databaseService';
import {
  saveProviderPolicies,
  loadProviderPolicies,
  uploadToStorage,
} from '../../services/providerRegistrationService';
import {
  Card, Field, ToggleRow, SectionLabel, Toast, SaveButton,
  useBusinessPalette, s,
} from '../../features/business-details/BusinessDetailsKit';

type CancelNotice     = 'none' | '24h' | '48h' | '72h';
type CancelPenalty    = 'none' | 'deposit' | 'full';
type RescheduleNotice = 'same_day' | '24h' | '48h' | '72h';
type MaxReschedules   = '1' | '2' | 'unlimited';
type DepositType      = 'percent' | 'fixed';
type NoShowAction     = 'none' | 'warn' | 'charge_deposit' | 'charge_full';

interface PolicyState {
  cancelNotice:     CancelNotice;
  cancelPenalty:    CancelPenalty;
  cancelNote:       string;
  rescheduleNotice: RescheduleNotice;
  maxReschedules:   MaxReschedules;
  rescheduleNote:   string;
  depositRequired:  boolean;
  depositType:      DepositType;
  depositAmount:    string;
  depositNote:      string;
  noShowAction:     NoShowAction;
  noShowGraceMinutes: string;
  noShowNote:       string;
  refundPolicyNote: string;
  bookingInstructions: string;
  policyImageUrl:   string;
}

const DEFAULT_POLICIES: PolicyState = {
  cancelNotice:     '24h',
  cancelPenalty:    'none',
  cancelNote:       '',
  rescheduleNotice: '24h',
  maxReschedules:   '1',
  rescheduleNote:   '',
  depositRequired:  false,
  depositType:      'percent',
  depositAmount:    '',
  depositNote:      '',
  noShowAction:     'none',
  noShowGraceMinutes: '0',
  noShowNote:       '',
  refundPolicyNote: '',
  bookingInstructions: '',
  policyImageUrl:   '',
};

function Pills<T extends string>({ options, value, onChange }: {
  options: { v: T; l: string }[]; value: T; onChange: (v: T) => void;
}) {
  const C = useBusinessPalette();
  return (
    <View style={pSt.row}>
      {options.map(({ v, l }) => {
        const active = value === v;
        return (
          <TouchableOpacity
            key={v}
            style={[pSt.pill, { backgroundColor: active ? C.accent : C.surface, borderColor: active ? C.accent : C.border }]}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(v); }}
            activeOpacity={0.75}
          >
            <Text style={[pSt.pillText, { color: active ? C.ice : C.sub }]}>{l}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const pSt = StyleSheet.create({
  row:      { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 4 },
  pill:     { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  pillText: { fontFamily: 'BakbakOne-Regular', fontSize: 13 },
});

export default function PoliciesScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const C = useBusinessPalette();

  const [userId, setUserId] = useState<string | null>(null);
  const [policies, setPolicies] = useState<PolicyState>(DEFAULT_POLICIES);
  const [policyImageUploading, setPolicyImageUploading] = useState(false);

  // Re-affirmation only — first-publish acceptance is InfoRegScreen's
  // checkbox and is what actually gates being able to publish at all. This
  // one exists because a provider can come back and change their policies
  // long after first publish without ever revisiting InfoRegScreen, so it's
  // shown here too, but doesn't block Save.
  const [termsAcknowledged, setTermsAcknowledged] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  function flash(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    (async () => {
      try {
        const profile = await getMyProviderProfile();
        if (!profile?.user_id) { setLoading(false); return; }
        setUserId(profile.user_id);
        const saved = (await loadProviderPolicies(profile.user_id)) ?? profile.booking_policies ?? {};
        setPolicies({ ...DEFAULT_POLICIES, ...(saved as Partial<PolicyState>) });
      } catch {
        flash('Could not load your policies', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setPolicy = useCallback(<K extends keyof PolicyState>(key: K, value: PolicyState[K]) => {
    setPolicies(prev => ({ ...prev, [key]: value }));
  }, []);

  const handlePickPolicyImage = useCallback(async () => {
    if (!userId) return;
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.85,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;

    setPolicyImageUploading(true);
    try {
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${userId}/policy-${Date.now()}.${ext}`;
      const publicUrl = await uploadToStorage('portfolio', path, asset.uri);
      setPolicy('policyImageUrl', publicUrl);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Could not upload the image.');
    } finally {
      setPolicyImageUploading(false);
    }
  }, [userId, setPolicy]);

  const handleRemovePolicyImage = useCallback(() => setPolicy('policyImageUrl', ''), [setPolicy]);

  const handleSave = useCallback(async () => {
    if (!userId) { flash('No provider profile found', 'error'); return; }

    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      // depositOnly isn't edited here — "Require deposit" IS deposit-only,
      // one toggle not two — but the client booking path still reads it
      // directly (BookingSheet/MultiBookingSheet hide "pay in full",
      // getProviderDepositPoliciesByDisplayNames, Becca), so it has to be
      // written in lockstep with depositRequired or that path silently breaks.
      await saveProviderPolicies(userId, {
        ...policies,
        depositOnly: policies.depositRequired,
      } as unknown as Record<string, unknown>);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      navigation.goBack();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      flash(e?.message ?? 'Could not save changes', 'error');
    } finally {
      setSaving(false);
    }
  }, [userId, policies, navigation]);

  if (loading) {
    return (
      <View style={[s.root, { backgroundColor: C.bg }]}>
        <SafeAreaView style={s.center}>
          <ActivityIndicator color={C.accent} size="large" />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: C.bg }]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />
      <SafeAreaView style={s.safe} edges={['top']}>
        <KeyboardDismissView style={{ flex: 1 }}>
          <View style={[s.header, { borderBottomColor: C.border }]}>
            <Text style={[s.headerTitle, { color: C.text }]}>Policies</Text>
            <TouchableOpacity
              style={[s.closeBtn, { backgroundColor: C.surface }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
              activeOpacity={0.5}
            >
              <Ionicons name="close" size={22} color={C.sub} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={s.scroll}
            contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 100 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {toast && <Toast message={toast.message} type={toast.type} />}

            <Card title="Cancellation" sub="What happens if a client cancels late.">
              <SectionLabel text="Notice required" />
              <Pills
                options={[{ v: 'none', l: 'None' }, { v: '24h', l: '24h' }, { v: '48h', l: '48h' }, { v: '72h', l: '72h' }]}
                value={policies.cancelNotice}
                onChange={v => setPolicy('cancelNotice', v)}
              />
              <SectionLabel text="If cancelled late" />
              <Pills
                options={[{ v: 'none', l: 'No penalty' }, { v: 'deposit', l: 'Deposit kept' }, { v: 'full', l: 'Full charge' }]}
                value={policies.cancelPenalty}
                onChange={v => setPolicy('cancelPenalty', v)}
              />
              <Field label="Note (optional)" value={policies.cancelNote} onChange={v => setPolicy('cancelNote', v)} placeholder="e.g. cancellations via message only" />
            </Card>

            <Card title="Rescheduling" sub="How much notice, and how many reschedules you allow per booking.">
              <SectionLabel text="Notice required" />
              <Pills
                options={[{ v: 'same_day', l: 'Same day' }, { v: '24h', l: '24h' }, { v: '48h', l: '48h' }, { v: '72h', l: '72h' }]}
                value={policies.rescheduleNotice}
                onChange={v => setPolicy('rescheduleNotice', v)}
              />
              <SectionLabel text="Max reschedules per booking" />
              <Pills
                options={[{ v: '1', l: '1' }, { v: '2', l: '2' }, { v: 'unlimited', l: 'Unlimited' }]}
                value={policies.maxReschedules}
                onChange={v => setPolicy('maxReschedules', v)}
              />
              <Field label="Note (optional)" value={policies.rescheduleNote} onChange={v => setPolicy('rescheduleNote', v)} />
            </Card>

            <Card title="Deposit">
              <ToggleRow
                label="Require deposit"
                sub="Clients must pay the deposit to book — they won't be able to choose to pay in full."
                value={policies.depositRequired}
                onChange={v => setPolicy('depositRequired', v)}
              />
              {policies.depositRequired && (
                <>
                  <SectionLabel text="Amount" />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <Pills
                      options={[{ v: 'percent', l: '%' }, { v: 'fixed', l: '£' }]}
                      value={policies.depositType}
                      onChange={v => setPolicy('depositType', v)}
                    />
                    <TextInput
                      style={{ flex: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontFamily: 'Jura-VariableFont_wght', fontSize: 14, color: C.text, backgroundColor: C.surface }}
                      placeholder={policies.depositType === 'percent' ? 'e.g. 20' : 'e.g. 25'}
                      placeholderTextColor={C.sub}
                      value={policies.depositAmount}
                      onChangeText={v => setPolicy('depositAmount', v)}
                      keyboardType="numeric"
                    />
                  </View>
                  <Field label="Note (optional)" value={policies.depositNote} onChange={v => setPolicy('depositNote', v)} />
                </>
              )}
            </Card>

            <Card title="No-show">
              <SectionLabel text="Action" />
              <Pills
                options={[
                  { v: 'none', l: 'No action' },
                  { v: 'warn', l: 'Warn client' },
                  { v: 'charge_deposit', l: 'Charge deposit' },
                  { v: 'charge_full', l: 'Charge in full' },
                ]}
                value={policies.noShowAction}
                onChange={v => setPolicy('noShowAction', v)}
              />
              <Field
                label="Grace period (minutes)"
                value={policies.noShowGraceMinutes}
                onChange={v => setPolicy('noShowGraceMinutes', v.replace(/[^0-9]/g, ''))}
                placeholder="e.g. 15"
                keyboardType="phone-pad"
                note="How long after the booked start time before you can mark a client No Show. 0 = no grace period."
              />
              <Field label="Note (optional)" value={policies.noShowNote} onChange={v => setPolicy('noShowNote', v)} />
            </Card>

            {/* Refund policy — free-text disclosure only. This app has no
                refund-processing infra, so there is deliberately no
                percentage/amount field here that would imply the app
                calculates or enforces a refund automatically. */}
            <Card title="Refund Policy" sub="Shown to clients on their booking (optional).">
              <Field
                label="Your refund policy"
                value={policies.refundPolicyNote}
                onChange={v => setPolicy('refundPolicyNote', v)}
                placeholder='e.g. "Refunds considered case-by-case, contact me directly"'
                multiline
              />
            </Card>

            <Card title="Booking Instructions" sub="Shown to clients on every booking (optional).">
              <Field
                label="Instructions"
                value={policies.bookingInstructions}
                onChange={v => setPolicy('bookingInstructions', v)}
                placeholder='e.g. "Please arrive 10 minutes early", parking info…'
                multiline
              />
            </Card>

            <Card title="Detailed Policy Image" sub="Optional — shown as a pop-up on your profile, for anything too specific for the fields above (a full house-rules sheet, a consent form, etc).">
              <View style={imgSt.grid}>
                {policies.policyImageUrl ? (
                  <View style={imgSt.thumbWrap}>
                    <TouchableOpacity onPress={handlePickPolicyImage} disabled={policyImageUploading} activeOpacity={0.7}>
                      <Image source={{ uri: policies.policyImageUrl }} style={imgSt.thumb} fadeDuration={0} />
                      {policyImageUploading && (
                        <View style={imgSt.uploading}>
                          <ActivityIndicator size="small" color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity style={imgSt.removeBtn} onPress={handleRemovePolicyImage} disabled={policyImageUploading}>
                      <Text style={imgSt.removeText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[imgSt.addTile, { borderColor: C.border }]}
                    onPress={handlePickPolicyImage}
                    disabled={policyImageUploading}
                  >
                    {policyImageUploading ? (
                      <ActivityIndicator size="small" color={C.accent} />
                    ) : (
                      <>
                        <Text style={[imgSt.addPlus, { color: C.sub }]}>+</Text>
                        <Text style={[imgSt.addText, { color: C.sub }]}>Add Image</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
              {policies.policyImageUrl ? (
                <TouchableOpacity onPress={handlePickPolicyImage} disabled={policyImageUploading} style={{ marginTop: 10 }}>
                  <Text style={{ fontFamily: 'BakbakOne-Regular', fontSize: 11, color: C.accent }}>
                    {policyImageUploading ? 'UPLOADING…' : 'REPLACE PHOTO'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </Card>

            {/* Re-affirmation, not a gate — first-publish acceptance in
                InfoRegScreen is what actually blocks Publish. This is shown
                here too since a provider can come back and change their
                policies long after first publish without ever revisiting
                InfoRegScreen, but Save works regardless of whether it's
                checked. */}
            <TouchableOpacity
              style={[termsSt.box, { backgroundColor: C.surface, borderColor: C.border }]}
              activeOpacity={0.75}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setTermsAcknowledged(prev => !prev); }}
            >
              <View style={[termsSt.checkbox, { borderColor: C.sub }, termsAcknowledged && { backgroundColor: C.accent, borderColor: C.accent }]}>
                {termsAcknowledged && <Ionicons name="checkmark" size={13} color={C.ice} />}
              </View>
              <Text style={[termsSt.text, { color: C.text }]}>
                I agree to the{' '}
                <Text style={[termsSt.link, { color: C.accent }]} onPress={() => setShowTermsModal(true)}>
                  Terms &amp; Conditions
                </Text>
              </Text>
            </TouchableOpacity>

            <SaveButton saving={saving} onPress={handleSave} />
          </ScrollView>
        </KeyboardDismissView>
      </SafeAreaView>

      <Modal visible={showTermsModal} animationType="slide" transparent={false} onRequestClose={() => setShowTermsModal(false)}>
        <TermsScreen navigation={{ goBack: () => setShowTermsModal(false) }} />
      </Modal>
    </View>
  );
}

const termsSt = StyleSheet.create({
  box:      { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 14 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  text:     { flex: 1, fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '600' },
  link:     { fontWeight: '800', textDecorationLine: 'underline' },
});

const imgSt = StyleSheet.create({
  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbWrap: { position: 'relative', width: 84, height: 84 },
  thumb:     { width: 84, height: 84, borderRadius: 14 },
  uploading: { ...StyleSheet.absoluteFillObject, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  removeBtn: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  removeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  addTile:   { width: 84, height: 84, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addPlus:   { fontSize: 22, fontWeight: '300', lineHeight: 24 },
  addText:   { fontFamily: 'Jura-VariableFont_wght', fontWeight: '600', fontSize: 9, marginTop: 2 },
});
