/**
 * Policies — cancellations, reschedules, no-shows, refund policy, booking
 * instructions, and a detailed policy image.
 *
 * NOT deposits. The deposit setup (whether one applies, how much, whether it's
 * new-clients-only) moved to PaymentsScreen on 2026-08-20 — it's a payment
 * question, and it was previously split across both screens. The deposit keys
 * still round-trip through this screen's save because the write below is a
 * full REPLACE of booking_policies, but nothing here edits them. Do not add a
 * deposit control back here.
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
 * no-show policy, and a brand-new provider still needs to be asked for their
 * address during signup rather than only discovering this screen later.
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
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { FocusAwareStatusBar } from '../../components/FocusAwareStatusBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView } from '../../components/SafeArea';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { ImageCropModal } from '../../components/ImageCropModal';
import {
  MAX_POLICY_IMAGES,
  policyImageEdges,
  policyImageFields,
  policyImageUrls,
  prunePolicyImageEdges,
  type PolicyImageEdge,
} from '../../features/providers/policyImages';
import { edgeColoursFromPhoto } from '../../features/provider-registration/photoColours';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { getMyProviderProfile, getProviderSpecialties, updateProviderCancellationPolicy } from '../../services/databaseService';
import type { DbProvider } from '../../types/database';
import { mapProviderProfileData } from '../../features/providers/profileMapper';
import { additionalInfoGroups, goodToKnowText, howToGetThere } from '../../features/providers/additionalInfo';
import type { ChipGroup as InfoGroup } from '../../features/providers/workWith';
import { getPageStyle } from '../../constants/pageStyles';
import { parseThemeKey } from '../../constants/providerThemes';
import { logger } from '../../utils/logger';
import { noticeChoiceForHours, noticeHoursToSave, type NoticeChoice } from '../../utils/policyDisplay';
import { toUserMessage } from '../../utils/userFacingError';
import { openLegalPage } from '../../utils/legalPage';
import {
  saveProviderPolicies,
  loadProviderPolicies,
  uploadToStorage,
} from '../../services/providerRegistrationService';
import {
  Card, ChipGroup, Field, SectionLabel, Toast, SaveButton, ToggleRow,
  useBusinessPalette, s,
} from '../../features/business-details/BusinessDetailsKit';
import {
  BOOKING_INSTRUCTION_SUGGESTIONS,
  selectedBookingInstructions,
  toggleBookingInstruction,
} from '../../features/business-details/bookingInstructions';

type CancelNotice     = '' | NoticeChoice;
// 'custom' (a typed £ amount) was replaced by 'half' on 2026-11-13; saved
// 'custom' and 'full' policies are read back as 'half'.
type CancelPenalty    = '' | 'none' | 'deposit' | 'half';
type RescheduleNotice = '' | 'same_day' | '24h' | '48h' | '72h';
type MaxReschedules   = '' | '1' | '2' | 'unlimited';
// Enforced by request_reschedule_own_booking() (20261113160000).
type RescheduleWithin = '' | 'any' | 'same_month';
// 'charge_full' was offered once and enforced by nothing; it's read back as
// 'charge_deposit' and the real charge is now the no-show fee below.
// 'custom' (a typed £ no-show fee) became 'half' on 2026-11-13
// (20261113200000); saved 'custom' policies are read back as 'half'.
type NoShowAction     = '' | 'none' | 'warn' | 'charge_deposit' | 'half';

interface PolicyState {
  cancelNotice:     CancelNotice;
  cancelPenalty:    CancelPenalty;
  cancelNote:       string;
  rescheduleNotice: RescheduleNotice;
  maxReschedules:   MaxReschedules;
  rescheduleWithin: RescheduleWithin;
  rescheduleNote:   string;
  noShowAction:     NoShowAction;
  noShowGraceMinutes: string;
  noShowNote:       string;
  // £ as typed; '' = no fee. The server freezes it onto each booking at
  // checkout, capped at half that booking's price.
  lateFee:          string;
  refundPolicyNote: string;
  bookingInstructions: string;
  /** Pages of the detailed policy, in order (see features/providers/policyImages). */
  policyImageUrls:  string[];
  // Shown in the profile's Policy tab. Also read by the booking sheet's
  // "scheduling conflict" prompt if EMERGENCY_BOOKINGS_ENABLED returns. A
  // distinct document from the provider's Terms & Conditions.
  emergencyBookingPolicy: string;
  travelPolicy: string;
  // Enforced by apply-cancellation-refund through each booking's frozen copy.
  // Edited in Payments, beside the deposit; only a link-only provider edits
  // it here. Kept in this state either way so the full-replace save carries it.
  depositNonRefundable: boolean;
}

// What CERVICED itself applies or charges. A link-only provider's bookings
// happen on their own site, so none of it can apply to them: it's hidden
// from their editor, cleared when they save, and left out of their profile
// (buildPolicyDisplayRows' linkOnly option).
const LINK_ONLY_CLEARED: Pick<PolicyState, 'cancelPenalty' | 'noShowAction' | 'noShowGraceMinutes' | 'lateFee'> = {
  cancelPenalty: '',
  noShowAction: '',
  noShowGraceMinutes: '',
  lateFee: '',
};

const DEFAULT_POLICIES: PolicyState = {
  cancelNotice:     '',
  cancelPenalty:    '',
  cancelNote:       '',
  rescheduleNotice: '',
  maxReschedules:   '',
  rescheduleWithin: '',
  rescheduleNote:   '',
  noShowAction:     '',
  noShowGraceMinutes: '',
  noShowNote:       '',
  lateFee:          '',
  refundPolicyNote: '',
  bookingInstructions: '',
  policyImageUrls:  [],
  emergencyBookingPolicy: '',
  travelPolicy: '',
  depositNonRefundable: false,
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
            <Text style={[pSt.pillText, { color: active ? C.onAccent : C.sub }]}>{l}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** '' (no fee) or pounds with up to 2 decimals — the same shape the server reads. */
// How a late or no-show fee is charged. Bookings freeze the fee at checkout, and
// this describes the fee terms clients agree to there.
const FEE_CHARGE_NOTE = "Charged to the client's saved card, by you, within 24 hours of the appointment. If the card declines, the client is asked to pay within 7 days, and on bookings made on the current fee wording the card may be tried again up to three times. Clients agree to the fee at checkout.";

/** The cap on every custom amount, in bold wherever a provider sets one. */
function HalfPriceCap() {
  const C = useBusinessPalette();
  return <Text style={[capSt.note, { color: C.text }]}>You can only charge up to half the service price.</Text>;
}

function isFeeAmount(v: string): boolean {
  return v === '' || /^\d+(\.\d{1,2})?$/.test(v);
}

function isCustomAmount(v: string): boolean {
  return v !== '' && isFeeAmount(v) && Number(v) > 0;
}

const pSt = StyleSheet.create({
  row:      { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 4 },
  pill:     { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  pillText: { fontFamily: 'BakbakOne-Regular', fontSize: 13 },
});

/** Additional Information exactly as clients see it on the profile. */
interface InfoPreview {
  groups: InfoGroup[];
  qualifications: string;
  goodToKnow: string;
  directions: string;
}

// Where each part of Additional Information is set. All live under the
// Profile tab; some tabs' stacks register them too (see openSetting).
const INFO_SOURCES: { route: string; label: string }[] = [
  { route: 'AboutYou', label: 'About You' },
  { route: 'ServicesPricing', label: 'Services & Pricing' },
  { route: 'Scheduling', label: 'Scheduling' },
  { route: 'Payments', label: 'Payments' },
  { route: 'EditProfile', label: 'Edit Profile' },
];

async function buildInfoPreview(profile: DbProvider): Promise<InfoPreview> {
  const specialties = await getProviderSpecialties(profile.id);
  const data = mapProviderProfileData({
    ...profile,
    services: [],
    specialties: specialties.map(specialty => ({ specialty })),
  });
  return {
    groups: additionalInfoGroups(data, getPageStyle(parseThemeKey(data.profileTheme).pageStyle)),
    qualifications: data.qualifications.trim(),
    goodToKnow: goodToKnowText(data),
    directions: howToGetThere(data),
  };
}

/** A quiet text link: "+ Add a note", "How this works ›". */
function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  const C = useBusinessPalette();
  return (
    <TouchableOpacity
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
      activeOpacity={0.6}
      accessibilityRole="button"
      hitSlop={8}
      style={linkSt.wrap}
    >
      <Text style={[linkSt.text, { color: C.accentText }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function PoliciesScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { isDarkMode } = useTheme();
  const C = useBusinessPalette();
  const { myBookingMode } = useAuth();
  const isLinkOnly = myBookingMode === 'external';

  const [userId, setUserId] = useState<string | null>(null);
  const [policies, setPolicies] = useState<PolicyState>(DEFAULT_POLICIES);
  // Everything in booking_policies this screen doesn't edit — the deposit keys
  // PaymentsScreen owns, plus anything InfoRegScreen writes to the same
  // column. Held separately and spread back on save, because the write is a
  // full REPLACE: a key that isn't carried through is a key that's deleted.
  const [carriedPolicies, setCarriedPolicies] = useState<Record<string, unknown>>({});
  // Uploads still in flight; a few photos picked at once upload one by one.
  const [policyImageUploads, setPolicyImageUploads] = useState(0);
  // Each page's top and bottom edge colour, keyed by URL, so the profile can
  // run the page into the page around it (Branding → Policy Pictures).
  const [imageEdges, setImageEdges] = useState<Record<string, PolicyImageEdge>>({});
  const policyImageUploading = policyImageUploads > 0;
  // Photos picked together, waiting to be cropped in turn. The first is open.
  const [policyImageCropQueue, setPolicyImageCropQueue] = useState<string[]>([]);
  const policyImageToCrop = policyImageCropQueue[0] ?? null;

  // Re-affirmation only — first-publish acceptance is InfoRegScreen's
  // checkbox and is what actually gates being able to publish at all. This
  // one exists because a provider can come back and change their policies
  // long after first publish without ever revisiting InfoRegScreen, so it's
  // shown here too, but doesn't block Save.
  const [termsAcknowledged, setTermsAcknowledged] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  // Saving is a full REPLACE of booking_policies, so it's only safe once the
  // existing blob has actually been read. If the load failed we're sitting on
  // DEFAULT_POLICIES and an empty carriedPolicies — saving that would wipe the
  // deposit keys PaymentsScreen owns along with this screen's own settings.
  const [loadFailed, setLoadFailed] = useState(false);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [loadedNotice, setLoadedNotice] = useState('');
  // Notes, written policies and explanations stay folded away until there's
  // something in them or the provider opens one, so the screen reads calm.
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const open = useCallback((key: string) => setOpened(prev => ({ ...prev, [key]: true })), []);
  const toggle = useCallback((key: string) => setOpened(prev => ({ ...prev, [key]: !prev[key] })), []);
  const shows = (key: keyof PolicyState) => opened[key] || String(policies[key] ?? '').trim() !== '';
  // null until loaded, and if it can't load: the card is just left out.
  const [infoPreview, setInfoPreview] = useState<InfoPreview | null>(null);

  const refreshInfoPreview = useCallback((profile: DbProvider) => {
    buildInfoPreview(profile)
      .then(setInfoPreview)
      .catch(e => { logger.error('PoliciesScreen.infoPreview', e); setInfoPreview(null); });
  }, []);

  // Coming back from About You and the rest, show what was just changed there.
  useEffect(() => {
    let first = true;
    return navigation.addListener('focus', () => {
      if (first) { first = false; return; }
      getMyProviderProfile()
        .then(profile => { if (profile) refreshInfoPreview(profile); })
        .catch(e => logger.error('PoliciesScreen.infoPreview', e));
    });
  }, [navigation, refreshInfoPreview]);

  // Opens a screen in this tab's stack when it has one, or under the Profile
  // tab (which has them all) otherwise — the same jump Becca makes.
  const openSetting = useCallback((route: string) => {
    Haptics.selectionAsync().catch(() => {});
    const here: string[] = navigation.getState?.()?.routeNames ?? [];
    if (here.includes(route)) navigation.navigate(route);
    else navigation.getParent()?.navigate('Profile', { screen: route });
  }, [navigation]);

  function flash(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    (async () => {
      try {
        const profile = await getMyProviderProfile();
        if (!profile?.user_id) { setLoadFailed(true); setLoading(false); return; }
        setUserId(profile.user_id);
        setProviderId(profile.id);
        // Not awaited: the preview loads beside the policies, not before them.
        if (profile.booking_mode !== 'external') refreshInfoPreview(profile);
        const saved = ((await loadProviderPolicies(profile.user_id)) ?? profile.booking_policies ?? {}) as Record<string, unknown>;
        const merged = { ...DEFAULT_POLICIES, ...(saved as Partial<PolicyState>) };
        // Reads the old single image too, so a provider's existing page stays.
        merged.policyImageUrls = policyImageUrls(saved);
        setImageEdges(policyImageEdges(saved));
        // Saved as 'Full charge' (before 2026-11-01) or as a Custom amount
        // (2026-11-02 to 11-13): both are 'Half the price' now.
        if ((merged.cancelPenalty as string) === 'full' || (merged.cancelPenalty as string) === 'custom') {
          merged.cancelPenalty = 'half';
        }
        if ((merged.noShowAction as string) === 'charge_full') merged.noShowAction = 'charge_deposit';
        // A typed £ no-show fee, or the 'custom' action that held one, is
        // 'Half the price' now (2026-11-13).
        if ((merged.noShowAction as string) === 'custom' || isCustomAmount(String(saved['noShowFee'] ?? ''))) {
          merged.noShowAction = 'half';
        }
        // Retired with Custom. merged spreads the whole saved blob, so drop
        // them here or the next save writes them straight back.
        delete (merged as Record<string, unknown>)['cancelCustomFee'];
        delete (merged as Record<string, unknown>)['noShowFee'];
        // Start on the window actually applied, which Automations can also
        // set. A link-only provider's notice is only their own text.
        if (profile.booking_mode !== 'external') {
          merged.cancelNotice = noticeChoiceForHours(profile.cancellation_notice_hours) ?? merged.cancelNotice;
        }
        setLoadedNotice(merged.cancelNotice);
        setPolicies(merged);
        // cancelCustomFee and noShowFee are retired with Custom: dropped on the next save.
        const carried = Object.fromEntries(
          Object.entries(saved).filter(([k]) => !(k in DEFAULT_POLICIES) && k !== 'cancelCustomFee' && k !== 'noShowFee'),
        );
        setCarriedPolicies(carried);
      } catch {
        setLoadFailed(true);
        flash('Could not load your policies', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshInfoPreview]);

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
    // No allowsEditing: iOS's editor only crops to a square, which cuts the
    // top and bottom off a full-length policy sheet. ImageCropModal does it.
    const room = MAX_POLICY_IMAGES - policies.policyImageUrls.length;
    if (room <= 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: room > 1,
      selectionLimit: room,
      orderedSelection: true,
    });
    if (result.canceled) return;
    const picked = (result.assets ?? []).map(a => a.uri).slice(0, room);
    if (picked.length > 0) setPolicyImageCropQueue(picked);
  }, [userId, policies.policyImageUrls.length]);

  // Cancelling one photo's crop skips just that photo.
  const handlePolicyImageCropCancelled = useCallback(() => {
    setPolicyImageCropQueue(queue => queue.slice(1));
  }, []);

  const handlePolicyImageCropped = useCallback(async (uri: string) => {
    setPolicyImageCropQueue(queue => queue.slice(1));
    if (!userId) return;
    setPolicyImageUploads(n => n + 1);
    try {
      const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${userId}/policy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      // 'document': kept at full width however long it is, so it reads
      // sharp in the scrolling viewer instead of shrinking by its height.
      const publicUrl = await uploadToStorage('portfolio', path, uri, 'document');
      setPolicies(prev => ({ ...prev, policyImageUrls: [...prev.policyImageUrls, publicUrl].slice(0, MAX_POLICY_IMAGES) }));
      // Read while the photo is still on this phone. Best effort: without it
      // the profile works the colours out itself.
      edgeColoursFromPhoto(uri)
        .then(edge => setImageEdges(prev => ({ ...prev, [publicUrl]: edge })))
        .catch(() => {});
    } catch (e: any) {
      Alert.alert('Upload failed', toUserMessage(e, 'Could not upload that image. Please try again.', 'PoliciesScreen.uploadPolicyImage'));
    } finally {
      setPolicyImageUploads(n => n - 1);
    }
  }, [userId]);

  const handleRemovePolicyImage = useCallback((url: string) => {
    setPolicies(prev => ({ ...prev, policyImageUrls: prev.policyImageUrls.filter(u => u !== url) }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!userId) { flash('No provider profile found', 'error'); return; }
    // See loadFailed above: writing without a successful read would replace
    // the stored blob with defaults.
    if (loadFailed) { flash('Your policies could not be loaded — reopen this screen before saving', 'error'); return; }
    if (!isFeeAmount(policies.lateFee)) {
      flash('Enter fees as pounds, like 10 or 12.50', 'error');
      return;
    }

    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      // carriedPolicies first, so an edit made here always wins over the
      // stale copy loaded alongside it.
      await saveProviderPolicies(userId, {
        ...carriedPolicies,
        ...policies,
        ...policyImageFields(policies.policyImageUrls),
        policyImageEdges: prunePolicyImageEdges(imageEdges, policies.policyImageUrls),
        ...(isLinkOnly ? LINK_ONLY_CLEARED : {}),
      } as unknown as Record<string, unknown>);
      // The window cancellations are actually judged by. After the text, so a
      // failed save never applies a notice the written policy doesn't state.
      const noticeHours = isLinkOnly ? null : noticeHoursToSave(policies.cancelNotice, loadedNotice);
      if (providerId && noticeHours !== null) {
        await updateProviderCancellationPolicy(providerId, noticeHours);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      navigation.goBack();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      flash(toUserMessage(e, 'Could not save your changes.', 'PoliciesScreen.save'), 'error');
    } finally {
      setSaving(false);
    }
  }, [userId, providerId, policies, imageEdges, loadedNotice, carriedPolicies, loadFailed, navigation, isLinkOnly]);

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
      <FocusAwareStatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ImageCropModal
        uri={policyImageToCrop}
        accent={C.accent}
        onAccent={C.onAccent}
        onCancel={handlePolicyImageCropCancelled}
        onDone={handlePolicyImageCropped}
      />
      <SafeAreaView style={s.safe} edges={['top']}>
        <KeyboardDismissView style={{ flex: 1 }}>
          <View style={[s.header, { borderBottomColor: C.border }]}>
            <Text style={[s.headerTitle, { color: C.text }]}>{isLinkOnly ? 'Policies' : 'Policies & Info'}</Text>
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

            {isLinkOnly && (
              <Card title="Your own policies" sub="These show on your profile so clients know them before they book. Clients book and pay on your own booking site, so CERVICED doesn't apply them or charge anything.">{null}</Card>
            )}

            {/* Every card opens with one plain line saying what it sets up,
                so a provider never has to guess from the pills alone. */}
            <Card title="Cancellation" sub={isLinkOnly ? 'How much notice you ask clients to give before they cancel.' : "How much notice clients give, and what happens if it's late."}>
              <SectionLabel text="Notice required" />
              <Pills
                options={[{ v: 'none', l: 'None' }, { v: '12h', l: '12h' }, { v: '24h', l: '24h' }, { v: '48h', l: '48h' }, { v: '72h', l: '72h' }]}
                value={policies.cancelNotice}
                onChange={v => setPolicy('cancelNotice', v)}
              />
              {!isLinkOnly && (<>
                <SectionLabel text="If cancelled late" />
                <Pills
                  options={[{ v: 'none', l: 'No penalty' }, { v: 'deposit', l: 'Deposit kept' }, { v: 'half', l: 'Half the price' }]}
                  value={policies.cancelPenalty}
                  onChange={v => setPolicy('cancelPenalty', v)}
                />
                {policies.cancelPenalty === 'deposit' && (
                  <Text style={[capSt.note, { color: C.text }]}>If they paid in full, you can only charge up to half the service price.</Text>
                )}
                {policies.cancelPenalty === 'half' && (
                  <Text style={[capSt.note, { color: C.text }]}>The app works out the amount for each booking. You don't type anything.</Text>
                )}
                {/* The detail, folded away: it's there when wanted, not in the way. */}
                {opened['cancelHow'] && (
                  <>
                    {policies.cancelPenalty === 'deposit' && (
                      <Text style={[s.cardSub, { color: C.sub, marginTop: 10, marginBottom: 0 }]}>If they paid a deposit, you keep the deposit.</Text>
                    )}
                    {policies.cancelPenalty === 'half' && (
                      <>
                        <Text style={[s.cardSub, { color: C.sub, marginTop: 10, marginBottom: 0 }]}>Paid in full: you keep half and they get the rest back.</Text>
                        <Text style={[s.cardSub, { color: C.sub, marginTop: 6, marginBottom: 0 }]}>Paid a deposit: you keep the deposit. If it's less than half the price and they agreed at checkout, you can also charge their saved card the difference, from the booking, until 24 hours after the appointment would have ended. Bookings made before 13 November keep the policy they were booked with.</Text>
                      </>
                    )}
                    <Text style={[s.cardSub, { color: C.sub, marginTop: 10, marginBottom: 0 }]}>A change applies to new bookings. Bookings already made keep the notice they were booked with.</Text>
                  </>
                )}
              </>)}
              {shows('cancelNote') && (
                <Field label="Note (optional)" value={policies.cancelNote} onChange={v => setPolicy('cancelNote', v)} placeholder="e.g. cancellations via message only" />
              )}
              <View style={linkSt.row}>
                {!isLinkOnly && <TextLink label={opened['cancelHow'] ? 'Hide' : 'How this works ›'} onPress={() => toggle('cancelHow')} />}
                {!shows('cancelNote') && <TextLink label="+ Add a note" onPress={() => open('cancelNote')} />}
              </View>
            </Card>

            <Card title="Rescheduling" sub="Notice, how many times, and to when.">
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
              <SectionLabel text="New date must be" />
              <Pills
                options={[{ v: 'any', l: 'Any date' }, { v: 'same_month', l: 'Same month' }]}
                value={policies.rescheduleWithin}
                onChange={v => setPolicy('rescheduleWithin', v)}
              />
              {policies.rescheduleWithin === 'same_month' && (
                <Text style={[s.cardSub, { color: C.sub, marginTop: 6, marginBottom: 0 }]}>Clients can only move it to another day in the same calendar month. A booking on the 14th can move up to the last day of that month.</Text>
              )}
              {shows('rescheduleNote')
                ? <Field label="Note (optional)" value={policies.rescheduleNote} onChange={v => setPolicy('rescheduleNote', v)} />
                : <View style={linkSt.row}><TextLink label="+ Add a note" onPress={() => open('rescheduleNote')} /></View>}
            </Card>

            {!isLinkOnly && (<>
              {/* Deposits live on Business Profile → Payments now, not here. */}
              {/* One grace period, kept under noShowGraceMinutes: checkout quotes it
                  beside the late fee, and provider_update_booking_status() won't
                  accept a no-show until it has passed. */}
              <Card title="Late" sub="How long a client can be late, and the fee after that. Leave the fee blank for no fee.">
                <Field
                  label="Grace period (minutes)"
                  value={policies.noShowGraceMinutes}
                  onChange={v => setPolicy('noShowGraceMinutes', v.replace(/[^0-9]/g, ''))}
                  placeholder="e.g. 15"
                  keyboardType="phone-pad"
                  note="How long after the booked start time before a client counts as late. You can't mark a No Show until this has passed. 0 = no grace period."
                />
                <Field
                  label="Late arrival fee (£)"
                  value={policies.lateFee}
                  onChange={v => setPolicy('lateFee', v.replace(/[^0-9.]/g, ''))}
                  placeholder="e.g. 10"
                  keyboardType="decimal-pad"
                  note="For arriving after your grace period above."
                />
                <HalfPriceCap />
                {opened['lateHow'] && (
                  <Text style={[s.cardSub, { color: C.sub, marginTop: 8, marginBottom: 0 }]}>{FEE_CHARGE_NOTE}</Text>
                )}
                <View style={linkSt.row}>
                  <TextLink label={opened['lateHow'] ? 'Hide' : 'How fees are charged ›'} onPress={() => toggle('lateHow')} />
                </View>
              </Card>

              <Card title="No-show" sub="What happens when a client doesn't turn up.">
                <SectionLabel text="Action" />
                <Pills
                  options={[
                    { v: 'none', l: 'No action' },
                    { v: 'warn', l: 'Warn client' },
                    { v: 'charge_deposit', l: 'Keep deposit' },
                    { v: 'half', l: 'Half the price' },
                  ]}
                  value={policies.noShowAction}
                  onChange={v => setPolicy('noShowAction', v)}
                />
                {policies.noShowAction === 'half' && (
                  <>
                    <Text style={[capSt.note, { color: C.text }]}>The app works out the amount for each booking. You don't type anything.</Text>
                    {opened['noShowHow'] && (
                      <>
                        <Text style={[s.cardSub, { color: C.sub, marginTop: 10, marginBottom: 0 }]}>Paid a deposit: you keep the deposit. If it's less than half the price and they agreed at checkout, you can also charge their saved card the difference, from the booking, after you mark the no-show.</Text>
                        <Text style={[s.cardSub, { color: C.sub, marginTop: 6, marginBottom: 0 }]}>Paid in full: nothing more is charged.</Text>
                        <Text style={[s.cardSub, { color: C.sub, marginTop: 8, marginBottom: 0 }]}>{FEE_CHARGE_NOTE}</Text>
                      </>
                    )}
                  </>
                )}
                {shows('noShowNote') && (
                  <Field label="Note (optional)" value={policies.noShowNote} onChange={v => setPolicy('noShowNote', v)} />
                )}
                <View style={linkSt.row}>
                  {policies.noShowAction === 'half' && <TextLink label={opened['noShowHow'] ? 'Hide' : 'How this works ›'} onPress={() => toggle('noShowHow')} />}
                  {!shows('noShowNote') && <TextLink label="+ Add a note" onPress={() => open('noShowNote')} />}
                </View>
              </Card>
            </>)}

            {/* A provider who takes bookings in the app sets this beside their
                deposit, in Payments. A link-only provider has no deposits there,
                so it stays here for them as a line on their profile. */}
            {isLinkOnly && (
              <Card
                title="Non-Refundable Deposit"
                sub="Tell clients if a booking needs a non-refundable deposit. Shown on your profile. Clients pay on your own booking site, so CERVICED doesn't apply it or take any money."
              >
                <ToggleRow
                  label="Do you require a non-refundable deposit to secure bookings?"
                  value={policies.depositNonRefundable}
                  onChange={v => setPolicy('depositNonRefundable', v)}
                />
              </Card>
            )}

            {/* Refund policy — free-text disclosure only. This app has no
                refund-processing infra, so there is deliberately no
                percentage/amount field here that would imply the app
                calculates or enforces a refund automatically. */}
            <Card title="Refund Policy" sub={isLinkOnly ? 'When you give refunds, in your own words, so clients know before they book. Shown on your profile (optional).' : 'When you give refunds, in your own words, so clients know before they book. Shown on their booking (optional).'}>
              <Field
                label="Your refund policy"
                value={policies.refundPolicyNote}
                onChange={v => setPolicy('refundPolicyNote', v)}
                placeholder='e.g. "Refunds considered case-by-case, contact me directly"'
                multiline
              />
            </Card>

            {/* Shown on CERVICED bookings, which link-only pros don't have. */}
            {!isLinkOnly && (
              <Card title="Your Instructions" sub="Shown in their booking details and in the reminder the day before, like arriving early or what to bring (optional). Directions and door codes go beside your address. Changes apply to new bookings.">
                <Field
                  label="Instructions"
                  value={policies.bookingInstructions}
                  onChange={v => setPolicy('bookingInstructions', v)}
                  placeholder="Write your own or tap a suggestion below"
                  multiline
                />
                <ChipGroup
                  options={BOOKING_INSTRUCTION_SUGGESTIONS}
                  selected={selectedBookingInstructions(policies.bookingInstructions)}
                  onToggle={line => setPolicy('bookingInstructions', toggleBookingInstruction(policies.bookingInstructions, line))}
                />
              </Card>
            )}

            {/* Written policies only, shown on the profile. Neither one changes
                what a client can book or pay in the app, so the placeholders
                stay away from money: a charge written here would be an
                off-app charge the checkout knows nothing about (see the
                deposit/balance liability boundary in CLAUDE.md). */}
            {/* The one place a mobile provider says how far they travel —
                there is no separate distance field elsewhere (Edit Profile's
                "How far you travel" / providers.travel_radius was removed so
                the distance is stated once). */}
            {shows('travelPolicy') && (
              <Card title="Travel" sub="If you travel to clients: how far you go and anything they should know first. Shown on your profile (optional).">
                <Field
                  label="Your travel policy"
                  value={policies.travelPolicy}
                  onChange={v => setPolicy('travelPolicy', v)}
                  placeholder='e.g. "I travel up to 10 miles and need somewhere to set up with a plug socket"'
                  multiline
                />
              </Card>
            )}
            {shows('emergencyBookingPolicy') && (

              <Card title="Emergency Appointments" sub="Whether you take emergency appointments and how a client should ask. Shown on your profile (optional). Clients contact you to arrange one, it can't be booked directly.">
                <Field
                  label="Your emergency appointment policy"
                  value={policies.emergencyBookingPolicy}
                  onChange={v => setPolicy('emergencyBookingPolicy', v)}
                  placeholder="e.g. I only take emergencies from existing clients, message me and I'll let you know if I can fit you in"
                  multiline
                />
              </Card>
            )}
            {(!shows('travelPolicy') || !shows('emergencyBookingPolicy')) && (
              <View style={addSt.wrap}>
                <SectionLabel text="Add if you need them" />
                <View style={addSt.row}>
                  {!shows('travelPolicy') && (
                    <TouchableOpacity style={[addSt.chip, { borderColor: C.border }]} onPress={() => { Haptics.selectionAsync().catch(() => {}); open('travelPolicy'); }} activeOpacity={0.7} accessibilityRole="button">
                      <Text style={[addSt.chipText, { color: C.accentText }]}>+ Travel</Text>
                    </TouchableOpacity>
                  )}
                  {!shows('emergencyBookingPolicy') && (
                    <TouchableOpacity style={[addSt.chip, { borderColor: C.border }]} onPress={() => { Haptics.selectionAsync().catch(() => {}); open('emergencyBookingPolicy'); }} activeOpacity={0.7} accessibilityRole="button">
                      <Text style={[addSt.chipText, { color: C.accentText }]}>+ Emergency appointments</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            <Card title="Detailed Policy Images" sub={`Pages of your full policy, like a house-rules sheet or consent form. Up to ${MAX_POLICY_IMAGES}, in reading order. Clients can zoom in (optional).`}>
              <View style={imgSt.grid}>
                {policies.policyImageUrls.map((url, index) => (
                  <View key={url} style={imgSt.thumbWrap}>
                    <Image source={{ uri: url }} style={[imgSt.thumb, { backgroundColor: C.border }]} resizeMode="contain" fadeDuration={0} />
                    <Text style={[imgSt.pageNo, { color: C.sub }]}>Page {index + 1}</Text>
                    <TouchableOpacity
                      style={imgSt.removeBtn}
                      onPress={() => handleRemovePolicyImage(url)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove page ${index + 1}`}
                    >
                      <Text style={imgSt.removeText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {policies.policyImageUrls.length < MAX_POLICY_IMAGES && (
                  <TouchableOpacity
                    style={[imgSt.addTile, { borderColor: C.border }]}
                    onPress={handlePickPolicyImage}
                    disabled={policyImageUploading || policyImageToCrop !== null}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Add policy images"
                  >
                    {policyImageUploading ? (
                      <ActivityIndicator size="small" color={C.accent} />
                    ) : (
                      <>
                        <Text style={[imgSt.addPlus, { color: C.sub }]}>+</Text>
                        <Text style={[imgSt.addText, { color: C.sub }]}>{policies.policyImageUrls.length > 0 ? 'Add more' : 'Add Images'}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
              {policies.policyImageUrls.length > 0 && (
                <Text style={[imgSt.count, { color: C.sub }]}>
                  {policyImageUploading ? 'UPLOADING…' : `${policies.policyImageUrls.length} OF ${MAX_POLICY_IMAGES}`}
                </Text>
              )}
            </Card>

            {/* Additional Information, read-only: a preview of the profile
                section, built by the same helper the profile uses. Each part
                is set on another screen, so this only points there. */}
            {!isLinkOnly && infoPreview && (
              <Card title="Additional Information">
                <View style={[infoSt.preview, { backgroundColor: C.surface }]}>
                  <View style={infoSt.eyebrowRow}>
                    <Ionicons name="eye-outline" size={13} color={C.sub} />
                    <Text style={[infoSt.eyebrow, { color: C.sub }]}>AS CLIENTS SEE IT</Text>
                  </View>
                  {infoPreview.groups.map(group => (
                    <View key={group.label}>
                      <Text style={[infoSt.label, { color: C.sub }]}>{group.label}</Text>
                      <View style={infoSt.chips}>
                        {group.chips.map(chip => (
                          <View key={chip} style={[infoSt.chip, { borderColor: `${C.accent}40`, backgroundColor: `${C.accent}14` }]}>
                            <Text style={[infoSt.chipText, { color: C.text }]}>{chip}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                  {([
                    ['Qualifications', infoPreview.qualifications],
                    ['Good to know', infoPreview.goodToKnow],
                    ['How to get there', infoPreview.directions],
                  ] as const).filter(([, text]) => text).map(([label, text]) => (
                    <View key={label}>
                      <Text style={[infoSt.label, { color: C.sub }]}>{label}</Text>
                      <Text style={[infoSt.text, { color: C.text }]}>{text}</Text>
                    </View>
                  ))}
                  {infoPreview.groups.length === 0 && !infoPreview.qualifications && !infoPreview.goodToKnow && !infoPreview.directions && (
                    <Text style={[infoSt.text, { color: C.sub, marginTop: 8 }]}>Nothing here yet. Add details in the places below and they'll show on your profile.</Text>
                  )}
                </View>
                <Text style={[s.cardSub, { color: C.sub, marginTop: 12, marginBottom: 8 }]}>To change any of this, go to:</Text>
                <View style={infoSt.chips}>
                  {INFO_SOURCES.map(({ route, label }) => (
                    <TouchableOpacity
                      key={route}
                      style={[infoSt.go, { backgroundColor: C.surface, borderColor: C.border }]}
                      onPress={() => openSetting(route)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Change in ${label}`}
                    >
                      <Text style={[infoSt.goText, { color: C.accentText }]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Card>
            )}

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
                {termsAcknowledged && <Ionicons name="checkmark" size={13} color={C.onAccent} />}
              </View>
              <Text style={[termsSt.text, { color: C.text }]}>
                I agree to the{' '}
                <Text style={[termsSt.link, { color: C.accent }]} onPress={() => openLegalPage('provider-terms')}>
                  Terms &amp; Conditions
                </Text>
              </Text>
            </TouchableOpacity>

            <SaveButton saving={saving} onPress={handleSave} />
          </ScrollView>
        </KeyboardDismissView>
      </SafeAreaView>

    </View>
  );
}

const linkSt = StyleSheet.create({
  row:  { flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 12 },
  wrap: { paddingVertical: 2 },
  text: { fontFamily: 'BakbakOne-Regular', fontSize: 12 },
});

const addSt = StyleSheet.create({
  wrap:     { marginBottom: 14, paddingHorizontal: 2 },
  row:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:     { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 20, paddingHorizontal: 13, paddingVertical: 8 },
  chipText: { fontFamily: 'BakbakOne-Regular', fontSize: 12.5 },
});

const infoSt = StyleSheet.create({
  preview:    { borderRadius: 14, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 14, marginTop: 8 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10 },
  eyebrow:    { fontFamily: 'BakbakOne-Regular', fontSize: 10, letterSpacing: 1 },
  label:      { fontFamily: 'BakbakOne-Regular', fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 12, marginBottom: 6 },
  chips:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:       { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  chipText:   { fontFamily: 'Jura-VariableFont_wght', fontWeight: '600', fontSize: 12 },
  text:       { fontFamily: 'Jura-VariableFont_wght', fontWeight: '600', fontSize: 13, lineHeight: 19 },
  go:         { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  goText:     { fontFamily: 'BakbakOne-Regular', fontSize: 12 },
});

const capSt = StyleSheet.create({
  note: { fontFamily: 'Jura-VariableFont_wght', fontWeight: '700', fontSize: 13, lineHeight: 18, marginTop: 8 },
});

const termsSt = StyleSheet.create({
  box:      { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 14 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  text:     { flex: 1, fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '600' },
  link:     { fontWeight: '800', textDecorationLine: 'underline' },
});

const imgSt = StyleSheet.create({
  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbWrap: { position: 'relative', width: 120 },
  thumb:     { width: 120, height: 180, borderRadius: 14 },
  uploading: { ...StyleSheet.absoluteFill, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  removeBtn: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  removeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  pageNo:    { fontSize: 10, fontWeight: '600', textAlign: 'center', marginTop: 4 },
  count:     { fontFamily: 'BakbakOne-Regular', fontSize: 11, marginTop: 10 },
  addTile:   { width: 84, height: 84, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addPlus:   { fontSize: 22, fontWeight: '300', lineHeight: 24 },
  addText:   { fontFamily: 'Jura-VariableFont_wght', fontWeight: '600', fontSize: 9, marginTop: 2 },
});
